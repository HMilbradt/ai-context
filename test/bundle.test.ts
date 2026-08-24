import assert from "node:assert/strict";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { buildBundle } from "../scripts/build-bundle.js";
import { fetchLatestReleaseBundle } from "../src/release.js";
import { sha256 } from "../src/hash.js";

describe("release bundle", () => {
  it("builds and reloads a complete, checksummed release", async () => {
    const repositoryRoot = process.cwd();
    const output = await mkdtemp(path.join(tmpdir(), "aiconf-bundle-output-"));
    const cache = await mkdtemp(path.join(tmpdir(), "aiconf-bundle-cache-"));
    const built = await buildBundle(repositoryRoot, output);
    const archive = await readFile(built.archivePath);
    const checksum = await readFile(built.checksumPath, "utf8");
    const archiveUrl = "https://example.test/aiconf-v0.2.0.tar.gz";
    const checksumUrl = `${archiveUrl}.sha256`;
    const apiUrl = "https://example.test/releases/latest";
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url === apiUrl) {
        return Response.json({
          tag_name: "v0.2.0",
          draft: false,
          prerelease: false,
          assets: [
            { name: "aiconf-v0.2.0.tar.gz", browser_download_url: archiveUrl },
            { name: "aiconf-v0.2.0.tar.gz.sha256", browser_download_url: checksumUrl },
          ],
        });
      }
      if (url === archiveUrl) {
        return new Response(archive);
      }
      if (url === checksumUrl) {
        return new Response(checksum);
      }
      return new Response("missing", { status: 404 });
    };

    const loaded = await fetchLatestReleaseBundle(cache, fetcher, apiUrl);
    assert.equal(loaded.manifest.version, "0.2.0");
    assert.equal(loaded.artifacts.length, 4);
    assert.deepEqual(
      loaded.artifacts.map((artifact) => artifact.sourcePath),
      [
        ".agents/AGENTS.md",
        ".agents/skills/performance-first-app-builder/SKILL.md",
        ".agents/skills/react-mobx-cloudflare-app-builder/SKILL.md",
        ".agents/skills/agent-browser/SKILL.md",
      ],
    );
    assert.equal(
      loaded.artifacts.some((artifact) =>
        artifact.targets.some(
          (target) =>
            target.tool === "claude" &&
            target.path === ".claude/skills/performance-first-app-builder/SKILL.md",
        ),
      ),
      true,
    );
    assert.equal(
      loaded.artifacts.some((artifact) =>
        artifact.targets.some(
          (target) =>
            target.tool === "claude" &&
            target.path === ".claude/skills/agent-browser/SKILL.md",
        ),
      ),
      true,
    );
  });

  it("rejects a checksummed archive that is not a valid bundle", async () => {
    const cache = await mkdtemp(path.join(tmpdir(), "aiconf-malformed-cache-"));
    const archive = Buffer.from("not a tar archive");
    const archiveUrl = "https://example.test/aiconf-v0.1.0.tar.gz";
    const checksumUrl = `${archiveUrl}.sha256`;
    const apiUrl = "https://example.test/releases/latest";
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url === apiUrl) {
        return Response.json({
          tag_name: "v0.1.0",
          draft: false,
          prerelease: false,
          assets: [
            { name: "aiconf-v0.1.0.tar.gz", browser_download_url: archiveUrl },
            { name: "aiconf-v0.1.0.tar.gz.sha256", browser_download_url: checksumUrl },
          ],
        });
      }
      if (url === archiveUrl) return new Response(archive);
      if (url === checksumUrl) return new Response(`${sha256(archive)}  bundle.tar.gz\n`);
      return new Response("missing", { status: 404 });
    };
    await assert.rejects(fetchLatestReleaseBundle(cache, fetcher, apiUrl));
  });

  it("does not persist a partial archive when a download is interrupted", async () => {
    const cache = await mkdtemp(path.join(tmpdir(), "aiconf-interrupted-cache-"));
    const archiveUrl = "https://example.test/aiconf-v0.1.0.tar.gz";
    const checksumUrl = `${archiveUrl}.sha256`;
    const apiUrl = "https://example.test/releases/latest";
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url === apiUrl) {
        return Response.json({
          tag_name: "v0.1.0",
          draft: false,
          prerelease: false,
          assets: [
            { name: "aiconf-v0.1.0.tar.gz", browser_download_url: archiveUrl },
            { name: "aiconf-v0.1.0.tar.gz.sha256", browser_download_url: checksumUrl },
          ],
        });
      }
      if (url === archiveUrl) {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error("download interrupted"));
            },
          }),
        );
      }
      if (url === checksumUrl) return new Response(`${"0".repeat(64)}  bundle.tar.gz\n`);
      return new Response("missing", { status: 404 });
    };
    await assert.rejects(fetchLatestReleaseBundle(cache, fetcher, apiUrl), /interrupted/i);
    await assert.rejects(
      access(path.join(cache, "aiconf-v0.1.0.tar.gz"), constants.F_OK),
      /ENOENT/u,
    );
  });
});
