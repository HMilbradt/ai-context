# prompts/

Reusable prompt snippets. Plain markdown. Paste into any chat, or reference from a skill/command.

## Conventions

- One prompt per file, kebab-case filename matching intent (e.g. `review-pr.md`, `extract-api-surface.md`).
- Top of file: one-line purpose comment, then the prompt body.
- Use `{{placeholders}}` for inputs the caller fills in.
- Group related prompts in subfolders when the set grows beyond ~5 files.

## Example

```markdown
<!-- Purpose: summarize a PR diff for a non-author reviewer. -->

You are reviewing PR #{{pr_number}}. Summarize the change in three sections:
1. What changed (mechanical)
2. Why it changed (intent)
3. Risk surface (what to scrutinize)
```
