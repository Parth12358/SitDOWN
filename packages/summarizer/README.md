# @sitdown/summarizer (Agent B)

Turns raw session/commit records into **Digests**: what happened, which decisions were made and why, and who wrote which lines.

**PRD:** [`../../prds/PRD-B-summarizer.md`](../../prds/PRD-B-summarizer.md) · **Owns:** this package only.

## I/O (contract)
- **In:** `~/.sitdown/inbox/sessions/*.json`, `inbox/commits/*.json`, and each session's `transcript_path`.
- **Out:** `~/.sitdown/processed/<source>.json` (Digest — `contracts/schemas/digest.schema.json`).
- **Until A delivers:** read `contracts/fixtures/inbox/` + `contracts/fixtures/transcripts/`; compare output to `contracts/fixtures/processed/`.

## Key points
- Export `summarize(record)` (done as a stub in `src/index.ts`).
- LLM adapter, three backends (set `llm` in config): **`claude_cli`** (default — `claude -p`, no API key), `cloud` (`LLM_API_KEY`), `ollama`. Strict-JSON → validate → retry once → fall back to `headline`+`summary`.
- Attribution is **recorded, never guessed from code style** (see PRD-B rules).
- Redact secrets before any LLM call.

```bash
pnpm --filter @sitdown/summarizer build
pnpm --filter @sitdown/summarizer test
```
