# Architecture & where to look

Five stages. **Files on disk are the interface between them**, so each stage runs standalone and you can debug one at a time.

```text
agent sessions ─┐
                ├─► A capture ─► B summarizer ─► C vault + events ─► D MCP ─┬─► coding agents
git commits ────┘   records        digests        central + per-person      ├─► Ask dashboard (E/demo)
                                                   vaults + SQLite events    └─► evals (F)
```

| Stage | Package | Reads | Writes | Debug by |
| --- | --- | --- | --- | --- |
| **A** capture | `packages/capture` | agent transcripts, git commits | `~/.sitdown/inbox/{sessions,commits}/*.json` (SessionRecord / CommitRecord) | look at an inbox JSON; `pnpm --filter @sitdown/capture test` |
| **B** summarizer | `packages/summarizer` | inbox records + the transcript | `~/.sitdown/processed/<source>.json` (Digest) via `claude -p` / cloud / ollama | call `summarize()`; check a Digest has `headline`/`decisions`/`attribution` |
| **C** vault + events | `packages/vault` | processed Digests | `central/` + `<person>/` Markdown vaults; `events.sqlite` (or Keewano) | open the generated notes; `select * from events` |
| **D** MCP | `packages/mcp` | the central vault + event store | tool results over **stdio** and **HTTP** | `curl /api/health`, `/api/tool`, `/api/answer` |
| **F** evals | `packages/evals` | D's HTTP endpoint | score table + `results.json` | `pnpm demo:test` / the eval runner |

The demo (`demo/`) wraps D for the browser: `serve.mjs` serves the dashboard and exposes `/api/tool`, `/api/answer` (RAG over the vault), `/api/standup`, and `/api/note`.

## Data shapes (the contract)

Full JSON Schemas live in [`../contracts/schemas/`](../contracts/schemas); types in [`../contracts/types.ts`](../contracts/types.ts). In short:

- **SessionRecord / CommitRecord** (A) — who, repo/branch, prompts, file edits with line ranges, `co_authors`.
- **Digest** (B) — `headline`, `summary`, `decisions[] {chosen, rejected[], reason}`, `attribution[] {file, lines, label}`, `human_interventions`. Attribution is *recorded*, never guessed from code style.
- **Vault notes** (C) — frontmatter + a body between `<!-- auto:start -->` / `<!-- auto:end -->`; the tool only ever writes between those markers, so hand-written text is safe.
- **Events** (C) — `events(entity, name, value, ts)`; `entity = UUIDv5(author, namespace)`. Categories/numbers only.

## The two vaults

- **central/** — shared team docs: `features/`, `decisions/`, team `daily/`, and a shareable `people/<author>.md` index.
- **`<person>/`** — that person's own vault: their `daily/` + a private `me.md`. Only their own activity. Cross-references into central use `obsidian://` links (plain `[[wikilinks]]` don't span separate Obsidian vaults).

Privacy is structural: a person's vault is only ever read for that person.

## The AI layer (demo `/api/answer`)

RAG with a grounded prompt:

1. **Retrieve** — if the question names (or tags) a person, build a full dossier (profile, every daily entry, decisions authored, features touched); always also run keyword `search_docs`.
2. **Guard** — if nothing is retrieved, return "I don't know" without calling the model (first hallucination guard).
3. **Generate** — `claude -p` with XML-delimited blocks, a context-only rule, mandatory citations, and an explicit not-found rule (second guard). Recent turns are passed as `history` so follow-ups keep their subject.

So answers are grounded in the vault and cite the exact notes — which the dashboard lets you open (`/api/note`).

## Where state lives

- Runtime home: `~/.sitdown/` → `inbox/`, `processed/`, `state/` (selective-regen + emit bookkeeping), `events.sqlite`.
- Demo home: `demo/.sitdown-demo/` (git-ignored) with its own `vaults/`, `events.sqlite`, `config.json`.
- The vault is itself a git repo (C `git init`s it) so you get a reviewable history for free.
