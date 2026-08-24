# Portable agent skills

Each skill lives under `.agents/skills/<skill-name>/` and contains a `SKILL.md` file.

```text
.agents/skills/
  my-skill/
    SKILL.md
    references/
```

The skill name must use kebab case. Its `SKILL.md` frontmatter must include the same name and a description that tells an agent when to load it.

Add each distributable skill tree to `aiconf.manifest.json`. Portable skills map to `~/.agents/skills/`. Add a Claude target when the same skill should also map to `~/.claude/skills/`.

The `agent-browser` discovery skill is stored here and installed like every other managed skill. `aiconf` only checks whether its external command is available on `PATH`. It never installs or updates that command.
