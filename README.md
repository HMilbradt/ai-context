# ai-context

Personal AI context: instructions, skills, prompts, subagents, slash commands, and settings snippets for AI coding tools (Claude Code, Cursor, Copilot, etc.).

Skills follow the [Vercel Agent Skills](https://vercel.com/docs/agent-resources/skills) spec, so the whole repo is installable with one command.

## Install

Install all skills from this repo:

```bash
npx skills add HMilbradt/ai-context
```

Install a single skill:

```bash
npx skills add HMilbradt/ai-context --skill <skill-name>
```

Works with Claude Code, GitHub Copilot, Cursor, Cline, and any agent the `skills` CLI supports.

## Layout

| Folder          | Purpose                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| `instructions/` | Global instruction blocks. Paste into root `CLAUDE.md`, Claude app, Cursor rules, etc. |
| `skills/`       | Installable skills (`SKILL.md` per skill). Vercel-compatible.           |
| `prompts/`      | Reusable prompt snippets. Plain markdown, drop in anywhere.             |
| `agents/`       | Subagent definitions in Claude Code format (frontmatter + system prompt). |
| `commands/`     | Slash commands in Claude Code format.                                   |
| `settings/`     | Shareable `settings.json` snippets, hook scripts, permission allowlists. |

Each folder has its own `README.md` with conventions and examples.

## Skill authoring (quick reference)

A skill is a directory under `skills/` containing at minimum a `SKILL.md`:

```
skills/my-skill/
├── SKILL.md           # required: frontmatter + instructions
├── overlay.yaml       # optional: agent-specific overrides
└── references/        # optional: supporting docs the agent can read
```

`SKILL.md` frontmatter (minimum viable):

```yaml
---
name: my-skill
description: One-line trigger description. Agents read this to decide when to load the skill.
---
```

Richer frontmatter (from the Vercel reference skills) supports `metadata.priority`, `metadata.docs`, `metadata.pathPatterns`, `metadata.bashPatterns`, `validate`, and `retrieval` blocks. See `skills/README.md` for a full example.

## License

MIT. See [LICENSE](LICENSE).
