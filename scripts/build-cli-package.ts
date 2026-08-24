import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { sha256 } from "../src/hash.js";

const execFileAsync = promisify(execFile);
const repositoryRoot = process.cwd();
const releaseDir = path.join(repositoryRoot, "dist/release");
const archivePath = path.join(releaseDir, "aiconf-cli.tgz");
const checksumPath = `${archivePath}.sha256`;
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

await mkdir(releaseDir, { recursive: true });
const { stdout } = await execFileAsync(
  npm,
  ["pack", "--json", "--ignore-scripts", "--pack-destination", releaseDir],
  { cwd: repositoryRoot, maxBuffer: 10 * 1024 * 1024 },
);
const packed = JSON.parse(stdout) as Array<{ filename?: unknown }>;
const filename = packed[0]?.filename;
if (typeof filename !== "string") {
  throw new Error("npm pack did not report its archive filename");
}

await rm(archivePath, { force: true });
await rm(checksumPath, { force: true });
await rename(path.join(releaseDir, filename), archivePath);
await writeFile(checksumPath, `${sha256(await readFile(archivePath))}  aiconf-cli.tgz\n`);

process.stdout.write(`${archivePath}\n${checksumPath}\n`);
