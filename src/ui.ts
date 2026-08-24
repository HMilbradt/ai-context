import * as prompts from "@clack/prompts";
import { createTwoFilesPatch } from "diff";
import pc from "picocolors";

import type {
  ChangeStatus,
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
  return `${statusLabel(change.status)}  ${change.targetPath}`;
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

function summarizePlan(plan: PlannedChange[]): string {
  const counts = new Map<ChangeStatus, number>();
  for (const change of plan) {
    counts.set(change.status, (counts.get(change.status) ?? 0) + 1);
  }
  const order: ChangeStatus[] = [
    "new",
    "safely-updatable",
    "locally-modified",
    "conflicting",
    "removed-upstream",
    "unchanged",
  ];
  return order
    .filter((status) => counts.has(status))
    .map((status) => `${status}: ${counts.get(status)}`)
    .join("\n");
}

export async function reviewChangePlan(plan: PlannedChange[]): Promise<Set<string>> {
  prompts.note(summarizePlan(plan), "Configuration changes");
  for (const blocked of plan.filter((change) => !change.selectable && change.status !== "unchanged")) {
    prompts.log.warn(`${blocked.targetPath}: ${blocked.reason}`);
  }

  const selectable = plan.filter((change) => change.selectable);
  if (selectable.length === 0) {
    return new Set();
  }
  let selected = new Set(
    selectable.filter((change) => change.recommended).map((change) => change.key),
  );

  while (true) {
    const action = valueOrCancel(
      await prompts.select<"apply" | "review" | "customize" | "cancel">({
        message: "Review and apply configuration changes",
        options: [
          {
            value: "apply",
            label: `Apply ${selected.size} selected change${selected.size === 1 ? "" : "s"}`,
          },
          { value: "review", label: "Review a diff" },
          { value: "customize", label: "Choose changes" },
          { value: "cancel", label: "Cancel" },
        ],
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
    if (action === "customize") {
      const keys = valueOrCancel(
        await prompts.multiselect<string>({
          message: "Select changes to apply",
          options: selectable.map((change) => ({
            value: change.key,
            label: changeLabel(change),
            hint: change.reason,
          })),
          initialValues: [...selected],
          required: false,
        }),
      );
      selected = new Set(keys);
      continue;
    }
    const confirmed = valueOrCancel(
      await prompts.confirm({
        message: `Apply ${selected.size} selected change${selected.size === 1 ? "" : "s"}?`,
        initialValue: selected.size > 0,
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
