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
- [ ] LLM adapter with one interface and three backends, chosen by `llm` in config:
  - `claude_cli` (**default**): shells out to `claude -p … --output-format json` — uses the signed-in Claude Code session, so no API key. Override the binary with `CLAUDE_BIN`, timeout with `CLAUDE_TIMEOUT_MS`.
  - `cloud`: Anthropic API, key from `LLM_API_KEY`, model from `LLM_MODEL`.
  - `ollama`: local model at `OLLAMA_HOST`.

  Ask for strict JSON matching the Digest schema; validate; retry once on invalid output; on second failure write a Digest with only `headline` and `summary`.
- [ ] Long transcripts: drop tool outputs over 2 KB and keep prompts, agent messages, tool names, and file paths before sending.
- [ ] Decisions: chosen option, rejected alternatives, reason. Include approaches the agent tried that the user rejected. Decision `slug` is kebab-case and stable.
- [ ] `feature`: from branch name (`feat/payments` → `payments`), else most-edited top-level folder, else ask the LLM.
- [ ] `human_interventions`: count of user messages that correct, reject, or redirect the agent mid-session.
- [ ] Attribution, recorded not guessed. Decide per commit by **who authored the commit**:
  - In an **agent's own commit** (co-authored-by trailer, or lines matching that session's `edits`): matched lines → `agent`.
  - In a **human's later commit** on the same branch/file that overlaps lines an earlier session wrote → `agent_edited` (the human changed agent code).
  - Remaining added lines → `human`.
  - No session match but a `Co-authored-by: Claude` (or similar) trailer → `agent` for the whole commit.
  - Never infer from code style.

  Note: the fixture `commit-9f2e1d` is a **human** commit editing the agent's refund code, so its overlapping range is `agent_edited` and the new tail is `human` — this is the canonical example of the second rule. The current B implementation labels every session-matched range `agent_edited`; that is correct for human commits like the fixture but would mislabel an agent's *own* follow-up commit — track as a known gap.
- [ ] Secret filtering before any LLM call: API-key patterns, bearer tokens, private keys, `.env`-style `KEY=value` lines → `[REDACTED]`.

## Done when

- [ ] All fixture records produce Digests that pass schema validation.
- [ ] At least one fixture decision is extracted correctly with its rejected alternative.
- [ ] Fixture commit gets correct `agent` vs `human` labels.
- [ ] Ollama backend produces a valid Digest for one fixture.

## Out of scope

Capturing (A), writing notes or events (C).
