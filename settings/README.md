# settings/

Shareable configuration snippets: `settings.json` fragments, hook scripts, permission allowlists.

## Structure

- `settings/*.json` — partial `settings.json` bodies to merge into `~/.claude/settings.json` or `.claude/settings.json`.
- `settings/hooks/` — hook scripts referenced from settings (keep them executable).
- `settings/permissions/` — reusable `permissions.allow` / `permissions.deny` arrays.

These are snippets, not drop-in replacements. Merge by hand or with `jq`.

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
