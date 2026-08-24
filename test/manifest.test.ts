import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateBundleManifest } from "../src/manifest.js";
import type { BundleManifestV1 } from "../src/types.js";

function validManifest(): BundleManifestV1 {
  return {
    schemaVersion: 1,
    version: "0.1.0",
    minimumCliVersion: "0.1.0",
    artifacts: [
      {
        id: "instructions",
        sourcePath: ".agents/AGENTS.md",
        bundlePath: "files/instructions",
        mode: 0o644,
        sha256: "a".repeat(64),
        targets: [{ tool: "codex", path: ".codex/AGENTS.md" }],
      },
    ],
  };
}

describe("validateBundleManifest", () => {
  it("accepts a valid version one manifest", () => {
    assert.deepEqual(validateBundleManifest(validManifest()), validManifest());
  });

  it("rejects unsupported schemas", () => {
    const manifest = { ...validManifest(), schemaVersion: 2 };
    assert.throws(() => validateBundleManifest(manifest), /schema version/i);
  });

  it("rejects duplicate destinations", () => {
    const manifest = validManifest();
    manifest.artifacts.push({
      ...manifest.artifacts[0]!,
      id: "duplicate",
      sourcePath: ".agents/duplicate.md",
      bundlePath: "files/duplicate",
    });
    assert.throws(() => validateBundleManifest(manifest), /duplicate destination/i);
  });

  it("rejects traversal in bundle and target paths", () => {
    const bundleTraversal = validManifest();
    bundleTraversal.artifacts[0]!.bundlePath = "../outside";
    assert.throws(() => validateBundleManifest(bundleTraversal), /relative path/i);

    const targetTraversal = validManifest();
    targetTraversal.artifacts[0]!.targets[0]!.path = ".codex/../outside";
    assert.throws(() => validateBundleManifest(targetTraversal), /relative path/i);
  });

  it("rejects a destination that is incompatible with its tool", () => {
    const manifest = validManifest();
    manifest.artifacts[0]!.targets[0] = { tool: "codex", path: ".claude/CLAUDE.md" };
    assert.throws(() => validateBundleManifest(manifest), /incompatible with tool codex/i);
  });

  it("rejects malformed hashes and modes", () => {
    const badHash = validManifest();
    badHash.artifacts[0]!.sha256 = "nope";
    assert.throws(() => validateBundleManifest(badHash), /sha-256/i);

    const badMode = validManifest();
    badMode.artifacts[0]!.mode = 0o1000;
    assert.throws(() => validateBundleManifest(badMode), /mode/i);
  });
});
