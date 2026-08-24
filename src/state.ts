import { randomUUID } from "node:crypto";
import { open, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { valid as validSemver } from "semver";

import { assertToolTargetPath, stateKey } from "./paths.js";
import { configurationIdForArtifact, targetEnabled } from "./configurations.js";
import {
  TOOL_TARGETS,
  type ManagedEntryV1,
  type ManagedStateV1,
  type PlannedChange,
  type ToolTarget,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalVersion(value: unknown, label: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || !validSemver(value)) {
    throw new Error(`State ${label} is invalid`);
  }
  return value;
}

function managedEntry(key: string, value: unknown): ManagedEntryV1 {
  if (
    !isRecord(value) ||
    typeof value.artifactId !== "string" ||
    typeof value.tool !== "string" ||
    !TOOL_TARGETS.includes(value.tool as ToolTarget) ||
    typeof value.path !== "string" ||
    typeof value.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.sha256) ||
    !Number.isInteger(value.mode) ||
    (value.mode as number) < 0 ||
    (value.mode as number) > 0o777
  ) {
    throw new Error(`Managed state entry is malformed: ${key}`);
  }
  const tool = value.tool as ToolTarget;
  assertToolTargetPath(tool, value.path);
  if (key !== stateKey(tool, value.path)) {
    throw new Error(`Managed state key does not match its destination: ${key}`);
  }
  return {
    artifactId: value.artifactId,
    tool,
    path: value.path,
    sha256: value.sha256,
    mode: value.mode as number,
  };
}

function validateState(value: unknown): ManagedStateV1 {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.tools)) {
    throw new Error("State file has an unsupported schema");
  }
  const tools = value.tools.map((tool) => {
    if (tool !== "codex" && tool !== "claude" && tool !== "cursor") {
      throw new Error(`State contains an unsupported selected tool: ${String(tool)}`);
    }
    return tool;
  });
  if (new Set(tools).size !== tools.length || !isRecord(value.managed)) {
    throw new Error("State tools or managed entries are malformed");
  }
  let configurations: Record<string, boolean> | null = null;
  if (value.configurations !== undefined) {
    if (!isRecord(value.configurations)) {
      throw new Error("State configuration preferences are malformed");
    }
    configurations = Object.fromEntries(
      Object.entries(value.configurations).map(([id, selected]) => {
        if (id.length === 0 || typeof selected !== "boolean") {
          throw new Error("State configuration preferences are malformed");
        }
        return [id, selected];
      }),
    );
  }
  return {
    schemaVersion: 1,
    installedVersion: optionalVersion(value.installedVersion, "installed version"),
    lastCheckedVersion: optionalVersion(value.lastCheckedVersion, "last checked version"),
    tools,
    configurations,
    managed: Object.fromEntries(
      Object.entries(value.managed).map(([key, entry]) => [key, managedEntry(key, entry)]),
    ),
  };
}

export function emptyState(): ManagedStateV1 {
  return {
    schemaVersion: 1,
    installedVersion: null,
    lastCheckedVersion: null,
    tools: [],
    configurations: {},
    managed: {},
  };
}

export async function readState(stateFile: string): Promise<ManagedStateV1 | null> {
  try {
    return validateState(JSON.parse(await readFile(stateFile, "utf8")) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeState(stateFile: string, state: ManagedStateV1): Promise<void> {
  await mkdir(path.dirname(stateFile), { recursive: true });
  const temporary = path.join(path.dirname(stateFile), `.state-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, stateFile);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function withStateLock<T>(lockFile: string, operation: () => Promise<T>): Promise<T> {
  await mkdir(path.dirname(lockFile), { recursive: true });
  let handle;
  try {
    handle = await open(lockFile, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      let stale = false;
      try {
        const lock = JSON.parse(await readFile(lockFile, "utf8")) as { pid?: unknown };
        if (typeof lock.pid === "number") {
          try {
            process.kill(lock.pid, 0);
          } catch (processError) {
            stale = (processError as NodeJS.ErrnoException).code === "ESRCH";
          }
        }
      } catch {
        stale = false;
      }
      if (stale) {
        await rm(lockFile, { force: true });
        return await withStateLock(lockFile, operation);
      }
      throw new Error(`Another aiconf operation is active: ${lockFile}`);
    }
    throw error;
  }
  try {
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`);
    return await operation();
  } finally {
    await handle.close();
    await rm(lockFile, { force: true });
  }
}

export function buildNextState(input: {
  previous: ManagedStateV1 | null;
  plan: PlannedChange[];
  selectedKeys: Set<string>;
  bundleVersion: string;
  tools: ToolTarget[];
  configurations: Record<string, boolean>;
}): ManagedStateV1 {
  const selectedTools = new Set(input.tools);
  const selectedConfigurationIds = new Set(
    Object.entries(input.configurations)
      .filter(([, selected]) => selected)
      .map(([id]) => id),
  );
  const next: ManagedStateV1 = {
    ...(input.previous ?? emptyState()),
    schemaVersion: 1,
    lastCheckedVersion: input.bundleVersion,
    tools: [...input.tools],
    configurations: { ...input.configurations },
    managed: Object.fromEntries(
      Object.entries(input.previous?.managed ?? {}).filter(([, entry]) =>
        selectedConfigurationIds.has(configurationIdForArtifact(entry.artifactId)) &&
        targetEnabled(entry.tool, selectedTools),
      ),
    ),
  };

  let complete = true;
  for (const change of input.plan) {
    const selected = input.selectedKeys.has(change.key);
    if (change.desiredSha256 !== null) {
      if (change.status === "unchanged" || selected) {
        next.managed[change.key] = {
          artifactId: change.artifactId,
          tool: change.tool,
          path: change.targetPath,
          sha256: change.desiredSha256,
          mode: change.mode,
        };
      } else {
        complete = false;
      }
      continue;
    }

    if ((change.operation === "none" && change.currentSha256 === null) || selected) {
      delete next.managed[change.key];
    } else {
      complete = false;
    }
  }
  next.installedVersion = complete ? input.bundleVersion : input.previous?.installedVersion ?? null;
  return next;
}
