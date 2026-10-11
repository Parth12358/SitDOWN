# &lt;app&gt;: Automated Agent Documentation

> Placeholder name. Replace every `<app>` in these docs with the real name before starting the agents.

`<app>` turns every coding-agent session and commit into living, linked documentation that people and agents can query. Docs are plain Markdown in a vault you own (Obsidian-compatible). A voice assistant that answers questions in standups is a secondary way to read them.

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
cp config.example.json ~/.<app>/config.json   # set vault_path, event_store, llm
pnpm --filter capture run install-hooks        # wires agent + git hooks (local only)
pnpm --filter mcp run start                    # MCP server
pnpm --filter evals run eval                   # score the docs
node scripts/demo-reset.mjs                    # reset to a known demo state
```

Register the MCP server in Claude Code so new sessions start briefed:

```bash
claude mcp add <app> -- node packages/mcp/dist/stdio.js
```

## Modes

| Mode | Summaries | Events | Network |
| --- | --- | --- | --- |
| Hackathon | Cloud LLM | Keewano | Yes |
| Local | Ollama | SQLite | None; no login, nothing leaves the machine |

## What is mocked

Keep this list honest for judges. Update before submitting.

- [ ] (fill in)

## Credits

`packages/capture` is a fork of [`@alikeai/setup`](https://www.npmjs.com/package/@alikeai/setup), MIT, Copyright (c) 2026 Alike AI. Partner tools: Alike, Dial, Keewano, Sparta.
