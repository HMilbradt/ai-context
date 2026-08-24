import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertReleaseCompatible,
  fetchLatestReleaseInfo,
  parseGitHubRelease,
  parseSha256File,
  verifyReleaseArchive,
} from "../src/release.js";
import { sha256 } from "../src/hash.js";

describe("release metadata", () => {
  it("selects the versioned archive and checksum assets", () => {
    const release = parseGitHubRelease({
      tag_name: "v1.2.3",
      draft: false,
      prerelease: false,
      assets: [
        { name: "aiconf-v1.2.3.tar.gz", browser_download_url: "https://example/archive" },
        {
          name: "aiconf-v1.2.3.tar.gz.sha256",
          browser_download_url: "https://example/checksum",
        },
      ],
    });
    assert.equal(release.version, "1.2.3");
    assert.equal(release.archiveUrl, "https://example/archive");
  });

  it("rejects draft, prerelease, malformed, and incomplete releases", () => {
    assert.throws(
      () => parseGitHubRelease({ tag_name: "v1.0.0", draft: true, prerelease: false, assets: [] }),
      /stable release/i,
    );
    assert.throws(
      () => parseGitHubRelease({ tag_name: "next", draft: false, prerelease: false, assets: [] }),
      /semantic version/i,
    );
    assert.throws(
      () => parseGitHubRelease({ tag_name: "v1.0.0", draft: false, prerelease: false, assets: [] }),
      /release assets/i,
    );
  });

  it("parses common checksum file syntax", () => {
    const hash = "b".repeat(64);
    assert.equal(parseSha256File(`${hash}  aiconf-v1.0.0.tar.gz\n`), hash);
  });

  it("rejects an archive whose checksum does not match", () => {
    const archive = Buffer.from("archive");
    assert.doesNotThrow(() => verifyReleaseArchive(archive, sha256(archive)));
    assert.throws(() => verifyReleaseArchive(archive, "0".repeat(64)), /checksum mismatch/i);
  });

  it("rejects incompatible commands and configuration downgrades", () => {
    assert.doesNotThrow(() =>
      assertReleaseCompatible({
        cliVersion: "1.2.0",
        minimumCliVersion: "1.1.0",
        installedVersion: "1.1.0",
        releaseVersion: "1.2.0",
      }),
    );
    assert.throws(
      () =>
        assertReleaseCompatible({
          cliVersion: "1.0.0",
          minimumCliVersion: "1.1.0",
          installedVersion: null,
          releaseVersion: "1.2.0",
        }),
      /requires aiconf 1\.1\.0/i,
    );
    assert.throws(
      () =>
        assertReleaseCompatible({
          cliVersion: "1.2.0",
          minimumCliVersion: "1.1.0",
          installedVersion: "2.0.0",
          releaseVersion: "1.2.0",
        }),
      /newer than/i,
    );
  });

  it("reports an unavailable GitHub release", async () => {
    const fetcher: typeof fetch = async () => new Response("unavailable", { status: 503 });
    await assert.rejects(
      fetchLatestReleaseInfo(fetcher, "https://example.test/releases/latest"),
      /HTTP 503/i,
    );
  });
});
