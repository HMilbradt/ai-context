import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectConfigurations,
  resolveConfigurationPreferences,
  stateForSelection,
} from "../src/configurations.js";
import { emptyState } from "../src/state.js";
import type { ResolvedArtifact } from "../src/types.js";

function artifact(input: {
  id: string;
  sourcePath: string;
  targets: ResolvedArtifact["targets"];
}): ResolvedArtifact {
  return {
    ...input,
    content: Buffer.from("content"),
    mode: 0o644,
    sha256: "a".repeat(64),
  };
}

const artifacts: ResolvedArtifact[] = [
  artifact({
    id: "global-instructions",
    sourcePath: ".agents/AGENTS.md",
    targets: [
      { tool: "universal", path: ".agents/AGENTS.md" },
      { tool: "codex", path: ".codex/AGENTS.md" },
      { tool: "claude", path: ".claude/CLAUDE.md" },
    ],
  }),
  artifact({
    id: "skill.example/SKILL.md",
    sourcePath: ".agents/skills/example/SKILL.md",
    targets: [
      { tool: "universal", path: ".agents/skills/example/SKILL.md" },
      { tool: "claude", path: ".claude/skills/example/SKILL.md" },
    ],
  }),
];

describe("source configuration preferences", () => {
  it("groups destination copies into one source configuration", () => {
    const configurations = collectConfigurations(artifacts, ["codex", "claude"]);
    const skill = configurations.find((configuration) => configuration.id === "skill.example");

    assert.equal(skill?.sourcePath, ".agents/skills/example");
    assert.deepEqual(
      skill?.targets.map((target) => target.path),
      [
        ".agents/skills/example/SKILL.md",
        ".claude/skills/example/SKILL.md",
      ],
    );
  });

  it("only includes destinations used by selected tools", () => {
    const claudeOnly = collectConfigurations(artifacts, ["claude"]);
    assert.deepEqual(
      claudeOnly.flatMap((configuration) => configuration.targets.map((target) => target.path)),
      [".claude/CLAUDE.md", ".claude/skills/example/SKILL.md"],
    );

    const cursorOnly = collectConfigurations(artifacts, ["cursor"]);
    assert.deepEqual(
      cursorOnly.flatMap((configuration) => configuration.targets.map((target) => target.path)),
      [".agents/AGENTS.md", ".agents/skills/example/SKILL.md"],
    );
  });

  it("migrates legacy partial state into selected and skipped source choices", () => {
    const state = emptyState();
    state.configurations = null;
    state.managed["universal:.agents/AGENTS.md"] = {
      artifactId: "global-instructions",
      tool: "universal",
      path: ".agents/AGENTS.md",
      sha256: "a".repeat(64),
      mode: 0o644,
    };

    assert.deepEqual(resolveConfigurationPreferences(collectConfigurations(artifacts, ["codex"]), state), {
      "global-instructions": true,
      "skill.example": false,
    });
  });

  it("keeps saved skips and selects newly released configurations", () => {
    const state = emptyState();
    state.configurations = { "global-instructions": false };

    assert.deepEqual(resolveConfigurationPreferences(collectConfigurations(artifacts, ["codex"]), state), {
      "global-instructions": false,
      "skill.example": true,
    });
  });

  it("stops managing skipped sources without deleting their files", () => {
    const state = emptyState();
    state.managed["universal:.agents/AGENTS.md"] = {
      artifactId: "global-instructions",
      tool: "universal",
      path: ".agents/AGENTS.md",
      sha256: "a".repeat(64),
      mode: 0o644,
    };
    state.managed["universal:.agents/skills/example/SKILL.md"] = {
      artifactId: "skill.example/SKILL.md",
      tool: "universal",
      path: ".agents/skills/example/SKILL.md",
      sha256: "a".repeat(64),
      mode: 0o644,
    };

    const filtered = stateForSelection(
      state,
      new Set(["skill.example"]),
      new Set(["codex"]),
    );
    assert.deepEqual(Object.keys(filtered?.managed ?? {}), [
      "universal:.agents/skills/example/SKILL.md",
    ]);
  });

  it("stops managing destinations for deselected tools", () => {
    const state = emptyState();
    state.managed["universal:.agents/AGENTS.md"] = {
      artifactId: "global-instructions",
      tool: "universal",
      path: ".agents/AGENTS.md",
      sha256: "a".repeat(64),
      mode: 0o644,
    };
    state.managed["claude:.claude/CLAUDE.md"] = {
      artifactId: "global-instructions",
      tool: "claude",
      path: ".claude/CLAUDE.md",
      sha256: "a".repeat(64),
      mode: 0o644,
    };

    const filtered = stateForSelection(
      state,
      new Set(["global-instructions"]),
      new Set(["codex"]),
    );
    assert.deepEqual(Object.keys(filtered?.managed ?? {}), [
      "universal:.agents/AGENTS.md",
    ]);
  });
});
