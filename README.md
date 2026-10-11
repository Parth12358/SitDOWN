# SitDOWN: Automated Agent Documentation

`SitDOWN` turns every coding-agent session and commit into living, linked documentation that people and agents can query. Docs are plain Markdown in vaults you own (Obsidian-compatible): **one personal vault per person** (their own log + private notes) plus a **shared central vault** for team features and decisions — so nobody else's work ever lands in your personal space. A voice assistant that answers questions in standups is a secondary way to read them.

Built at SpeedHacks (SF Tech Week, Oct 11 2026). Submission due 5 PM PT.

## How it works

```text
Agent sessions ─┐
                ├─> Capture (A) ─> Summarizer (B) ─> Vault + events (C) ─> MCP query server (D) ─┬─> Coding agents (start briefed)
Commits ────────┘                                                                                ├─> Voice assistant (E, Dial)
                                                                                                 └─> Evals (F, Sparta)
```

Each stage reads one folder and writes the next, so every stage can run alone on fixtures. See `OVERALL_PLAN.md` for the contracts.

## Repo layout

```text
README.md            this file
OVERALL_PLAN.md      schedule, contracts, rules for every agent
PRD-MAIN.md          product requirements
prds/                one PRD per build agent (A to F)
contracts/           schemas + fixtures (owned by the human; agents read only)
packages/capture/    A: local-only fork of @alikeai/setup (MIT)
packages/summarizer/ B: Digests, decisions, attribution
packages/vault/      C: Markdown vault writer + event adapter
packages/mcp/        D: MCP query server
packages/voice/      E: Dial voice assistant
packages/evals/      F: evals (Sparta)
demo/                demo script and assets (F)
scripts/             demo-reset, backfill (F)
```

## Requirements

- Node.js 20+
- pnpm
- Git
- Optional: Ollama (local mode), Keewano account, Dial account (coupon `DIAL_FOR_SPEEDHACKS`), Sparta access

## Quick start

```bash
pnpm install
cp config.example.json ~/.sitdown/config.json   # set vaults_root, central_vault, event_store, llm
pnpm --filter capture run install-hooks        # wires agent + git hooks (local only)
pnpm --filter mcp run start                    # MCP server
pnpm --filter evals run eval                   # score the docs
node scripts/demo-reset.mjs                    # reset to a known demo state
```

Register the MCP server in Claude Code so new sessions start briefed:

```bash
claude mcp add sitdown -- node packages/mcp/dist/stdio.js
```

## Modes

| Mode | Summaries (`llm`) | Events | Network |
| --- | --- | --- | --- |
| Default | `claude_cli` — `claude -p` (uses your Claude Code session; no API key) | SQLite | Only Claude Code's own traffic |
| Hackathon | `cloud` — Anthropic API (`LLM_API_KEY`) | Keewano | Yes |
| Local | `ollama` — local model | SQLite | None; no login, nothing leaves the machine |

## What is mocked

Honest status for judges.

**Fully working, live (no mocks):**
- Capture (A): real Claude Code / Codex transcript + git-commit parsing into schema-valid records.
- Summarizer (B): end-to-end on fixtures; the default `claude_cli` backend shells out to `claude -p` (uses your Claude Code session — no API key). `cloud` (needs `LLM_API_KEY`) and `ollama` backends also implemented.
- Vault (C): real Markdown vault + **SQLite** event store, git-committed.
- MCP (D): all 7 tools over stdio + HTTP, served from the real vault + SQLite events.
- Loop A→B→C→D and the eval suite (F) run live: `demo-reset` → MCP → `pnpm --filter @sitdown/evals run eval` scores 21/21 against the generated vault.

**Mocked / not yet verified against the real service:**
- **Keewano**: events are *written* to the REST ingress but all reads (`who_knows`, open-threads) are served from the local SQLite mirror; custom-event registration (IDs 2000+) is not performed. SQLite mode is the live path.
- **Dial voice/SMS (E)**: the REST client is built but unverified against a live account; the offline demo uses a canned transcript. A real phone call depends on the inferred Dial contract + a live key, and mid-call doc lookup needs a public tunnel.
- **`claude_cli` (B, default)**: the adapter + parsing are unit-tested with an injected runner, but a real `claude -p` summarization run depends on Claude Code being installed and signed in.
- **Ollama (B)**: local-LLM backend is implemented but has no test / was not run against a live Ollama.
- **Codex capture (A)**: Claude Code is verified; the Codex end-of-session hook config format is not vendor-verified.
- **demo-reset** replays the known **fixture digests** through C (deterministic, offline) rather than re-summarizing today's live sessions through B (that path needs `LLM_API_KEY`).

**Not done:** Sparta rubric (`packages/evals/SPARTA.md`) and Alike evidence (`demo/ALIKE.md`) are empty pending onsite info; backup video + HackerSquad submission are process steps, not code.

Paths: home `~/.sitdown/` holds inbox/processed/events; the Obsidian **vaults are separate** — `vaults_root` (default `~/sitdown/vaults`) holds the `central/` vault plus one `<person>/` vault each. `demo-reset` uses an isolated `~/.sitdown/vaults` so it never touches a real vault. (Personal→central links use `obsidian://` URLs, since `[[wikilinks]]` don't span separate Obsidian vaults.)

## Credits

`packages/capture` is a fork of [`@alikeai/setup`](https://www.npmjs.com/package/@alikeai/setup), MIT, Copyright (c) 2026 Alike AI. Partner tools: Alike, Dial, Keewano, Sparta.
