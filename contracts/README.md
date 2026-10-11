# contracts/

The interface between all SitDOWN packages. **Owned by the human. Agents read only — never edit.**

Files on disk are the contract. Each stage reads one folder and writes the next, so every stage runs alone against the fixtures here.

```text
~/.sitdown/inbox/sessions/   A writes SessionRecord JSON   -> B reads
~/.sitdown/inbox/commits/    A writes CommitRecord JSON    -> B reads
~/.sitdown/processed/        B writes Digest JSON          -> C reads
<vault_path>/                C writes Markdown notes       -> D reads
<event store>                C writes events               -> D reads
MCP server (stdio + HTTP)    D serves tools                -> coding agents, E, F
```

Home dir is `~/.sitdown/` (never `~/.alike/`), so SitDOWN runs beside the real Alike without collisions.

## Layout

```text
contracts/
  schemas/                 JSON Schema (draft-07) for each record type
    session-record.schema.json
    commit-record.schema.json
    digest.schema.json
    config.schema.json
  package.json             exposes types as the type-only workspace package `@sitdown/contracts`
  types.ts                 TypeScript types mirroring the schemas; `import type { Digest } from "@sitdown/contracts"`
  fixtures/
    transcripts/           raw agent transcripts (jsonl) referenced by SessionRecords
    inbox/sessions/        SessionRecords (A's output)   -> B's input
    inbox/commits/         CommitRecords (A's output)    -> B's input
    processed/             Digests (B's output)          -> C's input
    vault/                 sample Obsidian vault (C's output) -> D's input
    events.seed.json       event rows, backend-neutral
    events.seed.sql        same rows as SQL (CREATE + INSERT)
    events.sqlite          seeded SQLite store (generate with `pnpm fixtures:events`)
  make-events-sqlite.mjs   builds events.sqlite from events.seed.json
```

## Rules (see OVERALL_PLAN.md)

1. Build against `fixtures/` first. Never wait for another agent.
2. If a contract looks wrong or blocks you, stop and tell the human. Do not work around it.
3. Validate your output against the matching schema in `schemas/`.

## Fixture storyline

Two features, two people, so ranking, attribution, and "I don't know" cases all have data:

- **payments** — `sam` added a refund endpoint (agent session `claude:abc123`), decision `refund-idempotency`; commit `9f2e1d` fixed rounding (human-edited agent code).
- **auth** — `alex` added JWT refresh (agent session `claude:def456`), decision `jwt-refresh-rotation`; commit `7a3b2c`. One Codex session `codex:ghi789` touched auth too.

Nothing in the fixtures mentions billing, deploys, or rate-limiting — those are the "docs can't answer this" eval cases (PRD F).
