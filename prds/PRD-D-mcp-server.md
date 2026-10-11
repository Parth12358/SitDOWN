# PRD D: MCP query server

Read `OVERALL_PLAN.md` and `contracts/` first.

## Goal

One MCP server that lets coding agents, the voice assistant, and evals query the docs. A new agent session should start already knowing recent decisions.

## Owns

`packages/mcp/` only.

## Inputs and outputs

- **In:** the vault at `vault_path`; the event store (Keewano or SQLite).
- **Out:** MCP tools over stdio (coding agents) and HTTP (voice assistant and evals). Tool list in `OVERALL_PLAN.md`.
- **Until C delivers:** point at `contracts/fixtures/vault/` and `contracts/fixtures/events.sqlite`.

## Requirements

- [ ] Use the official MCP TypeScript SDK. Two entry points: `dist/stdio.js` and `dist/http.js` (port from env, default 7331).
- [ ] Build order: `get_brief`, `search_docs`, `get_summary` first; then `get_decision`, `who_knows`, `log_unanswered`, `record_decision`.
- [ ] `get_brief({ branch?, feature? })`: resolve feature from branch if needed; return the 5 most recent decisions (chosen, rejected, reason), open threads, and who else touched it recently. Under 500 ms.
- [ ] `get_summary({ author?, from?, to? })`: read daily and person notes; return a short spoken-friendly summary per person. Under 500 ms.
- [ ] `search_docs({ query })`: keyword search over note text and frontmatter; rank by match and recency; return top 5 with path, snippet, and sources. Embeddings only if time allows.
- [ ] `get_decision({ slug?, topic? })`: exact slug, else best keyword match.
- [ ] `who_knows({ feature })`: query the event store for authors ranked by recent `FeatureTouched` + `CommitMade` activity. With Keewano, use its MCP (`https://api.keewano.com/mcp`, header `k-token` from `KEEWANO_PAT`) or its SQL; with SQLite, plain SQL.
- [ ] `log_unanswered({ topic, asked_by? })`: write `QuestionAsked(topic)` and `AnswerFound(false)` events; return the top `who_knows` result as the person to ping.
- [ ] `record_decision(...)`: import C's `writeDecision`; don't duplicate the writer.
- [ ] Every response cites note paths and source session or commit IDs.
- [ ] Respect `private: true` person notes: only return them to their author (pass `requester` where known).
- [ ] Install snippet in this package's README: `claude mcp add sitdown -- node packages/mcp/dist/stdio.js`.
- [ ] Optional: a Claude Code `SessionStart` hook snippet that calls `get_brief` for the current branch.

## Done when

- [ ] A fresh Claude Code session in the repo calls `get_brief` and accurately states recent decisions from the vault.
- [ ] `who_knows("payments")` returns a ranked list from events.
- [ ] HTTP endpoint answers `get_summary` for E and F.

## Out of scope

Writing notes (C), voice (E), eval scoring (F).
