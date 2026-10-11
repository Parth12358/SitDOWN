# @sitdown/mcp (Agent D)

One MCP server so coding agents, the voice assistant, and evals can query the docs. A new agent session starts already knowing recent decisions.

**PRD:** [`../../prds/PRD-D-mcp-server.md`](../../prds/PRD-D-mcp-server.md) · **Owns:** this package only.

## I/O (contract)
- **In:** the central vault (shared queries) + the caller's own personal vault (private notes); the event store (Keewano or SQLite).
- **Out:** MCP tools over **stdio** (`dist/stdio.js`) and **HTTP** (`dist/http.js`, port `MCP_HTTP_PORT`, default 7331).
- **Until C delivers:** falls back automatically to `contracts/fixtures/vault/` and `contracts/fixtures/events.sqlite`, so it runs standalone today.

## Build & run
```bash
pnpm --filter @sitdown/mcp build
pnpm --filter @sitdown/mcp start        # stdio (coding agents)
pnpm --filter @sitdown/mcp start:http   # HTTP on MCP_HTTP_PORT (default 7331), for voice (E) + evals (F)
pnpm --filter @sitdown/mcp test         # functional tests against a temp copy of the fixtures
```
HTTP: POST JSON-RPC to `http://localhost:7331/mcp` (standard MCP Streamable HTTP — `initialize`
returns an `mcp-session-id` to echo on later calls). Liveness probe at `GET /health`.

## Tools
`get_brief`, `search_docs`, `get_summary` (built first); then `get_decision`, `who_knows`, `log_unanswered`, `record_decision`.

- Every response cites note paths + source session/commit IDs (`citations`), and uses `found: false` + an "I don't know" message when the docs can't answer.
- `who_knows` reverse-maps `author → entity = UUIDv5(author, DNS-ns)` and ranks by recent `FeatureTouched` + `CommitMade`. Must match C's entity derivation in `contracts/make-events-sqlite.mjs`.
- `record_decision` imports `writeDecision` from `@sitdown/vault` — don't duplicate the writer. Until C ships it, a clearly-labeled local fallback writes the exact contract note format (`used_fallback: true` in the result).
- Respect `private: true` person notes: only return them to their author. Pass `requester` on `get_brief`/`search_docs`/`get_summary`, or set `SITDOWN_REQUESTER`.
- `get_brief` / `get_summary` target < 500 ms.

## Config & environment
Reads `~/.sitdown/config.json` (`vaults_root`, `central_vault`, `event_store`, `people`). Overrides, useful for dev/demo:

| Env | Purpose |
| --- | --- |
| `SITDOWN_CENTRAL_VAULT` | central (shared) vault dir (else config, else fixtures) |
| `SITDOWN_VAULTS_ROOT` | base dir holding central + per-person vaults |
| `SITDOWN_VAULT_PATH` | legacy alias for `SITDOWN_CENTRAL_VAULT` |
| `SITDOWN_EVENTS_DB` | SQLite event store path (else `~/.sitdown/events.sqlite`, else fixtures) |
| `SITDOWN_REQUESTER` | default author slug for private-note gating |
| `MCP_HTTP_PORT` | HTTP port (default 7331) |
| `KEEWANO_PAT` | Keewano token; enables dual-write to Keewano's ingress |

## Register with Claude Code
```bash
claude mcp add sitdown -- node packages/mcp/dist/stdio.js
```

### Optional: SessionStart hook (auto-brief)
`hooks/session-start.mjs` prints a brief for the current git branch's feature; add to `.claude/settings.json` so every session starts briefed (fails open within 5s):
```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "node packages/mcp/hooks/session-start.mjs" }] }
    ]
  }
}
```

## What's mocked
- **Keewano reads** are not wired: in `event_store: "keewano"` mode we dual-write events to Keewano's ingress but answer `who_knows` / open-threads from the local SQLite mirror. SQLite mode is fully live.
- Until A→B→C run live, inputs come from `contracts/fixtures/` via the automatic fallback.
