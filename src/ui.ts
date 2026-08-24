import * as prompts from "@clack/prompts";
import { createTwoFilesPatch } from "diff";
import pc from "picocolors";

import type {
  ChangeStatus,
  ConfigurationDefinition,
  PlannedChange,
  ToolTarget,
} from "./types.js";

export class UserCancelledError extends Error {
  constructor() {
    super("Operation cancelled");
    this.name = "UserCancelledError";
  }
}

function valueOrCancel<T>(value: T | symbol): T {
  if (prompts.isCancel(value)) {
    throw new UserCancelledError();
  }
  return value as T;
}

export function startInterface(title: string): void {
  prompts.intro(pc.inverse(` ${title} `));
}

export function finishInterface(message: string): void {
  prompts.outro(message);
}

export function info(message: string): void {
  prompts.log.info(message);
}

export function warn(message: string): void {
  prompts.log.warn(message);
}

export function success(message: string): void {
  prompts.log.success(message);
}

export function failure(message: string): void {
  prompts.log.error(message);
}

export interface SpinnerHandle {
  start(message: string): void;
  stop(message: string): void;
}

export async function runSpinnerTask<T>(input: {
  spinner: SpinnerHandle;
  startMessage: string;
  successMessage: (value: T) => string;
  failureMessage: string;
  task: () => Promise<T>;
}): Promise<T> {
  input.spinner.start(input.startMessage);
  try {
    const value = await input.task();
    input.spinner.stop(input.successMessage(value));
    return value;
  } catch (error) {
    input.spinner.stop(input.failureMessage);
    throw error;
  }
}

export async function chooseTools(detected: Set<ToolTarget>): Promise<ToolTarget[]> {
  const value = await prompts.multiselect<ToolTarget>({
    message: "Select agent tools to configure",
    options: [
      {
        value: "codex",
        label: "Codex",
        ...(detected.has("codex") ? { hint: "detected" } : {}),
      },
      {
        value: "claude",
        label: "Claude Code",
        ...(detected.has("claude") ? { hint: "detected" } : {}),
      },
      {
        value: "cursor",
        label: "Cursor",
        ...(detected.has("cursor") ? { hint: "detected" } : {}),
      },
    ],
    initialValues: [...detected].filter(
      (tool): tool is "codex" | "claude" | "cursor" =>
        tool === "codex" || tool === "claude" || tool === "cursor",
    ),
    required: false,
  });
  return valueOrCancel(value);
}

function toolLabel(tool: ToolTarget): string {
  const labels: Record<ToolTarget, string> = {
    universal: "Shared",
    codex: "Codex",
    claude: "Claude Code",
    cursor: "Cursor",
    scripts: "Global scripts",
  };
  return labels[tool];
}

function configurationTargetLabel(
  configuration: ConfigurationDefinition,
  tool: ToolTarget,
): string {
  if (tool !== "universal") {
    return toolLabel(tool);
  }
  const consumers = configuration.selectedTools.filter(
    (selected) => selected === "codex" || selected === "cursor",
  );
  if (consumers.length === 1) {
    return consumers[0] === "codex" ? "Codex (shared)" : "Cursor";
  }
  return "Codex and Cursor (shared)";
}

function configurationHint(configuration: ConfigurationDefinition): string {
  return [
    ...new Set(
      configuration.targets.map((target) =>
        configurationTargetLabel(configuration, target.tool),
      ),
    ),
  ].join(", ");
}

export function renderConfigurationPreferences(
  configurations: ConfigurationDefinition[],
  preferences: Record<string, boolean>,
): string {
  return configurations
    .map((configuration) => {
      const status = preferences[configuration.id] === false ? "skipped" : "selected";
      const targets = configuration.targets
        .map(
          (target) =>
            `${configurationTargetLabel(configuration, target.tool)}: ~/${target.path}`,
        )
        .join("\n    ");
      return `${status}  ${configuration.sourcePath}\n    ${targets}`;
    })
    .join("\n");
}

