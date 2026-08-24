# Tool-specific commands

Command definitions live in tool-specific subdirectories because formats differ.

```text
.agents/commands/
  claude/
  cursor/
```

Every installed file needs an explicit target in `aiconf.manifest.json`. Claude Code commands map to `~/.claude/commands/`. Cursor commands need separate content and a separate Cursor target.

Do not treat one tool's command frontmatter as portable by default.
