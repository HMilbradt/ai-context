# aiconf

`aiconf` is a versioned global configuration kit for AI coding agents.

It installs shared instructions, portable skills, tool-specific agents and commands, reusable prompts, and declared scripts. Every change is reviewed before it reaches your home directory.

## Install

Node.js 22 or newer is required. macOS and Linux are supported.

```bash
npm install -g @hmilbradt/aiconf
aiconf setup
```

`setup` asks which supported tools to configure. It then shows the initial file plan and unified diffs before writing anything.

## Commands

```text
aiconf setup     Choose tools, review the initial plan, and install managed files
aiconf update    Fetch the latest stable release, review changes, and apply selections
aiconf status    Report versions, local drift, path problems, and optional tools
aiconf version   Print the installed command version
```

Updates never run automatically. Both `setup` and `update` require an interactive terminal.

## Managed destinations

Shared instructions are mapped to the native global location for each selected tool:

| Source | Destination | Selection |
| --- | --- | --- |
| `.agents/AGENTS.md` | `~/.agents/AGENTS.md` | Always |
| `.agents/AGENTS.md` | `~/.codex/AGENTS.md` | Codex |
| `.agents/AGENTS.md` | `~/.claude/CLAUDE.md` | Claude Code |

Portable skills are installed under `~/.agents/skills/`. The same managed skills are copied under `~/.claude/skills/` when Claude Code is selected.

Claude-specific agents and commands use `~/.claude/agents/` and `~/.claude/commands/`. Cursor variants must be declared separately in the manifest. A Claude frontmatter format is never treated as Cursor-compatible by default.

Declared global executables use `~/.local/bin`. `aiconf` refuses to replace an executable it does not already own. It reports when that directory is absent from `PATH`, but it never edits shell startup files.

Prompts under `.agents/prompts/` are stored in the repository. They are not automatically loaded into an agent.

## Review and safety model

Each destination is classified as one of these states:

- `unchanged`: local content matches the release.
- `new`: no local file exists.
- `safely-updatable`: local content still matches the previously installed release.
- `locally-modified`: local content changed while upstream did not.
- `removed-upstream`: the release no longer contains a previously managed file.
- `conflicting`: local and upstream content both changed.

New files and safe updates are selected by default. Local changes, removals, and conflicts require an explicit selection.

The command verifies a release checksum before extracting or reading its manifest. It rejects archive traversal, unapproved destinations, unsafe source paths, and symlinks that redirect a destination outside its approved root.

All selected writes are staged before the first replacement. Replaced and removed files are backed up under the state directory. A failed write or state update rolls back the complete file operation.

Unrelated files inside a managed directory are never scanned for deletion. Secrets, Model Context Protocol credentials, application state, opaque settings files, and Cursor cloud-managed rules do not belong in the bundle.

State is stored at `${XDG_STATE_HOME}/aiconf`. It falls back to `~/.local/state/aiconf`.

Release downloads are stored at `${XDG_CACHE_HOME}/aiconf`. They fall back to `~/.cache/aiconf`.

## Optional agent-browser command

The [`agent-browser`](https://github.com/vercel-labs/agent-browser) discovery skill is included in every configuration bundle. It is installed under `~/.agents/skills/agent-browser`. It is also copied to `~/.claude/skills/agent-browser` when Claude Code is selected.

The skill loads detailed guidance from the installed command. The command must therefore be installed separately before the skill can run.

During setup, update, and status checks, `aiconf` looks for the first `agent-browser` executable on `PATH`. It reports the detected path. It shows a non-blocking warning when the command is missing.

`aiconf` never installs, upgrades, or runs `agent-browser`. It does not check whether the installed version is current.

## Repository layout

```text
.agents/
  AGENTS.md
  agents/
  commands/
  prompts/
  scripts/
  skills/
aiconf.manifest.json
scripts/
src/
test/
```

`aiconf.manifest.json` is the authoring manifest. Each source has an identifier, kind, mode, and explicit tool targets. The release builder expands directory sources into individual artifacts with source paths, bundle paths, destinations, file modes, and SHA-256 hashes.

One semantic version is shared by `package.json`, the bundle manifest, the command, the Git tag, and the GitHub Release.

## Development

```bash
npm ci
npm run verify
```

`verify` performs TypeScript checks, linting, tests, a production build, bundle generation, package-content validation, and an isolated global-install smoke test.

The tests use temporary home directories. They do not run `aiconf setup` against the developer's real home directory.

## Releasing

Push a semantic version tag that matches `package.json` and `aiconf.manifest.json`:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release workflow verifies the repository, builds the bundle and checksum, creates a draft GitHub Release, publishes the public npm package, then publishes the GitHub Release. OpenID Connect is used for npm authentication, so no long-lived registry token is stored.

Before the first automated release:

1. Confirm `@hmilbradt/aiconf` is still available.
2. Publish the first public scoped version manually with two-factor authentication, because npm requires a package to exist before its trusted publisher can be configured.
3. In the npm package settings, configure the GitHub Actions trusted publisher for user `HMilbradt`, repository `ai-context`, and workflow file `release.yml`.
4. Allow the `npm publish` action for that trusted publisher.
5. Tag the exact commit used for the manual publication. The workflow verifies npm's published Git commit before skipping the already-published version.

Use these commands for the one-time publication after the commit is final:

```bash
npm view @hmilbradt/aiconf
npm run verify
npm publish --access public
```

The first command should return npm's not-found response. Stop if it reports an existing package that you did not publish.

The workflow uses `npm publish --access public`. Scoped packages otherwise default to private visibility.

## Tool documentation

- [Codex global instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Codex skills](https://learn.chatgpt.com/docs/build-skills)
- [Claude Code memory](https://code.claude.com/docs/en/memory)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [Cursor skills](https://prod.cursor.com/docs/skills)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm public scoped packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)

## License

MIT. See [LICENSE](LICENSE).
