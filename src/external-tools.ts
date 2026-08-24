import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";

export async function findExecutableOnPath(
  command: string,
  pathValue: string,
): Promise<string | null> {
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    const candidate = path.resolve(directory, command);
    try {
      await access(candidate, constants.X_OK);
      if ((await stat(candidate)).isFile()) {
        return candidate;
      }
    } catch (error) {
      if (
        !["EACCES", "ENOENT", "ENOTDIR"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      ) {
        throw error;
      }
    }
  }
  return null;
}
