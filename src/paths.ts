import { constants } from "node:fs";
import { access, lstat, realpath } from "node:fs/promises";
import path from "node:path";

import type { ToolTarget } from "./types.js";

const APPROVED_ROOTS = [".agents", ".codex", ".claude", ".cursor", ".local/bin"] as const;

export interface AppPaths {
  stateDir: string;
  stateFile: string;
  cacheDir: string;
  lockFile: string;
}

export function getAppPaths(home: string, env: NodeJS.ProcessEnv): AppPaths {
  const stateBase = env.XDG_STATE_HOME || path.join(home, ".local/state");
  const cacheBase = env.XDG_CACHE_HOME || path.join(home, ".cache");
  const stateDir = path.join(stateBase, "aiconf");
  return {
    stateDir,
    stateFile: path.join(stateDir, "state.json"),
    cacheDir: path.join(cacheBase, "aiconf"),
    lockFile: path.join(stateDir, "update.lock"),
  };
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function containsTraversal(relativePath: string): boolean {
  return relativePath.split(/[\\/]+/u).some((segment) => segment === "..");
}

export function isSafeRelativePath(relativePath: string): boolean {
  return (
    relativePath.length > 0 &&
    !path.isAbsolute(relativePath) &&
    !containsTraversal(relativePath) &&
    relativePath !== "."
  );
}

const TOOL_ROOTS: Record<ToolTarget, string> = {
  universal: ".agents",
  codex: ".codex",
  claude: ".claude",
  cursor: ".cursor",
  scripts: ".local/bin",
};

export function isToolTargetPath(tool: ToolTarget, relativePath: string): boolean {
  if (!isSafeRelativePath(relativePath)) {
    return false;
  }
  const root = TOOL_ROOTS[tool];
  if (!relativePath.startsWith(`${root}/`)) {
    return false;
  }
  return tool !== "scripts" || path.posix.dirname(relativePath) === root;
}

export function assertToolTargetPath(tool: ToolTarget, relativePath: string): void {
  if (!isToolTargetPath(tool, relativePath)) {
    throw new Error(`Destination ${relativePath} is incompatible with tool ${tool}`);
  }
}

export function approvedRoots(home: string): string[] {
  return APPROVED_ROOTS.map((root) => path.resolve(home, root));
}

export function resolveManagedDestination(home: string, relativePath: string): string {
  if (!isSafeRelativePath(relativePath)) {
    throw new Error(`Destination is not a safe relative path: ${relativePath}`);
  }
  const destination = path.resolve(home, relativePath);
  if (!approvedRoots(home).some((root) => isInside(root, destination))) {
    throw new Error(`Destination is outside an approved root: ${relativePath}`);
  }
  return destination;
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await access(candidate, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function assertExistingPathSafe(home: string, destination: string): Promise<void> {
  const lexicalRoot = approvedRoots(home).find((root) => isInside(root, destination));
  if (!lexicalRoot) {
    throw new Error(`Destination is outside an approved root: ${destination}`);
  }

  const realHome = await realpath(home);
  const parentRelative = path.relative(home, path.dirname(destination));
  let parentProbe = home;
  for (const segment of parentRelative.split(path.sep).filter(Boolean)) {
    parentProbe = path.join(parentProbe, segment);
    if (await exists(parentProbe)) {
      const parentInfo = await lstat(parentProbe);
      if (parentInfo.isSymbolicLink()) {
        throw new Error(`Destination parent symlink escapes approved root: ${parentProbe}`);
      }
    }
  }
  let realRoot = lexicalRoot;
  if (await exists(lexicalRoot)) {
    realRoot = await realpath(lexicalRoot);
    if (!isInside(realHome, realRoot)) {
      throw new Error(`Approved root escapes the user's home directory: ${lexicalRoot}`);
    }
  }

  let probe = destination;
  while (!(await exists(probe)) && probe !== home) {
    probe = path.dirname(probe);
  }

  if (await exists(probe)) {
    const resolvedProbe = await realpath(probe);
    const expectedRoot = await exists(lexicalRoot) ? realRoot : realHome;
    if (!isInside(expectedRoot, resolvedProbe)) {
      throw new Error(`Destination symlink escapes approved root: ${destination}`);
    }
  }

  if (await exists(destination)) {
    const info = await lstat(destination);
    if (info.isSymbolicLink()) {
      const resolvedDestination = await realpath(destination);
      if (!isInside(realRoot, resolvedDestination)) {
        throw new Error(`Destination symlink escapes approved root: ${destination}`);
      }
    }
  }
}

export function stateKey(tool: string, targetPath: string): string {
  return `${tool}:${targetPath}`;
}
