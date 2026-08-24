import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { buildNextState, emptyState, readState, withStateLock } from "../src/state.js";
import type { PlannedChange } from "../src/types.js";

function change(overrides: Partial<PlannedChange> = {}): PlannedChange {
  return {
    key: "codex:.codex/AGENTS.md",
    configurationId: "instructions",
    artifactId: "instructions",
    tool: "codex",
    targetPath: ".codex/AGENTS.md",
    destination: "/home/test/.codex/AGENTS.md",
    status: "safely-updatable",
    operation: "write",
    currentContent: Buffer.from("old"),
    desiredContent: Buffer.from("new"),
    currentSha256: "a".repeat(64),
    desiredSha256: "b".repeat(64),
    previousSha256: "a".repeat(64),
    mode: 0o644,
    recommended: true,
    selectable: true,
    reason: "safe",
    ...overrides,
  };
}

describe("managed state", () => {
  it("does not claim a release when a conflict is skipped", () => {
    const previous = emptyState();
    previous.installedVersion = "0.1.0";
    const next = buildNextState({
      previous,
      plan: [change({ status: "conflicting", recommended: false })],
      selectedKeys: new Set(),
      bundleVersion: "0.2.0",
      tools: ["codex"],
      configurations: { instructions: true },
    });
    assert.equal(next.installedVersion, "0.1.0");
    assert.equal(next.lastCheckedVersion, "0.2.0");
  });

  it("adopts matching files and records selected updates", () => {
    const matching = change({ status: "unchanged", operation: "none" });
    const updated = change({
      key: "claude:.claude/CLAUDE.md",
      tool: "claude",
      targetPath: ".claude/CLAUDE.md",
      destination: "/home/test/.claude/CLAUDE.md",
    });
    const next = buildNextState({
      previous: null,
      plan: [matching, updated],
      selectedKeys: new Set([updated.key]),
      bundleVersion: "0.1.0",
      tools: ["codex", "claude"],
      configurations: { instructions: true },
    });
    assert.equal(next.installedVersion, "0.1.0");
    assert.equal(Object.keys(next.managed).length, 2);
  });

  it("loads legacy state without source configuration preferences", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "aiconf-state-"));
    const stateFile = path.join(root, "state.json");
    await writeFile(
      stateFile,
      JSON.stringify({
        schemaVersion: 1,
        installedVersion: "0.1.0",
        lastCheckedVersion: "0.1.0",
        tools: ["codex"],
        managed: {},
      }),
    );

    assert.equal((await readState(stateFile))?.configurations, null);
  });

  it("forgets skipped source files without scheduling their deletion", () => {
    const previous = emptyState();
    previous.managed["codex:.codex/AGENTS.md"] = {
      artifactId: "instructions",
      tool: "codex",
      path: ".codex/AGENTS.md",
      sha256: "a".repeat(64),
      mode: 0o644,
    };

    const next = buildNextState({
      previous,
      plan: [],
      selectedKeys: new Set(),
      bundleVersion: "0.2.0",
      tools: ["codex"],
      configurations: { instructions: false },
    });

    assert.deepEqual(next.managed, {});
    assert.deepEqual(next.configurations, { instructions: false });
  });

  it("forgets files belonging only to a deselected tool", () => {
    const previous = emptyState();
    previous.managed["claude:.claude/CLAUDE.md"] = {
      artifactId: "instructions",
      tool: "claude",
      path: ".claude/CLAUDE.md",
      sha256: "a".repeat(64),
      mode: 0o644,
    };

    const next = buildNextState({
      previous,
      plan: [],
      selectedKeys: new Set(),
      bundleVersion: "0.2.0",
      tools: ["codex"],
      configurations: { instructions: true },
    });

    assert.deepEqual(next.managed, {});
  });

  it("cleans a stale lock only when its process no longer exists", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "aiconf-lock-"));
    const lockFile = path.join(root, "update.lock");
    await mkdir(path.dirname(lockFile), { recursive: true });
    await writeFile(lockFile, `${JSON.stringify({ pid: 2_147_483_647 })}\n`);
    const result = await withStateLock(lockFile, async () => "acquired");
    assert.equal(result, "acquired");
  });

  it("rejects managed destinations that do not match their tool", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "aiconf-state-"));
    const stateFile = path.join(root, "state.json");
    await writeFile(
      stateFile,
      JSON.stringify({
        schemaVersion: 1,
        installedVersion: "0.1.0",
        lastCheckedVersion: "0.1.0",
        tools: ["codex"],
        managed: {
          "codex:.claude/CLAUDE.md": {
            artifactId: "instructions",
            tool: "codex",
            path: ".claude/CLAUDE.md",
            sha256: "a".repeat(64),
            mode: 0o644,
          },
        },
      }),
    );
    await assert.rejects(readState(stateFile), /incompatible with tool codex/i);
  });
});
