import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { valid as validSemver } from "semver";
import * as tar from "tar";

import { assertToolTargetPath, isSafeRelativePath } from "../src/paths.js";
import {
  TOOL_TARGETS,
  type ArtifactTarget,
  type BundleArtifactV1,
  type BundleManifestV1,
  type SourceArtifactV1,
  type SourceManifestV1,
} from "../src/types.js";

function hash(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function target(value: unknown): ArtifactTarget {
  if (!isRecord(value) || typeof value.tool !== "string" || typeof value.path !== "string") {
    throw new Error("Source manifest target is malformed");
  }
  if (!TOOL_TARGETS.includes(value.tool as ArtifactTarget["tool"])) {
    throw new Error(`Unsupported source manifest tool: ${value.tool}`);
  }
  if (!isSafeRelativePath(value.path)) {
    throw new Error(`Unsafe source manifest target path: ${value.path}`);
  }
  const tool = value.tool as ArtifactTarget["tool"];
  assertToolTargetPath(tool, value.path);
  return { tool, path: value.path };
}

function source(value: unknown): SourceArtifactV1 {
  if (!isRecord(value)) {
    throw new Error("Source manifest artifact is malformed");
  }
  if (
    typeof value.id !== "string" ||
    (value.kind !== "file" && value.kind !== "tree") ||
    typeof value.source !== "string" ||
    !Number.isInteger(value.mode) ||
    !Array.isArray(value.targets)
  ) {
    throw new Error("Source manifest artifact is malformed");
  }
  if (!isSafeRelativePath(value.source)) {
    throw new Error(`Unsafe source path: ${value.source}`);
  }
  const mode = value.mode as number;
  if (mode < 0 || mode > 0o777) {
    throw new Error(`Invalid source mode for ${value.id}`);
  }
  return {
    id: value.id,
    kind: value.kind,
    source: value.source,
    mode,
    targets: value.targets.map(target),
  };
}

export function validateSourceManifest(value: unknown): SourceManifestV1 {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.version !== "string" ||
    typeof value.minimumCliVersion !== "string" ||
    !Array.isArray(value.sources)
  ) {
    throw new Error("Source manifest schema is invalid");
  }
  if (!validSemver(value.version) || !validSemver(value.minimumCliVersion)) {
    throw new Error("Source manifest versions must use semantic versioning");
  }
  const sources = value.sources.map(source);
  if (new Set(sources.map((item) => item.id)).size !== sources.length) {
    throw new Error("Source manifest artifact ids must be unique");
  }
  return {
    schemaVersion: 1,
    version: value.version,
    minimumCliVersion: value.minimumCliVersion,
    sources,
  };
}

async function walkRegularFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(directory: string, prefix: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = path.posix.join(prefix, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Source trees cannot contain symlinks: ${absolute}`);
      }
      if (entry.isDirectory()) {
        await walk(absolute, relative);
      } else if (entry.isFile()) {
        result.push(relative);
      } else {
        throw new Error(`Source trees may contain only files and directories: ${absolute}`);
      }
    }
  }
  await walk(root, "");
  return result;
}

function appendTarget(target: ArtifactTarget, relative: string): ArtifactTarget {
  return {
    tool: target.tool,
    path: relative ? path.posix.join(target.path, relative) : target.path,
  };
}

export async function buildBundle(
  repositoryRoot: string,
  outputDir = path.join(repositoryRoot, "dist/release"),
): Promise<{ archivePath: string; checksumPath: string; manifest: BundleManifestV1 }> {
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  ) as { version?: unknown };
  const sourceManifest = validateSourceManifest(
    JSON.parse(await readFile(path.join(repositoryRoot, "aiconf.manifest.json"), "utf8")) as unknown,
  );
  if (packageJson.version !== sourceManifest.version) {
    throw new Error(
      `Package version ${String(packageJson.version)} does not match manifest version ${sourceManifest.version}`,
    );
  }

  await mkdir(outputDir, { recursive: true });
  const stage = await mkdtemp(path.join(tmpdir(), "aiconf-bundle-"));
  const fileRoot = path.join(stage, "files");
  await mkdir(fileRoot);
  const artifacts: BundleArtifactV1[] = [];
  const destinationKeys = new Set<string>();

  try {
    for (const definition of sourceManifest.sources) {
      const absoluteSource = path.resolve(repositoryRoot, definition.source);
      const sourceRelative = path.relative(repositoryRoot, absoluteSource);
      if (sourceRelative.startsWith("..") || path.isAbsolute(sourceRelative)) {
        throw new Error(`Source escapes repository: ${definition.source}`);
      }
      const info = await lstat(absoluteSource);
      if (info.isSymbolicLink()) {
        throw new Error(`Source cannot be a symlink: ${definition.source}`);
      }
      const relativeFiles = definition.kind === "tree" ? await walkRegularFiles(absoluteSource) : [""];
      if (definition.kind === "file" && !info.isFile()) {
        throw new Error(`File source is not a regular file: ${definition.source}`);
      }

      for (const relative of relativeFiles) {
        const sourcePath = relative
          ? path.posix.join(definition.source, relative)
          : definition.source;
        const absoluteFile = relative ? path.join(absoluteSource, relative) : absoluteSource;
        const content = await readFile(absoluteFile);
        const index = artifacts.length.toString().padStart(4, "0");
        const bundlePath = `files/${index}`;
        const outputPath = path.join(stage, bundlePath);
        await writeFile(outputPath, content, { mode: definition.mode });
        await chmod(outputPath, definition.mode);
        const targets = definition.targets.map((item) => appendTarget(item, relative));
        for (const item of targets) {
          const key = `${item.tool}:${item.path}`;
          if (destinationKeys.has(key)) {
            throw new Error(`Duplicate expanded destination: ${key}`);
          }
          destinationKeys.add(key);
        }
        artifacts.push({
          id: relative ? `${definition.id}/${relative}` : definition.id,
          sourcePath,
          bundlePath,
          mode: definition.mode,
          sha256: hash(content),
          targets,
        });
      }
    }

    const manifest: BundleManifestV1 = {
      schemaVersion: 1,
      version: sourceManifest.version,
      minimumCliVersion: sourceManifest.minimumCliVersion,
      artifacts,
    };
    await writeFile(path.join(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

    const archiveName = `aiconf-v${manifest.version}.tar.gz`;
    const archivePath = path.join(outputDir, archiveName);
    const checksumPath = `${archivePath}.sha256`;
    await rm(archivePath, { force: true });
    await rm(checksumPath, { force: true });
    await tar.c(
      {
        cwd: stage,
        file: archivePath,
        gzip: true,
        portable: true,
        mtime: new Date(0),
        noMtime: false,
      },
      ["manifest.json", "files"],
    );
    const archiveHash = hash(await readFile(archivePath));
    await writeFile(checksumPath, `${archiveHash}  ${archiveName}\n`);
    return { archivePath, checksumPath, manifest };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  const repositoryRoot = process.cwd();
  const result = await buildBundle(repositoryRoot);
  process.stdout.write(`${result.archivePath}\n${result.checksumPath}\n`);
}
