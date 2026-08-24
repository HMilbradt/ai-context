export const TOOL_TARGETS = ["universal", "codex", "claude", "cursor", "scripts"] as const;

export type ToolTarget = (typeof TOOL_TARGETS)[number];

export interface ArtifactTarget {
  tool: ToolTarget;
  path: string;
}

export interface BundleArtifactV1 {
  id: string;
  sourcePath: string;
  bundlePath: string;
  mode: number;
  sha256: string;
  targets: ArtifactTarget[];
}

export interface BundleManifestV1 {
  schemaVersion: 1;
  version: string;
  minimumCliVersion: string;
  artifacts: BundleArtifactV1[];
}

export interface SourceArtifactV1 {
  id: string;
  kind: "file" | "tree";
  source: string;
  mode: number;
  targets: ArtifactTarget[];
}

export interface SourceManifestV1 {
  schemaVersion: 1;
  version: string;
  minimumCliVersion: string;
  sources: SourceArtifactV1[];
}

export interface ResolvedArtifact {
  id: string;
  sourcePath: string;
  mode: number;
  sha256: string;
  content: Buffer;
  targets: ArtifactTarget[];
}

export interface ManagedEntryV1 {
  artifactId: string;
  tool: ToolTarget;
  path: string;
  sha256: string;
  mode: number;
}

export interface ManagedStateV1 {
  schemaVersion: 1;
  installedVersion: string | null;
  lastCheckedVersion: string | null;
  tools: ToolTarget[];
  configurations: Record<string, boolean> | null;
  managed: Record<string, ManagedEntryV1>;
}

export interface ConfigurationDefinition {
  id: string;
  sourcePath: string;
  selectedTools: ToolTarget[];
  targets: ArtifactTarget[];
}

export type ChangeStatus =
  | "unchanged"
  | "new"
  | "safely-updatable"
  | "locally-modified"
  | "removed-upstream"
  | "conflicting";

export interface PlannedChange {
  key: string;
  configurationId: string;
  artifactId: string;
  tool: ToolTarget;
  targetPath: string;
  destination: string;
  status: ChangeStatus;
  operation: "none" | "write" | "delete";
  currentContent: Buffer | null;
  desiredContent: Buffer | null;
  currentSha256: string | null;
  desiredSha256: string | null;
  previousSha256: string | null;
  mode: number;
  recommended: boolean;
  selectable: boolean;
  reason: string;
}

export type FileOperation =
  | { type: "write"; destination: string; content: Buffer; mode: number }
  | { type: "delete"; destination: string };
