# PRD F: Evals, data, and demo

Read `OVERALL_PLAN.md` and `contracts/` first.

## Goal

Prove the docs are accurate, make the demo reliable and repeatable, and package the submission.

## Owns

`packages/evals/`, `demo/`, `scripts/`, and the root `README.md` ("What is mocked" section and final polish).

## Inputs and outputs

- **In:** MCP HTTP endpoint from D; fixtures; Alike dashboard.
- **Out:** eval score table; `scripts/demo-reset.mjs`; `demo/SCRIPT.md`; Alike evidence; final README.
- **Until D delivers:** run evals against a stub that reads `contracts/fixtures/vault/` directly.

## Requirements

### Evals

- [ ] Eval set in `packages/evals/cases.json`: 20 or more questions with expected answers, written from the fixtures. Mix:
  - who built what
  - why a decision was made
  - what was rejected
  - how much of a feature was AI-written
  - at least 4 questions the docs cannot answer (expected: "I don't know")
- [ ] Runner calls MCP tools and scores: accuracy, made-up answers, correct "I don't know", latency (p50 and max). Print a table and write `results.json`.
- [ ] Sparta: get the rubric and agent guide from Saad Asad onsite; shape output to what Sparta expects. Record notes in `packages/evals/SPARTA.md`.

### Demo

- [ ] `scripts/demo-reset.mjs` (Node only, runs on Linux, Mac, Windows): reset the vault and event store to a known state, then replay today's real sessions through B and C.
- [ ] `demo/SCRIPT.md`, under 5 minutes:
  1. The problem (30 seconds)
  2. Open the vault: notes written automatically from today's real sessions, decisions linked, code labeled human or AI
  3. Start a fresh agent session; it pulls context with `get_brief` instead of starting blind
  4. Ask a question; show the live Keewano query behind `who_knows`
  5. Voice call answers a question; follow-up text arrives
  6. Eval scores
  7. What's mocked, what's next
- [ ] Alike evidence for the Alike prize: dashboard screenshots plus 2 to 3 concrete moments it helped during the build, in `demo/ALIKE.md`.
- [ ] Record a backup demo video by 4:00 PM.

### Submission

- [ ] README: setup, architecture, modes, "What is mocked" filled in honestly.
- [ ] HackerSquad: project details, team, technologies, GitHub repo, Keewano project name, video. Submit by 4:45 PM.

## Done when

- [ ] Eval runner prints a score table against the live MCP server.
- [ ] Demo runs end to end from `demo-reset` in under 5 minutes.
- [ ] Backup video recorded.
- [ ] Submission complete.

## Out of scope

Changing other packages. File issues for other agents instead.
