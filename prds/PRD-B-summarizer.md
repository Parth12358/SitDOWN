# PRD B: Summarizer and attribution

Read `OVERALL_PLAN.md` and `contracts/` first.

## Goal

Turn raw session and commit records into Digests: what happened, which decisions were made and why, and who wrote which lines.

## Owns

`packages/summarizer/` only.

## Inputs and outputs

- **In:** `~/.sitdown/inbox/sessions/*.json`, `~/.sitdown/inbox/commits/*.json`, and the transcript at each SessionRecord's `transcript_path`.
- **Out:** `~/.sitdown/processed/<source>.json` (Digest). Schema in `OVERALL_PLAN.md`.
- **Until A delivers:** use `contracts/fixtures/inbox/` and `contracts/fixtures/transcripts/`. Compare your output to `contracts/fixtures/processed/`.

## Requirements

- [ ] Watch the inbox (polling every few seconds is fine) and process each record exactly once; track processed IDs in `~/.sitdown/state/summarizer.json`.
- [ ] Export a `summarize(record)` function too, so others can call it directly.
- [ ] LLM adapter with one interface and two backends: cloud API (default; key from `LLM_API_KEY`) and Ollama (`llm: "ollama"` in config). Ask for strict JSON matching the Digest schema; validate; retry once on invalid output; on second failure write a Digest with only `headline` and `summary`.
- [ ] Long transcripts: drop tool outputs over 2 KB and keep prompts, agent messages, tool names, and file paths before sending.
- [ ] Decisions: chosen option, rejected alternatives, reason. Include approaches the agent tried that the user rejected. Decision `slug` is kebab-case and stable.
- [ ] `feature`: from branch name (`feat/payments` → `payments`), else most-edited top-level folder, else ask the LLM.
- [ ] `human_interventions`: count of user messages that correct, reject, or redirect the agent mid-session.
- [ ] Attribution, recorded not guessed:
  - Lines in a commit that match an earlier SessionRecord's `edits` on the same branch and file → `agent`
  - Agent lines that a human later changed in another commit → `agent_edited`
  - Remaining added lines → `human`
  - No session match but a `Co-authored-by: Claude` (or similar) trailer → `agent` for the whole commit
  - Never infer from code style
- [ ] Secret filtering before any LLM call: API-key patterns, bearer tokens, private keys, `.env`-style `KEY=value` lines → `[REDACTED]`.

## Done when

- [ ] All fixture records produce Digests that pass schema validation.
- [ ] At least one fixture decision is extracted correctly with its rejected alternative.
- [ ] Fixture commit gets correct `agent` vs `human` labels.
- [ ] Ollama backend produces a valid Digest for one fixture.

## Out of scope

Capturing (A), writing notes or events (C).
