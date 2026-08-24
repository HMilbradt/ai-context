import { lstat, readFile } from "node:fs/promises";

import { sha256 } from "./hash.js";
import {
  assertToolTargetPath,
  assertExistingPathSafe,
  resolveManagedDestination,
  stateKey,
} from "./paths.js";
import type {
  ChangeStatus,
  ManagedEntryV1,
  ManagedStateV1,
  PlannedChange,
  ResolvedArtifact,
  ToolTarget,
} from "./types.js";

interface BuildChangePlanInput {
  home: string;
  artifacts: ResolvedArtifact[];
  state: ManagedStateV1 | null;
  selectedTools: ToolTarget[];
}

interface CurrentFile {
  content: Buffer | null;
  hash: string | null;
}

async function readCurrent(home: string, destination: string): Promise<CurrentFile> {
  try {
    await assertExistingPathSafe(home, destination);
    const info = await lstat(destination);
    if (!info.isFile() && !info.isSymbolicLink()) {
      throw new Error(`Managed destination is not a file: ${destination}`);
    }
    const content = await readFile(destination);
    return { content, hash: sha256(content) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { content: null, hash: null };
    }
    throw error;
  }
}

function toolSelected(tool: ToolTarget, selectedTools: Set<ToolTarget>): boolean {
  return tool === "universal" || tool === "scripts" || selectedTools.has(tool);
}

function classifyDesired(
  currentHash: string | null,
  desiredHash: string,
  previous: ManagedEntryV1 | undefined,
): ChangeStatus {
  if (currentHash === desiredHash) {
    return "unchanged";
  }
  if (currentHash === null) {
    return previous ? "locally-modified" : "new";
  }
  if (!previous) {
    return "conflicting";
  }
  if (currentHash === previous.sha256) {
    return "safely-updatable";
  }
  if (desiredHash === previous.sha256) {
    return "locally-modified";
  }
  return "conflicting";
}

function reasonFor(status: ChangeStatus, scriptCollision = false): string {
  if (scriptCollision) {
    return "An unmanaged command already uses this name";
  }
  const reasons: Record<ChangeStatus, string> = {
    unchanged: "Destination already matches this release",
    new: "Destination does not exist",
    "safely-updatable": "Destination still matches the previously installed copy",
    "locally-modified": "Destination changed locally while upstream stayed unchanged",
    "removed-upstream": "A previously managed artifact is no longer in the release",
    conflicting: "Destination and upstream both differ from the installed copy",
  };
  return reasons[status];
}

export async function buildChangePlan(input: BuildChangePlanInput): Promise<PlannedChange[]> {
  const selectedTools = new Set(input.selectedTools);
  const desiredKeys = new Set<string>();
  const plan: PlannedChange[] = [];

  for (const artifact of input.artifacts) {
    for (const target of artifact.targets) {
      if (!toolSelected(target.tool, selectedTools)) {
        continue;
      }
      assertToolTargetPath(target.tool, target.path);
      const key = stateKey(target.tool, target.path);
      if (desiredKeys.has(key)) {
        throw new Error(`Duplicate planned destination: ${key}`);
      }
      desiredKeys.add(key);
      const destination = resolveManagedDestination(input.home, target.path);
      const current = await readCurrent(input.home, destination);
      const previous = input.state?.managed[key];
      const classifiedStatus = classifyDesired(current.hash, artifact.sha256, previous);
      const scriptCollision = target.tool === "scripts" && current.hash !== null && !previous;
      const status = scriptCollision ? "conflicting" : classifiedStatus;
      plan.push({
        key,
        artifactId: artifact.id,
        tool: target.tool,
        targetPath: target.path,
        destination,
        status,
        operation: status === "unchanged" ? "none" : "write",
        currentContent: current.content,
        desiredContent: artifact.content,
        currentSha256: current.hash,
        desiredSha256: artifact.sha256,
        previousSha256: previous?.sha256 ?? null,
        mode: artifact.mode,
        recommended: status === "new" || status === "safely-updatable",
        selectable: status !== "unchanged" && !scriptCollision,
        reason: reasonFor(status, scriptCollision),
      });
    }
  }

  for (const [key, previous] of Object.entries(input.state?.managed ?? {})) {
    if (desiredKeys.has(key)) {
      continue;
    }
    assertToolTargetPath(previous.tool, previous.path);
    const destination = resolveManagedDestination(input.home, previous.path);
    const current = await readCurrent(input.home, destination);
    const status: ChangeStatus =
      current.hash === null || current.hash === previous.sha256 ? "removed-upstream" : "conflicting";
    plan.push({
      key,
      artifactId: previous.artifactId,
      tool: previous.tool,
      targetPath: previous.path,
      destination,
      status,
      operation: current.hash === null ? "none" : "delete",
      currentContent: current.content,
      desiredContent: null,
      currentSha256: current.hash,
      desiredSha256: null,
      previousSha256: previous.sha256,
      mode: previous.mode,
      recommended: false,
      selectable: current.hash !== null,
      reason: reasonFor(status),
    });
  }

  return plan.sort((left, right) => left.destination.localeCompare(right.destination));
}
