# @sitdown/evals (Agent F)

Prove the docs are accurate, make the demo repeatable, and package the submission.

**PRD:** [`../../prds/PRD-F-evals-demo.md`](../../prds/PRD-F-evals-demo.md) · **Owns:** `packages/evals/`, `demo/`, `scripts/`, and the root `README.md` ("What is mocked" + polish).

## Evals
- `cases.json` — 20 questions written from the fixtures (5 unanswerable → expect "I don't know").
- `pnpm --filter @sitdown/evals run eval` — calls MCP tools, scores accuracy / made-up / correct-IDK / latency (p50, max), prints a table, writes `results.json`.
- **Until D delivers:** run against a stub that reads `contracts/fixtures/vault/` directly.
- Sparta: see `SPARTA.md`.

## Demo & scripts
- `demo/SCRIPT.md` — under 5 minutes.
- `demo/ALIKE.md` — Alike-prize evidence.
- `scripts/demo-reset.mjs` — reset vault + event store to a known state, replay today's sessions through B and C (Node only; Linux/Mac/Windows).
