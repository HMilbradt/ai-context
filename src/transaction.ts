import { randomUUID } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readlink,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { assertExistingPathSafe } from "./paths.js";
import type { FileOperation } from "./types.js";

interface ApplyFileTransactionInput {
  home: string;
  stateDir: string;
  operations: FileOperation[];
  failAfter?: number;
}

interface AppliedOperation {
  destination: string;
  backupPath: string | null;
}

export interface FileTransactionResult {
  backupDir: string;
  rollback: () => Promise<void>;
}

async function pathInfo(candidate: string) {
  try {
    return await lstat(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function copyEntry(source: string, destination: string): Promise<void> {
  const info = await lstat(source);
  await mkdir(path.dirname(destination), { recursive: true });
  if (info.isSymbolicLink()) {
    await symlink(await readlink(source), destination);
    return;
  }
  if (!info.isFile()) {
    throw new Error(`Cannot back up non-file destination: ${source}`);
  }
  await copyFile(source, destination);
  await chmod(destination, info.mode & 0o777);
}

async function removeIfPresent(candidate: string): Promise<void> {
  if (await pathInfo(candidate)) {
    await unlink(candidate);
  }
}

function backupPathFor(home: string, backupDir: string, destination: string): string {
  const relative = path.relative(home, destination);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Cannot back up destination outside home: ${destination}`);
  }
  return path.join(backupDir, relative);
}

export async function applyFileTransaction(
  input: ApplyFileTransactionInput,
): Promise<FileTransactionResult> {
  const suffix = `${new Date().toISOString().replace(/[:.]/gu, "-")}-${process.pid}-${randomUUID()}`;
  const backupDir = path.join(input.stateDir, "backups", suffix);
  const staged = new Map<number, string>();
  const applied: AppliedOperation[] = [];

  for (const [index, operation] of input.operations.entries()) {
    await assertExistingPathSafe(input.home, operation.destination);
    if (operation.type === "write") {
      await mkdir(path.dirname(operation.destination), { recursive: true });
      const temporary = path.join(
        path.dirname(operation.destination),
        `.${path.basename(operation.destination)}.aiconf-${randomUUID()}.tmp`,
      );
      await writeFile(temporary, operation.content, { flag: "wx", mode: operation.mode });
      await chmod(temporary, operation.mode);
      staged.set(index, temporary);
    }
  }

  const rollback = async (): Promise<void> => {
    for (const item of [...applied].reverse()) {
      await removeIfPresent(item.destination);
      if (item.backupPath) {
        await copyEntry(item.backupPath, item.destination);
      }
    }
  };

  try {
    for (const [index, operation] of input.operations.entries()) {
      if (input.failAfter !== undefined && applied.length === input.failAfter) {
        throw new Error("Injected transaction failure");
      }
      const existing = await pathInfo(operation.destination);
      const backupPath = existing ? backupPathFor(input.home, backupDir, operation.destination) : null;
      if (backupPath) {
        await copyEntry(operation.destination, backupPath);
      }

      if (operation.type === "write") {
        const temporary = staged.get(index);
        if (!temporary) {
          throw new Error(`Missing staged file for ${operation.destination}`);
        }
        await rename(temporary, operation.destination);
        staged.delete(index);
      } else if (existing) {
        await unlink(operation.destination);
      }
      applied.push({ destination: operation.destination, backupPath });
    }
  } catch (error) {
    await rollback();
    throw error;
  } finally {
    await Promise.all([...staged.values()].map((temporary) => rm(temporary, { force: true })));
  }

  return { backupDir, rollback };
}
