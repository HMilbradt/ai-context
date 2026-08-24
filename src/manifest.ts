import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { valid as validSemver } from "semver";

import { sha256 } from "./hash.js";
import { assertToolTargetPath, isSafeRelativePath } from "./paths.js";
import {
  TOOL_TARGETS,
  type ArtifactTarget,
  type BundleArtifactV1,
  type BundleManifestV1,
  type ResolvedArtifact,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Manifest field ${key} must be a non-empty string`);
  }
  return value;
}

function validateTarget(value: unknown): ArtifactTarget {
  if (!isRecord(value)) {
    throw new Error("Manifest target must be an object");
  }
  const tool = readString(value, "tool");
  const targetPath = readString(value, "path");
  if (!TOOL_TARGETS.includes(tool as (typeof TOOL_TARGETS)[number])) {
    throw new Error(`Unsupported tool target: ${tool}`);
  }
  if (!isSafeRelativePath(targetPath)) {
    throw new Error(`Target must be a safe relative path: ${targetPath}`);
  }
  const typedTool = tool as ArtifactTarget["tool"];
  assertToolTargetPath(typedTool, targetPath);
  return { tool: typedTool, path: targetPath };
}

function validateArtifact(value: unknown): BundleArtifactV1 {
  if (!isRecord(value)) {
    throw new Error("Manifest artifact must be an object");
  }
  const id = readString(value, "id");
  const sourcePath = readString(value, "sourcePath");
  const bundlePath = readString(value, "bundlePath");
  if (!isSafeRelativePath(sourcePath)) {
    throw new Error(`Source path must be a safe relative path: ${sourcePath}`);
  }
  if (!isSafeRelativePath(bundlePath)) {
    throw new Error(`Bundle path must be a safe relative path: ${bundlePath}`);
  }
  const mode = value.mode;
  if (!Number.isInteger(mode) || (mode as number) < 0 || (mode as number) > 0o777) {
    throw new Error(`Artifact mode is invalid for ${id}`);
  }
  const hash = readString(value, "sha256");
  if (!/^[a-f0-9]{64}$/u.test(hash)) {
    throw new Error(`Artifact SHA-256 is invalid for ${id}`);
  }
  if (!Array.isArray(value.targets) || value.targets.length === 0) {
    throw new Error(`Artifact ${id} must have at least one target`);
  }
  return {
    id,
    sourcePath,
    bundlePath,
    mode: mode as number,
    sha256: hash,
    targets: value.targets.map(validateTarget),
  };
}

export function validateBundleManifest(value: unknown): BundleManifestV1 {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("Unsupported manifest schema version");
  }
  const version = readString(value, "version");
  const minimumCliVersion = readString(value, "minimumCliVersion");
  if (!validSemver(version) || !validSemver(minimumCliVersion)) {
    throw new Error("Manifest versions must use semantic versioning");
  }
  if (!Array.isArray(value.artifacts)) {
    throw new Error("Manifest artifacts must be an array");
  }

  const artifacts = value.artifacts.map(validateArtifact);
  const artifactIds = new Set<string>();
  const destinations = new Set<string>();
  for (const artifact of artifacts) {
    if (artifactIds.has(artifact.id)) {
      throw new Error(`Duplicate artifact id: ${artifact.id}`);
    }
    artifactIds.add(artifact.id);
    for (const target of artifact.targets) {
      const key = `${target.tool}:${target.path}`;
      if (destinations.has(key)) {
        throw new Error(`Duplicate destination: ${key}`);
      }
      destinations.add(key);
    }
  }

  return {
    schemaVersion: 1,
    version,
    minimumCliVersion,
    artifacts,
  };
}

export async function loadResolvedArtifacts(
  manifest: BundleManifestV1,
  bundleRoot: string,
): Promise<ResolvedArtifact[]> {
  const artifacts: ResolvedArtifact[] = [];
  for (const artifact of manifest.artifacts) {
    const sourcePath = path.resolve(bundleRoot, artifact.bundlePath);
    const relative = path.relative(bundleRoot, sourcePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Bundle artifact escapes extraction root: ${artifact.id}`);
    }
    const info = await lstat(sourcePath);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`Bundle artifact is not a regular file: ${artifact.id}`);
    }
    const content = await readFile(sourcePath);
    const actualHash = sha256(content);
    if (actualHash !== artifact.sha256) {
      throw new Error(`Bundle artifact checksum mismatch: ${artifact.id}`);
    }
    artifacts.push({
      id: artifact.id,
      sourcePath: artifact.sourcePath,
      mode: artifact.mode,
      sha256: artifact.sha256,
      content,
      targets: artifact.targets,
    });
  }
  return artifacts;
}
