import assert from "node:assert/strict";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  assertExistingPathSafe,
  getAppPaths,
  resolveManagedDestination,
} from "../src/paths.js";

describe("managed paths", () => {
  it("uses XDG state and cache roots when provided", () => {
    const paths = getAppPaths("/home/test", {
      XDG_STATE_HOME: "/state",
      XDG_CACHE_HOME: "/cache",
    });
    assert.equal(paths.stateDir, "/state/aiconf");
    assert.equal(paths.cacheDir, "/cache/aiconf");
  });

  it("falls back to user-local state and cache roots", () => {
    const paths = getAppPaths("/home/test", {});
    assert.equal(paths.stateDir, "/home/test/.local/state/aiconf");
    assert.equal(paths.cacheDir, "/home/test/.cache/aiconf");
  });

  it("accepts only approved destination roots", () => {
    assert.equal(
      resolveManagedDestination("/home/test", ".codex/AGENTS.md"),
      "/home/test/.codex/AGENTS.md",
    );
    assert.equal(
      resolveManagedDestination("/home/test", ".config/opencode/AGENTS.md"),
      "/home/test/.config/opencode/AGENTS.md",
    );
    assert.throws(
      () => resolveManagedDestination("/home/test", ".ssh/config"),
      /approved root/i,
    );
  });

  it("rejects a destination symlink escaping its approved root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "aiconf-paths-"));
    const approved = path.join(root, ".codex");
    const outside = path.join(root, "outside");
    await mkdir(approved);
    await mkdir(outside);
    await writeFile(path.join(outside, "AGENTS.md"), "outside");
    await symlink(path.join(outside, "AGENTS.md"), path.join(approved, "AGENTS.md"));

    await assert.rejects(
      assertExistingPathSafe(root, path.join(approved, "AGENTS.md")),
      /escapes approved root/i,
    );
  });

  it("rejects an escaping symlink in a destination parent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "aiconf-parent-path-"));
    const outside = path.join(root, "outside");
    await mkdir(outside);
    await symlink(outside, path.join(root, ".local"));
    await assert.rejects(
      assertExistingPathSafe(root, path.join(root, ".local/bin/tool")),
      /escapes approved root|outside the user's home/i,
    );
  });
});
