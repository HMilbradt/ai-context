# Tool-specific agents

Agent definitions live in tool-specific subdirectories because formats differ.

```text
.agents/agents/
  claude/
  cursor/
```

Every installed file needs an explicit target in `aiconf.manifest.json`. Claude Code agents map to `~/.claude/agents/`. Cursor agents need separate content and a separate Cursor target.

Do not copy Claude Code frontmatter into another tool without verifying compatibility.
