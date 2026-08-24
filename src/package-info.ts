import { readFile } from "node:fs/promises";

export async function getPackageVersion(): Promise<string> {
  const value = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
    version?: unknown;
  };
  if (typeof value.version !== "string") {
    throw new Error("Package version is missing");
  }
  return value.version;
}
