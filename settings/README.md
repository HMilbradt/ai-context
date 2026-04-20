# settings/

Shareable personal configuration. Two kinds of files live here:

1. **Global personalization** (markdown). Paste-ready instruction blocks for surfaces that accept free-form personal/system instructions: root `CLAUDE.md`, Claude web/desktop app personalization, Cursor rules, etc.
2. **Config snippets** (JSON, scripts). Fragments of `settings.json`, hooks, and permission allowlists for Claude Code.

## Structure

- `settings/global-personalization.md`: default paste-ready personalization block.
- `settings/*.md`: other personalization variants (e.g. different personas).
- `settings/*.json`: partial `settings.json` bodies to merge into `~/.claude/settings.json` or `.claude/settings.json`.
- `settings/hooks/`: hook scripts referenced from settings (keep them executable).
- `settings/permissions/`: reusable `permissions.allow` / `permissions.deny` arrays.

JSON files are snippets, not drop-in replacements. Merge by hand or with `jq`.

## Example

`settings/permissions/safe-reads.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(git status)",
      "Bash(git diff:*)",
      "Bash(git log:*)"
    ]
  }
}
```
