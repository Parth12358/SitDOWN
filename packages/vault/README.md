# @sitdown/vault (Agent C)

Turns Digests into an Obsidian-compatible Markdown vault the developer owns, plus a stream
of typed events the product queries.

**PRD:** [`../../prds/PRD-C-vault-events.md`](../../prds/PRD-C-vault-events.md) · **Owns:** this package only.

## I/O (contract)
- **In:** `~/.sitdown/processed/*.json` (Digest).
- **Out:** notes split across a shared **central** vault (`daily/`, `features/`, `decisions/`, shareable `people/`) and one **personal** vault per person (`daily/` + private `me.md`, their activity only), all under `vaults_root`; + events in Keewano or SQLite.
- **Build/target fixtures:** reads `contracts/fixtures/processed/`; target shape is `contracts/fixtures/vault/`.

## Run

```bash
pnpm --filter @sitdown/vault build

# Process new Digests -> vault + events, then commit the vault (one-shot).
pnpm --filter @sitdown/vault process
pnpm --filter @sitdown/vault process -- --watch      # poll every 3s
pnpm --filter @sitdown/vault process -- --all        # reprocess every Digest

# Replay git history as events (run early; Keewano needs ~5 min to be queryable).
pnpm --filter @sitdown/vault backfill -- --repo /path/to/repo [--limit N] [--store sqlite|keewano]

pnpm --filter @sitdown/vault test
```

### Config & env
Reads `~/.sitdown/config.json` (`vaults_root`, `central_vault`, `event_store`, `people`). Everything is
overridable by env — handy for fixtures/tests:

| Env | Meaning | Default |
| --- | --- | --- |
| `SITDOWN_HOME` | runtime home | `~/.sitdown` |
| `SITDOWN_CONFIG` | config path | `$SITDOWN_HOME/config.json` |
| `SITDOWN_VAULTS_ROOT` | base dir: central + per-person vaults | `$SITDOWN_HOME/vaults` |
| `SITDOWN_CENTRAL_VAULT` | central (shared) vault dir | `$SITDOWN_VAULTS_ROOT/central` |
| `SITDOWN_PROCESSED` | Digest input dir | `$SITDOWN_HOME/processed` |
| `SITDOWN_EVENT_STORE` | `sqlite` \| `keewano` | config `event_store` or `sqlite` |
| `SITDOWN_EVENTS_DB` | SQLite file path | `$SITDOWN_HOME/events.sqlite` |
| `SITDOWN_KEEWANO_DRYRUN=1` | log Keewano payload instead of POSTing | off |
| `KEEWANO_API_KEY` / `KEEWANO_PAT` | Keewano auth | — |

## Key guarantees
- Writes **only** between `<!-- auto:start -->` and `<!-- auto:end -->`. Text outside the
  markers (and any human-added frontmatter keys) is preserved byte-for-byte; markers are
  created on a note that has none. Re-runs are idempotent.
- Atomic writes (temp file → rename). The vault is a git repo; commits once per batch with a
  message naming the sources.
- Selective regeneration: only notes whose Digests are new/changed are rebuilt (state in
  `$SITDOWN_HOME/state/vault.json`). Aggregate notes are rebuilt from the full Digest set so
  history never duplicates.
- Exports `writeDigest` / `writeDecision` (+ `writeBatch`, `collectAffected`, `loadConfig`,
  `loadDigests`) — **D imports `writeDecision`** for `record_decision`; D can also reuse
  `makeEventSink` / `eventsForDigest` / `entityFor` to write its own events (e.g. `QuestionAsked`).

## Event mapping (per Digest)
Entity = `UUIDv5(author, 6ba7b810-9dad-11d1-80b4-00c04fd430c8)`. `FeatureTouched` always first.
Categories/numbers only.

| Digest source | Events (in order) |
| --- | --- |
| `session:<agent>:<id>` | `FeatureTouched(feature)`, `HumanIntervened`×`human_interventions`, `AgentSession(kind)`, `DecisionRecorded(slug)`× |
| `commit:<sha>` | `FeatureTouched(feature)`, `CommitMade(Σ added lines)`, `AuthorType(dominant label)` |

Agent token → kind: `claude`→`claude_code`, `codex`→`codex`, else the token (unknown→`other`).
SQLite schema matches the contract: `events(entity, name, value, ts)`, `value` TEXT
(numbers/bools stringified, `HumanIntervened`→NULL). Keewano custom event IDs start at 2000.

## Notes for integrators (contract gaps flagged to the human)
1. **Timestamps & same-day ordering.** A Digest carries only `date` (no wall-clock time —
   those live in A's SessionRecords). Event `ts` is derived from `date` with per-event
   increments to preserve ordering; same-day note ordering uses a deterministic rule
   (sessions before commits within a day). Minute-level times in the seed fixture are not
   reproducible from Digests alone.
2. **`AuthorType` for multi-label commits.** We emit one `AuthorType` = the label covering
   the most lines (matches the seed). One-event-per-label is the alternative if preferred.
3. **SQLite event-store path.** The config has no explicit path; we default to
   `~/.sitdown/events.sqlite` (override `SITDOWN_EVENTS_DB`). **D must point at the same
   path** in live mode (fixtures: `contracts/fixtures/events.sqlite`).

Note prose (decision Chose/Rejected/Reason, feature/daily headlines) is rendered **verbatim
from the Digest**. The hand-polished fixture vault adds editorial touches (backticks, extra
phrasing) that aren't derivable from Digest fields — structure, frontmatter, markers,
wikilinks, citations, and cross-day ordering match exactly.
