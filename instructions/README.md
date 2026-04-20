# instructions/

Global instruction blocks. Paste into surfaces that accept free-form system/personal instructions:

- Project-root `CLAUDE.md`
- Claude web/desktop app "Personal instructions"
- Cursor rules, Copilot custom instructions, etc.

## Structure

One file per persona or style, kebab-case: `instructions/<name>.md`.

Each file is plain markdown. The intro paragraph describes intended use; everything below the `---` fence is the paste-ready block.

## Not a skill

These are static instructions, not [Vercel Agent Skills](https://vercel.com/docs/agent-resources/skills). They don't auto-load based on file/command patterns. For skill-style conditional loading, use `skills/` instead.