async function editConfigurationPreferences(
  configurations: ConfigurationDefinition[],
  preferences: Record<string, boolean>,
): Promise<Record<string, boolean>> {
  const selected = valueOrCancel(
    await prompts.multiselect<string>({
      message: "Select configurations to manage",
      options: configurations.map((configuration) => ({
        value: configuration.id,
        label: configuration.sourcePath,
        hint: configurationHint(configuration),
      })),
      initialValues: configurations
        .filter((configuration) => preferences[configuration.id] !== false)
        .map((configuration) => configuration.id),
      required: false,
    }),
  );
  const selectedIds = new Set(selected);
  return {
    ...preferences,
    ...Object.fromEntries(
      configurations.map((configuration) => [configuration.id, selectedIds.has(configuration.id)]),
    ),
  };
}

export async function chooseConfigurations(input: {
  configurations: ConfigurationDefinition[];
  preferences: Record<string, boolean>;
  setup: boolean;
}): Promise<Record<string, boolean>> {
  let preferences = { ...input.preferences };
  if (input.setup) {
    return await editConfigurationPreferences(input.configurations, preferences);
  }

  while (true) {
    const selectedCount = input.configurations.filter(
      (configuration) => preferences[configuration.id] !== false,
    ).length;
    const action = valueOrCancel(
      await prompts.select<"continue" | "change" | "show" | "cancel">({
        message: "Configuration preferences",
        options: [
          {
            value: "continue",
            label: `Continue with ${selectedCount} selected configuration${selectedCount === 1 ? "" : "s"}`,
          },
          { value: "change", label: "Choose configurations" },
          { value: "show", label: "Show all configurations" },
          { value: "cancel", label: "Cancel" },
        ],
      }),
    );
    if (action === "cancel") {
      throw new UserCancelledError();
    }
    if (action === "show") {
      prompts.note(
        renderConfigurationPreferences(input.configurations, preferences),
        "All configurations",
      );
      continue;
    }
    if (action === "change") {
      preferences = await editConfigurationPreferences(input.configurations, preferences);
      continue;
    }
    return preferences;
  }
}

function statusLabel(status: ChangeStatus): string {
  const labels: Record<ChangeStatus, string> = {
    unchanged: pc.dim("unchanged"),
    new: pc.green("new"),
    "safely-updatable": pc.cyan("update"),
    "locally-modified": pc.yellow("local change"),
    "removed-upstream": pc.magenta("removed upstream"),
    conflicting: pc.red("conflict"),
  };
  return labels[status];
}

function changeLabel(change: PlannedChange): string {
  return `${statusLabel(change.status)}  ~/${change.targetPath}`;
}

function isText(content: Buffer | null): boolean {
  return content === null || !content.includes(0);
}

function colorDiff(diff: string): string {
  return diff
    .split("\n")
    .map((line) => {
      if (line.startsWith("+++") || line.startsWith("---")) return pc.bold(line);
      if (line.startsWith("+")) return pc.green(line);
      if (line.startsWith("-")) return pc.red(line);
      if (line.startsWith("@@")) return pc.cyan(line);
      return line;
    })
    .join("\n");
}

export function renderChangeDiff(change: PlannedChange): string {
  if (!isText(change.currentContent) || !isText(change.desiredContent)) {
    return "Binary content changed. A text diff is unavailable.";
  }
  const current = change.currentContent?.toString("utf8") ?? "";
  const desired = change.desiredContent?.toString("utf8") ?? "";
  return colorDiff(
    createTwoFilesPatch(
      `${change.targetPath} (current)`,
      `${change.targetPath} (release)`,
      current,
      desired,
      undefined,
      undefined,
      { context: 3 },
    ),
  );
}

export function renderConfigurationCoverage(
  plan: PlannedChange[],
  configurations: ConfigurationDefinition[],
): string {
  const definitions = new Map(
    configurations.map((configuration) => [configuration.id, configuration]),
  );
  const grouped = new Map<string, PlannedChange[]>();
  for (const change of plan) {
    const changes = grouped.get(change.configurationId) ?? [];
    changes.push(change);
    grouped.set(change.configurationId, changes);
  }
  return [...grouped.entries()]
    .map(([configurationId, changes]) => {
      const configuration = definitions.get(configurationId);
      const destinations = changes
        .map(
          (change) =>
            `    ${configuration ? configurationTargetLabel(configuration, change.tool) : toolLabel(change.tool)}: ~/${change.targetPath} (${change.status})`,
        )
        .join("\n");
      return `${configuration?.sourcePath ?? configurationId}\n${destinations}`;
    })
    .join("\n");
}

