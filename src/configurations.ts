import path from "node:path";

import type {
  ConfigurationDefinition,
  ManagedStateV1,
  ResolvedArtifact,
  ToolTarget,
} from "./types.js";

export function configurationIdForArtifact(artifactId: string): string {
  return artifactId.split("/", 1)[0] ?? artifactId;
}

export function targetEnabled(tool: ToolTarget, selectedTools: Set<ToolTarget>): boolean {
  if (tool === "universal") {
    return selectedTools.has("codex") || selectedTools.has("cursor");
  }
  return tool === "scripts" || selectedTools.has(tool);
}

function sourceRoot(artifact: ResolvedArtifact): string {
  return artifact.id.includes("/") ? path.posix.dirname(artifact.sourcePath) : artifact.sourcePath;
}

export function collectConfigurations(
  artifacts: ResolvedArtifact[],
  tools: ToolTarget[],
): ConfigurationDefinition[] {
  const selectedTools = new Set(tools);
  const grouped = new Map<string, ConfigurationDefinition>();
  for (const artifact of artifacts) {
    const id = configurationIdForArtifact(artifact.id);
    const targets = artifact.targets.filter((target) => targetEnabled(target.tool, selectedTools));
    if (targets.length === 0) {
      continue;
    }
    const existing = grouped.get(id);
    if (existing) {
      for (const target of targets) {
        if (!existing.targets.some((item) => item.tool === target.tool && item.path === target.path)) {
          existing.targets.push(target);
        }
      }
    } else {
      grouped.set(id, {
        id,
        sourcePath: sourceRoot(artifact),
        selectedTools: [...tools],
        targets: [...targets],
      });
    }
  }
  return [...grouped.values()].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
}

export function resolveConfigurationPreferences(
  configurations: ConfigurationDefinition[],
  state: ManagedStateV1 | null,
): Record<string, boolean> {
  if (!state) {
    return Object.fromEntries(configurations.map((configuration) => [configuration.id, true]));
  }
  if (state.configurations !== null) {
    const preferences = { ...state.configurations };
    for (const configuration of configurations) {
      preferences[configuration.id] ??= true;
    }
    return preferences;
  }

  const managed = new Set(
    Object.values(state.managed).map((entry) => configurationIdForArtifact(entry.artifactId)),
  );
  return Object.fromEntries(
    configurations.map((configuration) => [configuration.id, managed.has(configuration.id)]),
  );
}

export function stateForSelection(
  state: ManagedStateV1 | null,
  selectedConfigurationIds: Set<string>,
  selectedTools: Set<ToolTarget>,
): ManagedStateV1 | null {
  if (!state) {
    return null;
  }
  return {
    ...state,
    managed: Object.fromEntries(
      Object.entries(state.managed).filter(([, entry]) =>
        selectedConfigurationIds.has(configurationIdForArtifact(entry.artifactId)) &&
        targetEnabled(entry.tool, selectedTools),
      ),
    ),
  };
}
