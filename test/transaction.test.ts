import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { applyFileTransaction } from "../src/transaction.js";
import type { FileOperation } from "../src/types.js";

describe("applyFileTransaction", () => {
  it("creates, updates, deletes, and retains backups", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "aiconf-tx-"));
    const stateDir = path.join(home, ".local/state/aiconf");
    const updatePath = path.join(home, ".codex/AGENTS.md");
    const deletePath = path.join(home, ".claude/old.md");
    await mkdir(path.dirname(updatePath), { recursive: true });
    await mkdir(path.dirname(deletePath), { recursive: true });
    await writeFile(updatePath, "old");
    await writeFile(deletePath, "remove");

    const result = await applyFileTransaction({
      home,
      stateDir,
      operations: [
        { type: "write", destination: updatePath, content: Buffer.from("new"), mode: 0o644 },
        {
          type: "write",
          destination: path.join(home, ".local/bin/new-tool"),
          content: Buffer.from("#!/bin/sh\n"),
          mode: 0o755,
        },
        { type: "delete", destination: deletePath },
      ],
    });

    assert.equal(await readFile(updatePath, "utf8"), "new");
    assert.equal((await stat(path.join(home, ".local/bin/new-tool"))).mode & 0o777, 0o755);
    await assert.rejects(access(deletePath, constants.F_OK));
    assert.equal(await readFile(path.join(result.backupDir, ".codex/AGENTS.md"), "utf8"), "old");
    assert.equal(await readFile(path.join(result.backupDir, ".claude/old.md"), "utf8"), "remove");
  });

  it("rolls back every applied operation when a later write fails", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "aiconf-rollback-"));
    const stateDir = path.join(home, ".local/state/aiconf");
    const first = path.join(home, ".codex/AGENTS.md");
    const second = path.join(home, ".claude/CLAUDE.md");
    await mkdir(path.dirname(first), { recursive: true });
    await mkdir(path.dirname(second), { recursive: true });
    await writeFile(first, "first-old");
    await writeFile(second, "second-old");
    const operations: FileOperation[] = [
      { type: "write", destination: first, content: Buffer.from("first-new"), mode: 0o644 },
      { type: "write", destination: second, content: Buffer.from("second-new"), mode: 0o644 },
    ];

    await assert.rejects(
      applyFileTransaction({ home, stateDir, operations, failAfter: 1 }),
      /injected transaction failure/i,
    );
    assert.equal(await readFile(first, "utf8"), "first-old");
    assert.equal(await readFile(second, "utf8"), "second-old");
  });
});
