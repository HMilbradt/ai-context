# agents/

Subagent definitions in [Claude Code agent format](https://docs.claude.com/en/docs/claude-code/sub-agents).

## Structure

One file per agent, kebab-case: `agents/<agent-name>.md`.

```markdown
---
name: pr-reviewer
description: Reviews pull request diffs for correctness, security, and style.
tools: Read, Grep, Bash
model: sonnet
---

<system prompt body here>
```

## Install

Copy into `~/.claude/agents/` (user-level) or `.claude/agents/` (project-level), or reference from a skill.
