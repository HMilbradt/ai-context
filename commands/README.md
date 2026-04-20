# commands/

Slash commands in [Claude Code command format](https://docs.claude.com/en/docs/claude-code/slash-commands).

## Structure

One file per command, kebab-case: `commands/<command-name>.md`. Invoked as `/<command-name>`.

```markdown
---
description: One-line summary shown in the command palette.
argument-hint: <optional arg hint>
---

Prompt body. Reference args as $ARGUMENTS or $1, $2, ...
```

## Install

Copy into `~/.claude/commands/` (user-level) or `.claude/commands/` (project-level).
