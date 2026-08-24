import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface PackFile {
  path: string;
}

interface PackResult {
  files: PackFile[];
}

const { stdout } = await execFileAsync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["pack", "--dry-run", "--json", "--ignore-scripts"],
  { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 },
);
const parsed = JSON.parse(stdout) as unknown;
if (!Array.isArray(parsed) || parsed.length !== 1) {
  throw new Error("npm pack returned unexpected metadata");
}
const result = parsed[0] as PackResult;
if (!Array.isArray(result.files)) {
  throw new Error("npm pack did not report package files");
}
const files = new Set(result.files.map((file) => file.path));
for (const required of ["dist/cli.js", "LICENSE", "README.md", "package.json"]) {
  if (!files.has(required)) {
    throw new Error(`npm package is missing ${required}`);
  }
}

const sourceFiles = (await readdir(path.join(process.cwd(), "src"), { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
  .map((entry) => entry.name.slice(0, -3));
const generatedFiles = new Set(
  sourceFiles.flatMap((name) =>
    ["js", "js.map", "d.ts", "d.ts.map"].map((extension) => `dist/${name}.${extension}`),
  ),
);
const missingGenerated = [...generatedFiles].filter((file) => !files.has(file));
if (missingGenerated.length > 0) {
  throw new Error(`npm package is missing generated files: ${missingGenerated.join(", ")}`);
}

const allowedStaticFiles = new Set(["LICENSE", "README.md", "package.json"]);
const unexpected = [...files].filter(
  (file) => !allowedStaticFiles.has(file) && !generatedFiles.has(file),
);
if (unexpected.length > 0) {
  throw new Error(`npm package contains unexpected files: ${unexpected.join(", ")}`);
}

process.stdout.write(`Validated ${files.size} npm package files\n`);
