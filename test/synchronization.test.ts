import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { sha256 } from "../src/hash.js";
import { buildChangePlan } from "../src/planner.js";
import { buildNextState } from "../src/state.js";
import { applyFileTransaction } from "../src/transaction.js";
import type { FileOperation, ResolvedArtifact } from "../src/types.js";

describe("configuration synchronization", () => {
  it("installs one release, resolves an update conflict, and finishes clean", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "aiconf-sync-"));
    const thirdParty = path.join(home, ".agents/skills/third-party/SKILL.md");
    await mkdir(path.dirname(thirdParty), { recursive: true });
    await writeFile(thirdParty, "third party");
    const content = Buffer.from("managed instructions\n");
    const artifact: ResolvedArtifact = {
      id: "instructions",
      sourcePath: ".agents/AGENTS.md",
      mode: 0o644,
      sha256: sha256(content),
      content,
      targets: [
        { tool: "universal", path: ".agents/AGENTS.md" },
        { tool: "codex", path: ".codex/AGENTS.md" },
      ],
    };
    const plan = await buildChangePlan({
      home,
      artifacts: [artifact],
      state: null,
      selectedTools: ["codex"],
    });
    const selected = new Set(plan.filter((item) => item.recommended).map((item) => item.key));
    const operations: FileOperation[] = plan.map((item) => ({
      type: "write",
      destination: item.destination,
      content: item.desiredContent!,
      mode: item.mode,
    }));
    await applyFileTransaction({
      home,
      stateDir: path.join(home, ".local/state/aiconf"),
      operations,
    });
    const state = buildNextState({
      previous: null,
      plan,
      selectedKeys: selected,
      bundleVersion: "0.1.0",
      tools: ["codex"],
    });
    assert.equal(await readFile(thirdParty, "utf8"), "third party");
    assert.equal(await readFile(path.join(home, ".codex/AGENTS.md"), "utf8"), content.toString());
    assert.equal(state.installedVersion, "0.1.0");

    await writeFile(path.join(home, ".codex/AGENTS.md"), "local edit\n");
    const nextContent = Buffer.from("upstream edit\n");
    const nextPlan = await buildChangePlan({
      home,
      artifacts: [{ ...artifact, content: nextContent, sha256: sha256(nextContent) }],
      state,
      selectedTools: ["codex"],
    });
    assert.equal(
      nextPlan.find((item) => item.tool === "codex")?.status,
      "conflicting",
    );
    assert.equal(
      nextPlan.find((item) => item.tool === "universal")?.status,
      "safely-updatable",
    );

    const safeSelection = new Set(
      nextPlan.filter((item) => item.recommended).map((item) => item.key),
    );
    await applyFileTransaction({
      home,
      stateDir: path.join(home, ".local/state/aiconf"),
      operations: nextPlan
        .filter((item) => safeSelection.has(item.key))
        .map((item) => ({
          type: "write" as const,
          destination: item.destination,
          content: item.desiredContent!,
          mode: item.mode,
        })),
    });
    const partialState = buildNextState({
      previous: state,
      plan: nextPlan,
      selectedKeys: safeSelection,
      bundleVersion: "0.2.0",
      tools: ["codex"],
    });
    assert.equal(partialState.installedVersion, "0.1.0");

    const conflictPlan = await buildChangePlan({
      home,
      artifacts: [{ ...artifact, content: nextContent, sha256: sha256(nextContent) }],
      state: partialState,
      selectedTools: ["codex"],
    });
    const conflict = conflictPlan.find((item) => item.tool === "codex")!;
    assert.equal(conflict.status, "conflicting");
    await applyFileTransaction({
      home,
      stateDir: path.join(home, ".local/state/aiconf"),
      operations: [
        {
          type: "write",
          destination: conflict.destination,
          content: conflict.desiredContent!,
          mode: conflict.mode,
        },
      ],
    });
    const finalState = buildNextState({
      previous: partialState,
      plan: conflictPlan,
      selectedKeys: new Set([conflict.key]),
      bundleVersion: "0.2.0",
      tools: ["codex"],
    });
    const finalPlan = await buildChangePlan({
      home,
      artifacts: [{ ...artifact, content: nextContent, sha256: sha256(nextContent) }],
      state: finalState,
      selectedTools: ["codex"],
    });
    assert.equal(finalState.installedVersion, "0.2.0");
    assert.equal(finalPlan.every((item) => item.status === "unchanged"), true);
    assert.equal(await readFile(thirdParty, "utf8"), "third party");
  });
});
