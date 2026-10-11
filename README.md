# SitDOWN — automated agent documentation

SitDOWN turns every coding-agent session and git commit into living, linked Markdown docs that people and the *next* agent can query. The reasoning behind the work — what was tried, rejected, and why — is captured automatically, attributed to human vs AI, and made answerable in plain language.

Docs live in Obsidian-compatible vaults you own: **one personal vault per person** (their own log + private notes) plus a **shared central vault** for team features and decisions. A web dashboard ("Ask the record") puts an AI on top of it all.

> New here? The fastest way to see it is the [demo](#run-the-demo). To debug a setup (especially on Windows), see **[`docs/`](docs/)**.

## Requirements

- **Node.js 20+** and **pnpm** (via `corepack enable pnpm`)
- **Git**
- **Claude Code**, installed and signed in — the default summarizer and the dashboard AI use your session via `claude -p` (no API key needed)
- Optional: `LLM_API_KEY` (cloud LLM), Ollama (local LLM), Keewano / Dial / Sparta accounts

Everything is pure JavaScript (SQLite via `sql.js` — no native builds), so it runs on Linux, macOS, and Windows.

## Install

```bash
corepack enable pnpm      # if you don't have pnpm
pnpm install
pnpm build                # compile the TypeScript packages
```

## Run the demo

The dashboard demo runs the whole product locally against a generated org's worth of data.

```bash
pnpm demo                 # build → seed the demo org → serve http://localhost:8788
```

Then open **http://localhost:8788** and ask things in plain language ("why do refunds use idempotency keys?", "what did otto do?", "who knows billing?", or hit **Standup**). Every answer cites its source notes — click a `.md` chip to read the note inline.

Other handy commands:

```bash
pnpm demo:showcase        # narrated, end-to-end walkthrough of every feature + a live capture test
pnpm demo:test            # the live A→B→C→D test on its own (asserts a new session becomes queryable)
pnpm demo:seed            # rebuild the demo vault + events to the known state
pnpm demo:serve           # just serve (after a seed)
```

Recording on **Windows**? Use Windows Terminal and see **[`docs/windows.md`](docs/windows.md)**.

## Use it on a real project

```bash
cp config.example.json ~/.sitdown/config.json          # set vaults_root, central_vault, llm
pnpm --filter @sitdown/capture run install-hooks        # capture agent sessions (local only)
pnpm --filter @sitdown/capture run install-git-hook     # capture commits (run in each repo)
pnpm --filter @sitdown/mcp run start                    # the MCP query server (stdio)
```

Register the MCP server with Claude Code so new sessions start briefed:

```bash
claude mcp add sitdown -- node packages/mcp/dist/stdio.js
```

## How it works

```text
agent sessions ─┐
                ├─► A capture ─► B summarizer ─► C vault + events ─► D MCP ─┬─► coding agents (start briefed)
git commits ────┘   (records)   (digests, claude -p) (central + per-person) ├─► Ask dashboard / voice (E)
                                                                            └─► evals (F)
```

Files on disk are the interface between stages, so each stage runs alone. Full contracts: [`OVERALL_PLAN.md`](OVERALL_PLAN.md). Architecture + where to look per stage: [`docs/architecture.md`](docs/architecture.md).

## Modes

| Mode | Summaries (`llm`) | Events | Network |
| --- | --- | --- | --- |
| **Default** | `claude_cli` — `claude -p` (your Claude Code session; no API key) | SQLite | Only Claude Code's own traffic |
| Cloud | `cloud` — Anthropic API (`LLM_API_KEY`) | Keewano | Yes |
| Local | `ollama` — local model | SQLite | None; no login, nothing leaves the machine |

## Repo layout

```text
README.md             this file
docs/                 install, Windows, troubleshooting, architecture
OVERALL_PLAN.md       contracts between packages
prds/                 one PRD per build area (A–F)
contracts/            schemas + fixtures (read-only interface)
packages/capture/     A: capture agent sessions + commits → records
packages/summarizer/  B: records → Digests (claude -p / cloud / ollama)
packages/vault/       C: Digests → central + per-person vaults, + events
packages/mcp/         D: MCP query server (stdio + HTTP), 7 tools
packages/voice/       E: Dial voice/SMS meeting assistant
packages/evals/       F: eval suite
demo/                 the "Ask the record" dashboard, server, seeder, showcase
scripts/              demo-reset, backfill
```

## What is mocked

Honest status.

**Fully working, live (no mocks):** capture (A), summarizer (B, real `claude -p`), vault + **SQLite** events (C), MCP's 7 tools over stdio + HTTP (D), the A→B→C→D loop, the dashboard's RAG answers + standup + note reader, and the eval suite (21/21).

**Mocked / unverified against the real service:**
- **Keewano** — events are *written* to the REST ingress but reads are served from the SQLite mirror; custom-event registration isn't done. SQLite is the live path.
- **Dial voice/SMS (E)** — REST client built but unverified against a live account; the offline demo uses a canned transcript.
- **Ollama (B)** — implemented, not run against a live Ollama.
- **Codex capture (A)** — Claude Code is verified; Codex's hook format is vendor-unverified (installer marks it experimental).

**Not done:** Sparta rubric and Alike evidence (onsite), backup video + submission.

Paths: `~/.sitdown/` holds inbox/processed/events; vaults are separate under `vaults_root` (`central/` + one `<person>/` each). The demo uses an isolated `demo/.sitdown-demo` so it never touches a real vault.

## Credits

`packages/capture` is a fork of [`@alikeai/setup`](https://www.npmjs.com/package/@alikeai/setup), MIT, © 2026 Alike AI. Partner tools: Alike, Dial, Keewano, Sparta.