export function defaultSelectedChangeKeys(plan: PlannedChange[]): Set<string> {
  return new Set(
    plan
      .filter((change) => change.status === "new" || change.status === "safely-updatable")
      .map((change) => change.key),
  );
}

function renderSelectedChanges(plan: PlannedChange[], selected: Set<string>): string {
  const changes = plan.filter((change) => selected.has(change.key));
  if (changes.length === 0) {
    return "No files will be changed.";
  }
  return changes
    .map((change) => {
      const action = change.operation === "delete" ? "remove" : "write";
      return `${action}  ~/${change.targetPath}`;
    })
    .join("\n");
}

async function resolveExceptionalChanges(
  plan: PlannedChange[],
  selected: Set<string>,
): Promise<void> {
  const exceptional = plan.filter(
    (change) =>
      change.selectable &&
      (change.status === "conflicting" ||
        change.status === "locally-modified" ||
        change.status === "removed-upstream"),
  );
  for (const change of exceptional) {
    prompts.note(renderChangeDiff(change), change.destination);
    const useRelease = valueOrCancel(
      await prompts.select<boolean>({
        message:
          change.operation === "delete"
            ? `Remove ~/${change.targetPath}?`
            : `Replace ~/${change.targetPath} with the selected configuration?`,
        options: [
          {
            value: false,
            label: change.operation === "delete" ? "Keep local file" : "Keep local version",
          },
          {
            value: true,
            label: change.operation === "delete" ? "Remove file" : "Use selected configuration",
          },
        ],
      }),
    );
    if (useRelease) {
      selected.add(change.key);
    }
  }
}

export async function reviewChangePlan(
  plan: PlannedChange[],
  configurations: ConfigurationDefinition[],
): Promise<Set<string>> {
  prompts.note(renderConfigurationCoverage(plan, configurations), "Selected configuration coverage");
  for (const blocked of plan.filter((change) => !change.selectable && change.status !== "unchanged")) {
    prompts.log.warn(`${blocked.targetPath}: ${blocked.reason}`);
  }

  const selectable = plan.filter((change) => change.selectable);
  const selected = defaultSelectedChangeKeys(plan);
  await resolveExceptionalChanges(plan, selected);

  while (true) {
    const options: Array<{
      value: "apply" | "review" | "cancel";
      label: string;
    }> = [
      {
        value: "apply",
        label: `Continue with ${selected.size} file change${selected.size === 1 ? "" : "s"}`,
      },
    ];
    if (selectable.length > 0) {
      options.push({ value: "review", label: "Review a diff" });
    }
    options.push({ value: "cancel", label: "Cancel" });
    const action = valueOrCancel(
      await prompts.select<"apply" | "review" | "cancel">({
        message: "Review selected file changes",
        options,
      }),
    );
    if (action === "cancel") {
      throw new UserCancelledError();
    }
    if (action === "review") {
      const key = valueOrCancel(
        await prompts.select<string>({
          message: "Select a change to inspect",
          options: selectable.map((change) => ({
            value: change.key,
            label: changeLabel(change),
            hint: change.reason,
          })),
        }),
      );
      const change = selectable.find((item) => item.key === key);
      if (change) {
        prompts.note(renderChangeDiff(change), change.destination);
      }
      continue;
    }
    prompts.note(renderSelectedChanges(plan, selected), "Files to change");
    const confirmed = valueOrCancel(
      await prompts.confirm({
        message:
          selected.size === 0
            ? "Save configuration preferences without changing files?"
            : `Apply ${selected.size} file change${selected.size === 1 ? "" : "s"}?`,
        initialValue: true,
      }),
    );
    if (confirmed) {
      return selected;
    }
  }
}

export function createSpinner() {
  return prompts.spinner();
}
