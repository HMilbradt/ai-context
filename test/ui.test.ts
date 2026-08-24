import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  defaultSelectedChangeKeys,
  renderConfigurationCoverage,
  renderConfigurationPreferences,
  runSpinnerTask,
  type SpinnerHandle,
} from "../src/ui.js";
import type { ConfigurationDefinition, PlannedChange } from "../src/types.js";

function plannedChange(overrides: Partial<PlannedChange> = {}): PlannedChange {
  return {
    key: "universal:.agents/skills/example/SKILL.md",
    configurationId: "skill.example",
    artifactId: "skill.example/SKILL.md",
    tool: "universal",
    targetPath: ".agents/skills/example/SKILL.md",
    destination: "/home/test/.agents/skills/example/SKILL.md",
    status: "new",
    operation: "write",
    currentContent: null,
    desiredContent: Buffer.from("example"),
    currentSha256: null,
    desiredSha256: "a".repeat(64),
    previousSha256: null,
    mode: 0o644,
    recommended: true,
    selectable: true,
    reason: "missing",
    ...overrides,
  };
}

const exampleConfiguration: ConfigurationDefinition = {
  id: "skill.example",
  sourcePath: ".agents/skills/example",
  selectedTools: ["codex", "claude"],
  targets: [
    { tool: "universal", path: ".agents/skills/example/SKILL.md" },
    { tool: "claude", path: ".claude/skills/example/SKILL.md" },
  ],
};

class RecordingSpinner implements SpinnerHandle {
  readonly messages: string[] = [];

  start(message: string): void {
    this.messages.push(`start:${message}`);
  }

  stop(message: string): void {
    this.messages.push(`stop:${message}`);
  }
}

describe("runSpinnerTask", () => {
  it("stops with the success message when the task finishes", async () => {
    const spinner = new RecordingSpinner();
    const result = await runSpinnerTask({
      spinner,
      startMessage: "Checking releases",
      successMessage: (value: number) => `Found ${value}`,
      failureMessage: "Release check failed",
      task: async () => 1,
    });

    assert.equal(result, 1);
    assert.deepEqual(spinner.messages, ["start:Checking releases", "stop:Found 1"]);
  });

  it("stops with the failure message before rethrowing an error", async () => {
    const spinner = new RecordingSpinner();
    const failure = new Error("HTTP 404");

    await assert.rejects(
      runSpinnerTask({
        spinner,
        startMessage: "Checking releases",
        successMessage: () => "Found release",
        failureMessage: "Release check failed",
        task: async () => {
          throw failure;
        },
      }),
      (error) => error === failure,
    );
    assert.deepEqual(spinner.messages, [
      "start:Checking releases",
      "stop:Release check failed",
    ]);
  });
});

describe("configuration review rendering", () => {
  it("shows saved choices and every applicable destination", () => {
    const output = renderConfigurationPreferences(
      [exampleConfiguration],
      { "skill.example": false },
    );

    assert.match(output, /skipped  \.agents\/skills\/example/u);
    assert.match(output, /Codex \(shared\): ~\/\.agents\/skills\/example\/SKILL\.md/u);
    assert.match(output, /Claude Code: ~\/\.claude\/skills\/example\/SKILL\.md/u);
  });

  it("groups platform status by its source configuration", () => {
    const output = renderConfigurationCoverage(
      [
        plannedChange(),
        plannedChange({
          key: "claude:.claude/skills/example/SKILL.md",
          tool: "claude",
          targetPath: ".claude/skills/example/SKILL.md",
          status: "conflicting",
        }),
      ],
      [exampleConfiguration],
    );

    assert.match(output, /^\.agents\/skills\/example/mu);
    assert.match(output, /Codex \(shared\): ~\/\.agents\/skills\/example\/SKILL\.md \(new\)/u);
    assert.match(output, /Claude Code: ~\/\.claude\/skills\/example\/SKILL\.md \(conflicting\)/u);
  });

  it("automatically selects only new files and safe updates", () => {
    const selected = defaultSelectedChangeKeys([
      plannedChange({ key: "new", status: "new" }),
      plannedChange({ key: "safe", status: "safely-updatable" }),
      plannedChange({ key: "conflict", status: "conflicting" }),
      plannedChange({ key: "unchanged", status: "unchanged" }),
    ]);

    assert.deepEqual([...selected], ["new", "safe"]);
  });
});
