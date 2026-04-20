# skills/

Installable skills following the [Vercel Agent Skills](https://vercel.com/docs/agent-resources/skills) spec.

## Structure

```
skills/
└── <skill-name>/
    ├── SKILL.md           # required
    ├── overlay.yaml       # optional: per-agent overrides
    ├── references/        # optional: supporting docs loaded on demand
    └── upstream/          # optional: vendored upstream sources
```

`<skill-name>` must be kebab-case and unique within this repo.

## SKILL.md frontmatter

Minimum:

```yaml
---
name: my-skill
description: One sentence telling an agent when to load this skill. Include trigger verbs and nouns.
---
```

Full (based on `vercel/vercel-plugin` reference skills):

```yaml
---
name: my-skill
description: When the agent should load this skill.
metadata:
  priority: 5                     # 1-10, higher = loaded earlier in conflicts
  docs:
    - https://example.com/docs
  pathPatterns:                   # file globs that trigger auto-load
    - 'src/**/*.ts'
  bashPatterns:                   # regex on shell commands that trigger auto-load
    - '\bnpm\s+install\b'
validate:                          # optional guardrails
  - pattern: 'console\.log'
    message: Remove debug logs before commit.
    severity: warn
retrieval:
  aliases: [alt name, other name]
  intents: [do the thing, configure the thing]
  entities: [ThingClass, thingFn]
---
```

Body is plain markdown: the instructions the agent follows when the skill is active.

## Testing a skill locally

```bash
npx skills add HMilbradt/ai-context --skill <skill-name>
```

From a local checkout:

```bash
npx skills add ./skills/<skill-name>
```
