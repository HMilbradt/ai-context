import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const root = process.cwd();
const temporary = await mkdtemp(path.join(tmpdir(), "aiconf-pack-smoke-"));
const prefix = path.join(temporary, "prefix");

try {
  const archive = path.join(root, "dist/release/aiconf-cli.tgz");
  await access(archive);
  await execFileAsync(npm, ["install", "-g", "--prefix", prefix, archive], {
    cwd: temporary,
    maxBuffer: 10 * 1024 * 1024,
  });
  const executable = path.join(prefix, "bin", "aiconf");
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
    version: string;
  };
  const version = await execFileAsync(executable, ["version"]);
  if (version.stdout.trim() !== packageJson.version) {
    throw new Error(`Installed command reported ${version.stdout.trim()}`);
  }
  const help = await execFileAsync(executable, ["help"]);
  for (const command of ["setup", "update", "status", "version"]) {
    if (!help.stdout.includes(`aiconf ${command}`)) {
      throw new Error(`Installed command help is missing ${command}`);
    }
  }
  process.stdout.write(`Installed package smoke test passed for aiconf ${packageJson.version}\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
