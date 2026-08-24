import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { sha256 } from "../src/hash.js";
import { buildChangePlan } from "../src/planner.js";
import type {
  ManagedStateV1,
  ResolvedArtifact,
  ToolTarget,
} from "../src/types.js";

function artifact(
  content: string,
  targetPath = ".codex/AGENTS.md",
  tool: ToolTarget = "codex",
): ResolvedArtifact {
  const buffer = Buffer.from(content);
  return {
    id: "instructions",
    sourcePath: ".agents/AGENTS.md",
    mode: 0o644,
    sha256: sha256(buffer),
    content: buffer,
    targets: [{ tool, path: targetPath }],
  };
}

function state(
  targetPath: string,
  installedContent: string,
  tool: ToolTarget = "codex",
): ManagedStateV1 {
  return {
    schemaVersion: 1,
    installedVersion: "0.1.0",
    lastCheckedVersion: "0.1.0",
    tools: ["codex"],
    managed: {
      [`${tool}:${targetPath}`]: {
        artifactId: "instructions",
        tool,
        path: targetPath,
        sha256: sha256(Buffer.from(installedContent)),
        mode: 0o644,
      },
    },
  };
}

async function homeWith(content?: string): Promise<string> {
  const home = await mkdtemp(path.join(tmpdir(), "aiconf-plan-"));
  if (content !== undefined) {
    await mkdir(path.join(home, ".codex"), { recursive: true });
    await writeFile(path.join(home, ".codex/AGENTS.md"), content);
  }
  return home;
}

describe("buildChangePlan", () => {
  it("classifies a missing destination as new and recommended", async () => {
    const plan = await buildChangePlan({
      home: await homeWith(),
      artifacts: [artifact("next")],
      state: null,
      selectedTools: ["codex"],
    });
    assert.equal(plan[0]?.status, "new");
    assert.equal(plan[0]?.recommended, true);
  });

  it("classifies a matching destination as unchanged", async () => {
    const plan = await buildChangePlan({
      home: await homeWith("same"),
      artifacts: [artifact("same")],
      state: null,
      selectedTools: ["codex"],
    });
    assert.equal(plan[0]?.status, "unchanged");
  });

  it("classifies an untouched managed file as safely updatable", async () => {
    const plan = await buildChangePlan({
      home: await homeWith("old"),
      artifacts: [artifact("next")],
      state: state(".codex/AGENTS.md", "old"),
      selectedTools: ["codex"],
    });
    assert.equal(plan[0]?.status, "safely-updatable");
    assert.equal(plan[0]?.recommended, true);
  });

  it("distinguishes local modification from a three-way conflict", async () => {
    const local = await buildChangePlan({
      home: await homeWith("local"),
      artifacts: [artifact("old")],
      state: state(".codex/AGENTS.md", "old"),
      selectedTools: ["codex"],
    });
    assert.equal(local[0]?.status, "locally-modified");

    const conflict = await buildChangePlan({
      home: await homeWith("local"),
      artifacts: [artifact("upstream")],
      state: state(".codex/AGENTS.md", "old"),
      selectedTools: ["codex"],
    });
    assert.equal(conflict[0]?.status, "conflicting");
  });

  it("never allows overwriting an unmanaged script collision", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "aiconf-script-"));
    await mkdir(path.join(home, ".local/bin"), { recursive: true });
    await writeFile(path.join(home, ".local/bin/tool"), "unmanaged");
    const plan = await buildChangePlan({
      home,
      artifacts: [artifact("managed", ".local/bin/tool", "scripts")],
      state: null,
      selectedTools: [],
    });
    assert.equal(plan[0]?.status, "conflicting");
    assert.equal(plan[0]?.selectable, false);

    await writeFile(path.join(home, ".local/bin/tool"), "managed");
    const matchingPlan = await buildChangePlan({
      home,
      artifacts: [artifact("managed", ".local/bin/tool", "scripts")],
      state: null,
      selectedTools: [],
    });
    assert.equal(matchingPlan[0]?.status, "conflicting");
    assert.equal(matchingPlan[0]?.selectable, false);
  });

  it("offers an upstream removal without selecting it", async () => {
    const plan = await buildChangePlan({
      home: await homeWith("old"),
      artifacts: [],
      state: state(".codex/AGENTS.md", "old"),
      selectedTools: ["codex"],
    });
    assert.equal(plan[0]?.status, "removed-upstream");
    assert.equal(plan[0]?.recommended, false);
  });

  it("ignores artifacts for tools not selected", async () => {
    const plan = await buildChangePlan({
      home: await homeWith(),
      artifacts: [artifact("claude", ".claude/CLAUDE.md", "claude")],
      state: null,
      selectedTools: ["codex"],
    });
    assert.deepEqual(plan, []);
  });
});
