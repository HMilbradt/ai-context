import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { gt as semverGt, gte as semverGte, valid as validSemver } from "semver";
import * as tar from "tar";

import { sha256 } from "./hash.js";
import { loadResolvedArtifacts, validateBundleManifest } from "./manifest.js";
import { isSafeRelativePath } from "./paths.js";
import type { BundleManifestV1, ResolvedArtifact } from "./types.js";

export const AICONF_RELEASE_API =
  "https://api.github.com/repos/HMilbradt/ai-context/releases/latest";

export interface ReleaseInfo {
  version: string;
  archiveName: string;
  archiveUrl: string;
  checksumUrl: string;
}

export interface LoadedReleaseBundle {
  info: ReleaseInfo;
  manifest: BundleManifestV1;
  artifacts: ResolvedArtifact[];
  bundleRoot: string;
}

export function assertReleaseCompatible(input: {
  cliVersion: string;
  minimumCliVersion: string;
  installedVersion: string | null;
  releaseVersion: string;
}): void {
  if (!validSemver(input.cliVersion) || !validSemver(input.minimumCliVersion)) {
    throw new Error("Command compatibility versions are invalid");
  }
  if (!validSemver(input.releaseVersion)) {
    throw new Error("Release compatibility version is invalid");
  }
  if (!semverGte(input.cliVersion, input.minimumCliVersion)) {
    throw new Error(
      `Release ${input.releaseVersion} requires aiconf ${input.minimumCliVersion} or newer`,
    );
  }
  if (input.installedVersion) {
    if (!validSemver(input.installedVersion)) {
      throw new Error("Installed configuration version is invalid");
    }
    if (semverGt(input.installedVersion, input.releaseVersion)) {
      throw new Error(
        `Installed release ${input.installedVersion} is newer than ${input.releaseVersion}`,
      );
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseGitHubRelease(value: unknown): ReleaseInfo {
  if (!isRecord(value) || value.draft !== false || value.prerelease !== false) {
    throw new Error("GitHub response is not a stable release");
  }
  if (typeof value.tag_name !== "string" || !value.tag_name.startsWith("v")) {
    throw new Error("Release tag is not a semantic version");
  }
  const version = value.tag_name.slice(1);
  if (!validSemver(version)) {
    throw new Error("Release tag is not a semantic version");
  }
  if (!Array.isArray(value.assets)) {
    throw new Error("Release assets are missing");
  }
  const archiveName = `aiconf-v${version}.tar.gz`;
  const checksumName = `${archiveName}.sha256`;
  let archiveUrl: string | null = null;
  let checksumUrl: string | null = null;
  for (const asset of value.assets) {
    if (!isRecord(asset) || typeof asset.name !== "string") {
      continue;
    }
    if (asset.name === archiveName && typeof asset.browser_download_url === "string") {
      archiveUrl = asset.browser_download_url;
    }
    if (asset.name === checksumName && typeof asset.browser_download_url === "string") {
      checksumUrl = asset.browser_download_url;
    }
  }
  if (!archiveUrl || !checksumUrl) {
    throw new Error(`Required release assets are missing for v${version}`);
  }
  return { version, archiveName, archiveUrl, checksumUrl };
}

export function parseSha256File(content: string): string {
  const match = /^([a-f0-9]{64})(?:\s+.+)?\s*$/iu.exec(content);
  if (!match?.[1]) {
    throw new Error("Release checksum file is malformed");
  }
  return match[1].toLowerCase();
}

export function verifyReleaseArchive(archive: Uint8Array, expectedHash: string): void {
  const actualHash = sha256(archive);
  if (actualHash !== expectedHash.toLowerCase()) {
    throw new Error(`Release archive checksum mismatch: expected ${expectedHash}, got ${actualHash}`);
  }
}

async function fetchOk(fetcher: typeof fetch, url: string): Promise<Response> {
  const response = await fetcher(url, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "aiconf" },
  });
  if (!response.ok) {
    throw new Error(`Request failed with HTTP ${response.status}: ${url}`);
  }
  return response;
}

export async function fetchLatestReleaseInfo(
  fetcher: typeof fetch = fetch,
  releaseApi = AICONF_RELEASE_API,
): Promise<ReleaseInfo> {
  return parseGitHubRelease(await (await fetchOk(fetcher, releaseApi)).json());
}

async function validateArchiveEntries(archivePath: string): Promise<void> {
  await tar.t({
    file: archivePath,
    strict: true,
    onentry(entry) {
      if (!isSafeRelativePath(entry.path) || !["File", "OldFile", "Directory"].includes(entry.type)) {
        throw new Error(`Unsafe release archive entry: ${entry.path}`);
      }
    },
  });
}

async function writeCacheFileAtomic(destination: string, content: Uint8Array | string): Promise<void> {
  const temporary = `${destination}.partial-${randomUUID()}`;
  try {
    await writeFile(temporary, content, { flag: "wx" });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function fetchLatestReleaseBundle(
  cacheDir: string,
  fetcher: typeof fetch = fetch,
  releaseApi = AICONF_RELEASE_API,
): Promise<LoadedReleaseBundle> {
  const info = await fetchLatestReleaseInfo(fetcher, releaseApi);
  const [archiveResponse, checksumResponse] = await Promise.all([
    fetchOk(fetcher, info.archiveUrl),
    fetchOk(fetcher, info.checksumUrl),
  ]);
  const archive = Buffer.from(await archiveResponse.arrayBuffer());
  const checksumContent = await checksumResponse.text();
  const expectedHash = parseSha256File(checksumContent);
  verifyReleaseArchive(archive, expectedHash);

  const releaseDir = path.join(cacheDir, `v${info.version}-${expectedHash.slice(0, 12)}`);
  const releaseStage = `${releaseDir}.partial-${randomUUID()}`;
  const archivePath = path.join(cacheDir, info.archiveName);
  await mkdir(cacheDir, { recursive: true });
  await writeCacheFileAtomic(archivePath, archive);
  await writeCacheFileAtomic(`${archivePath}.sha256`, checksumContent);
  await validateArchiveEntries(archivePath);
  try {
    await mkdir(releaseStage, { recursive: true });
    await tar.x({ file: archivePath, cwd: releaseStage, strict: true });

    const manifest = validateBundleManifest(
      JSON.parse(await readFile(path.join(releaseStage, "manifest.json"), "utf8")) as unknown,
    );
    if (manifest.version !== info.version) {
      throw new Error(
        `Release version ${info.version} does not match bundle version ${manifest.version}`,
      );
    }
    const artifacts = await loadResolvedArtifacts(manifest, releaseStage);
    await rm(releaseDir, { recursive: true, force: true });
    await rename(releaseStage, releaseDir);
    return { info, manifest, artifacts, bundleRoot: releaseDir };
  } finally {
    await rm(releaseStage, { recursive: true, force: true });
  }
}
