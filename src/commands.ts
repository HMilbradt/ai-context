import { constants } from "node:fs";
import { access, lstat, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { gte as semverGte } from "semver";

import {
  collectConfigurations,
  configurationIdForArtifact,
  resolveConfigurationPreferences,
  stateForSelection,
} from "./configurations.js";
import { findExecutableOnPath } from "./external-tools.js";
import { sha256 } from "./hash.js";
import { getPackageVersion } from "./package-info.js";
import {
  assertExistingPathSafe,
  getAppPaths,
  resolveManagedDestination,
} from "./paths.js";
import { buildChangePlan } from "./planner.js";
import {
  assertReleaseCompatible,
  fetchLatestReleaseBundle,
  fetchLatestReleaseInfo,
} from "./release.js";
import { buildNextState, readState, withStateLock, writeState } from "./state.js";
import { applyFileTransaction } from "./transaction.js";
import type {
  FileOperation,
  ManagedStateV1,
  PlannedChange,
  ToolTarget,
} from "./types.js";
import {
  UserCancelledError,
  chooseConfigurations,
  chooseTools,
  createSpinner,
  finishInterface,
  info,
  reviewChangePlan,
  runSpinnerTask,
  startInterface,
  success,
  warn,
} from "./ui.js";

function assertSupportedPlatform(platform: NodeJS.Platform): void {
  if (platform !== "darwin" && platform !== "linux") {
    throw new Error(`aiconf supports macOS and Linux. Current platform: ${platform}`);
  }
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await access(candidate, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function detectTools(home: string): Promise<Set<ToolTarget>> {
  const detected = new Set<ToolTarget>();
  const checks: Array<[ToolTarget, string]> = [
    ["codex", ".codex"],
    ["claude", ".claude"],
    ["cursor", ".cursor"],
    ["opencode", ".config/opencode"],
  ];
  for (const [tool, relative] of checks) {
    if (await exists(path.join(home, relative))) {
      detected.add(tool);
    }
  }
  return detected;
}

function operationsFor(plan: PlannedChange[], selected: Set<string>): FileOperation[] {
  const operations: FileOperation[] = [];
  for (const change of plan) {
    if (!selected.has(change.key)) {
      continue;
    }
    if (change.operation === "write" && change.desiredContent) {
      operations.push({
        type: "write",
        destination: change.destination,
        content: change.desiredContent,
        mode: change.mode,
      });
    } else if (change.operation === "delete") {
      operations.push({ type: "delete", destination: change.destination });
    }
  }
  return operations;
}

function pathContains(directory: string, pathValue: string): boolean {
  const normalized = path.resolve(directory);
  return pathValue
    .split(path.delimiter)
    .filter(Boolean)
    .some((entry) => path.resolve(entry) === normalized);
}

async function synchronize(setup: boolean): Promise<void> {
  assertSupportedPlatform(process.platform);
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("setup and update require an interactive terminal");
  }
  const home = homedir();
  const paths = getAppPaths(home, process.env);
  await withStateLock(paths.lockFile, async () => {
    const previous = await readState(paths.stateFile);
    if (!setup && !previous) {
      throw new Error("aiconf is not set up. Run aiconf setup first.");
    }

    startInterface(setup ? "aiconf setup" : "aiconf update");
    const tools = setup ? await chooseTools(await detectTools(home)) : previous!.tools;
    const spinner = createSpinner();
    const release = await runSpinnerTask({
      spinner,
      startMessage: "Checking GitHub Releases",
      failureMessage: "Could not load the latest aiconf release",
      task: async () => {
        const candidate = await fetchLatestReleaseBundle(paths.cacheDir);
        const cliVersion = await getPackageVersion();
        assertReleaseCompatible({
          cliVersion,
          minimumCliVersion: candidate.manifest.minimumCliVersion,
          installedVersion: previous?.installedVersion ?? null,
          releaseVersion: candidate.info.version,
        });
        return candidate;
      },
      successMessage: (candidate) => `Found aiconf release ${candidate.info.version}`,
    });

    const configurations = collectConfigurations(release.artifacts, tools);
    const configurationPreferences = await chooseConfigurations({
      configurations,
      preferences: resolveConfigurationPreferences(configurations, previous),
      setup,
    });
    const selectedConfigurationIds = new Set(
      Object.entries(configurationPreferences)
        .filter(([, selected]) => selected)
        .map(([id]) => id),
    );

    if (selectedConfigurationIds.has("skill.agent-browser")) {
      const agentBrowser = await findExecutableOnPath(
        "agent-browser",
        process.env.PATH ?? "",
      );
      if (agentBrowser) {
        info(`agent-browser detected at ${agentBrowser}`);
      } else {
        warn(
          "agent-browser was not detected on PATH. Install it separately before using the bundled agent-browser skill.",
        );
      }
    }
    const selectedArtifacts = release.artifacts.filter((artifact) =>
      selectedConfigurationIds.has(configurationIdForArtifact(artifact.id)),
    );
    const plan = await buildChangePlan({
      home,
      artifacts: selectedArtifacts,
      state: stateForSelection(previous, selectedConfigurationIds, new Set(tools)),
      selectedTools: tools,
    });
    const selected = await reviewChangePlan(
      plan,
      configurations.filter((configuration) =>
        selectedConfigurationIds.has(configuration.id),
      ),
    );
    const operations = operationsFor(plan, selected);

    const transaction = await applyFileTransaction({
      home,
      stateDir: paths.stateDir,
      operations,
    });
    const nextState = buildNextState({
      previous,
      plan,
      selectedKeys: selected,
      bundleVersion: release.info.version,
      tools,
      configurations: configurationPreferences,
    });
    try {
      await writeState(paths.stateFile, nextState);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    const localBin = path.join(home, ".local/bin");
    if (!pathContains(localBin, process.env.PATH ?? "")) {
      warn(`${localBin} is not on PATH. Global scripts will not be callable until it is added.`);
    }
    if (nextState.installedVersion === release.info.version) {
      finishInterface(`Installed aiconf configuration ${release.info.version}`);
    } else {
      finishInterface(
        `Applied ${operations.length} file change${operations.length === 1 ? "" : "s"}. Some selected configurations remain incomplete.`,
      );
    }
  });
}

export async function runSetup(): Promise<void> {
  await synchronize(true);
}

export async function runUpdate(): Promise<void> {
  await synchronize(false);
}

async function inspectStateDrift(home: string, state: ManagedStateV1): Promise<string[]> {
  const problems: string[] = [];
  for (const entry of Object.values(state.managed)) {
    const destination = resolveManagedDestination(home, entry.path);
    try {
      await assertExistingPathSafe(home, destination);
      const info = await lstat(destination);
      if (!info.isFile() && !info.isSymbolicLink()) {
        problems.push(`${entry.path}: not a file`);
        continue;
      }
      const currentHash = sha256(await readFile(destination));
      if (currentHash !== entry.sha256) {
        problems.push(`${entry.path}: locally modified`);
      }
      if (info.isFile() && (info.mode & 0o777) !== entry.mode) {
        problems.push(
          `${entry.path}: mode is ${(info.mode & 0o777).toString(8)}, expected ${entry.mode.toString(8)}`,
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        problems.push(`${entry.path}: missing`);
      } else {
        problems.push(`${entry.path}: ${(error as Error).message}`);
      }
    }
  }
  return problems;
}

export async function runStatus(): Promise<number> {
  assertSupportedPlatform(process.platform);
  const home = homedir();
  const paths = getAppPaths(home, process.env);
  const state = await readState(paths.stateFile);
  const problems: string[] = [];
  info(`package: ${await getPackageVersion()}`);
  if (!state) {
    problems.push("configuration: not set up");
  } else {
    info(`installed configuration: ${state.installedVersion ?? "partial"}`);
    info(`selected tools: ${state.tools.join(", ") || "universal only"}`);
    if (state.configurations !== null) {
      const selectedConfigurations = Object.entries(state.configurations)
        .filter(([, selected]) => selected)
        .map(([id]) => id);
      const skippedConfigurations = Object.entries(state.configurations)
        .filter(([, selected]) => !selected)
        .map(([id]) => id);
      info(`selected configurations: ${selectedConfigurations.join(", ") || "none"}`);
      if (skippedConfigurations.length > 0) {
        info(`skipped configurations: ${skippedConfigurations.join(", ")}`);
      }
    }
    problems.push(...(await inspectStateDrift(home, state)));
  }

  try {
    const release = await fetchLatestReleaseInfo();
    info(`latest configuration: ${release.version}`);
    if (!state?.installedVersion || !semverGte(state.installedVersion, release.version)) {
      problems.push(`configuration update available: ${release.version}`);
    }
  } catch (error) {
    problems.push(`release check failed: ${(error as Error).message}`);
  }

  if (!state || state.configurations?.["skill.agent-browser"] !== false) {
    const agentBrowser = await findExecutableOnPath("agent-browser", process.env.PATH ?? "");
    if (agentBrowser) {
      info(`agent-browser: detected at ${agentBrowser}`);
    } else {
      warn(
        "Optional agent-browser command was not detected on PATH. Install it separately before using its skill.",
      );
    }
  }

  const localBin = path.join(home, ".local/bin");
  if (!pathContains(localBin, process.env.PATH ?? "")) {
    problems.push(`${localBin} is not on PATH`);
  }
  if (problems.length === 0) {
    success("configuration is current and clean");
    return 0;
  }
  for (const problem of problems) {
    warn(problem);
  }
  return 1;
}

export async function runVersion(): Promise<void> {
  process.stdout.write(`${await getPackageVersion()}\n`);
}

export function handleCancellation(error: unknown): boolean {
  if (error instanceof UserCancelledError) {
    finishInterface("No configuration files were changed");
    return true;
  }
  return false;
}
