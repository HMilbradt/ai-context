import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { findExecutableOnPath } from "../src/external-tools.js";

describe("external tool detection", () => {
  it("returns the first executable found in PATH order", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "aiconf-tool-path-"));
    const first = path.join(root, "first");
    const second = path.join(root, "second");
    await mkdir(first);
    await mkdir(second);
    const firstExecutable = path.join(first, "agent-browser");
    const secondExecutable = path.join(second, "agent-browser");
    await writeFile(firstExecutable, "#!/bin/sh\n");
    await writeFile(secondExecutable, "#!/bin/sh\n");
    await chmod(firstExecutable, 0o755);
    await chmod(secondExecutable, 0o755);

    assert.equal(
      await findExecutableOnPath("agent-browser", `${first}${path.delimiter}${second}`),
      firstExecutable,
    );
  });

  it("ignores non-executable files and reports a missing command", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "aiconf-tool-missing-"));
    await writeFile(path.join(root, "agent-browser"), "not executable\n");

    assert.equal(await findExecutableOnPath("agent-browser", root), null);
  });
});
