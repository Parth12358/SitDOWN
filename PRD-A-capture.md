# PRD A: Capture (local-only fork of @alikeai/setup)

Read `OVERALL_PLAN.md` and `contracts/` first.

## Goal

Every finished coding-agent session and every commit lands in the inbox as a valid record, with nothing leaving the machine.

## Owns

`packages/capture/` only.

## Inputs and outputs

- **In:** agent transcripts on disk; git commits.
- **Out:** `~/.<app>/inbox/sessions/<id>.json` (SessionRecord) and `~/.<app>/inbox/commits/<sha>.json` (CommitRecord). Schemas in `OVERALL_PLAN.md`.

## Starting point

`@alikeai/setup@0.2.1` is MIT licensed, and Alike has approved forking it. Download without running it:

```bash
npm pack @alikeai/setup@0.2.1
npm pack @alikeai/harness-snippets@0.2.0
```

Keep their `LICENSE` file and copyright notice in the package.

What's in it:

| File | What it does | Keep? |
| --- | --- | --- |
| `harness-transcripts.mjs` | Where each of 15 agents stores transcripts, hook event names per agent | Keep |
| `paths.mjs` | Config and home paths per agent and OS | Keep; rename home dir |
| `writers.mjs`, `dialects.mjs`, `matrix.mjs` | Writes hooks into each agent's config with backups, additive only | Keep |
| `runtime/sweep.mjs` | Archives transcripts to disk; uploads if paired | Keep archive; remove upload |
| `capture-rules.mjs` | `.alikeignore` rules (skip repos, paths, tools) | Keep; rename to `.<app>ignore` |
| `parser-codex.mjs`, `runtime/sqlite-collector.mjs` | Codex parsing; Windsurf and Zed SQLite readers | Keep |
| `runtime/hook.mjs` | Hook runtime; injects context and posts telemetry | Keep hook entry; remove network |
| `runtime/telemetry.mjs`, `runtime/creds.mjs`, pairing in `cli.mjs` | Telemetry, credentials, pairing | Remove |
| `runtime/alike.mjs` | `alike` CLI that calls their `/mcp` | Remove |

Note: `runSweep` already archives locally when there are no credentials (`canUpload` is false). That is the local-only path to build on.

## Requirements

- [ ] Remove pairing, uploads, telemetry, and every call to `/pair/*`, `/mcp`, and `/harness-telemetry`. Add a test that fails if any `fetch` remains in the runtime.
- [ ] Rename the home directory to `~/.<app>/`, the hook command to `<app>`, and the guidance markers, so it runs beside the real Alike (which the team is also using today) without touching its config entries.
- [ ] Remove the context-injection and agent-guidance writes (CLAUDE.md/AGENTS.md notes). Our product reads through MCP (PRD D), not injection.
- [ ] On each agent's end-of-session hook: run the archive sweep for that session, parse the transcript into a SessionRecord, and write it atomically to the inbox.
- [ ] Extract `edits` from the agent's file-edit tool calls (Claude Code `Edit`, `Write`, `MultiEdit`; Codex `apply_patch`) as file plus added line ranges.
- [ ] `author` comes from `git config user.name` in the session's working directory, mapped through `people` in config.
- [ ] Git `post-commit` hook written in Node: CommitRecord with added and removed line ranges from `git diff --unified=0 HEAD~1 HEAD`, and `co_authors` from `Co-authored-by:` trailers. Installer command: `<app> install-git-hook` per repo.
- [ ] Agent priority: Claude Code first, then Codex, then Cursor. Others are stretch.
- [ ] Hooks fail open and exit within 5 seconds, always.
- [ ] Keep `--dry-run`, `--doctor`, `--uninstall`.

## Windows

The upstream exits on `win32`. Remove that guard for Claude Code only. Build every path with `path.join` and `os.homedir()`. Claude Code's transcripts live under the user's home `.claude/projects` folder on every OS.

## Done when

- [ ] Finishing a real Claude Code session produces one valid SessionRecord in the inbox with correct `edits`.
- [ ] Making a commit produces one valid CommitRecord.
- [ ] No network calls (test passes).
- [ ] The real Alike keeps working alongside it.

## Out of scope

Summaries (B), notes (C), queries (D).
