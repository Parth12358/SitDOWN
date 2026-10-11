# Overall Plan

Every build agent reads this file before starting. It holds the schedule, the rules, and the contracts all packages code against. Your own PRD is in `prds/`.

## Rules for every agent

1. Read `contracts/` and this file first.
2. Edit only files under your own package (listed in your PRD as "Owns"). Never edit `contracts/` or another package.
3. If a contract looks wrong or blocks you, stop and tell the human. Do not work around it.
4. Build against `contracts/fixtures/` first. Never wait for another agent.
5. Write all scripts in Node (not bash). Build paths with `path.join` and `os.homedir()`. It must run on Linux, Mac, and Windows.
6. Never block a coding agent: hooks fail open and give up within 5 seconds.
7. No secrets in code. Keys come from environment variables only.
8. Commit small and often in your worktree, with clear messages.
9. Record important decisions with Alike as you go (the Alike prize is judged on how we use it while building).

## Schedule (assumes a noon start; deadline 5 PM PT)

| Phase | Time | What happens | Gate at the end |
| --- | --- | --- | --- |
| Setup | 12:00 to 12:20 | Human writes contracts, fixtures, worktrees; installs Alike | Contracts set |
| Build | 12:20 to 2:30 | Agents A to F build on fixtures in parallel | **Checkpoint 1:** one real session flows A to B to C to D (`get_brief` works) |
| Integrate | 2:30 to 3:30 | A to D on live sessions; E and F switch to live MCP | **Checkpoint 2:** voice call answers from live MCP; evals score live server |
| Polish | 3:30 to 4:00 | Fixes, demo script, README | **Freeze** |
| Ship | 4:00 to 5:00 | `demo-reset`, record backup video, submit by 4:45 | 5 PM deadline |

**If behind at Checkpoint 1:** drop attribution (B) and voice (E). The documentation loop A to D is the product.

## Setup (human, before agents start)

1. Install the real Alike: `npx @alikeai/setup` (needs an account).
2. Create the monorepo (layout in `README.md`), pnpm workspaces, Node 20+.
3. Write `contracts/` from the section below, plus fixtures:
   - `contracts/fixtures/transcripts/`: 3 real Claude Code transcripts copied from `~/.claude/projects`
   - `contracts/fixtures/inbox/`: 3 SessionRecords + 2 CommitRecords matching them
   - `contracts/fixtures/processed/`: Digests for those records
   - `contracts/fixtures/vault/`: a small sample vault
   - `contracts/fixtures/events.sqlite`: seeded event store
4. One git worktree per agent: `git worktree add ../wt-<package> -b <package>`.
5. Start each agent in its worktree with its PRD and this line: "Read `OVERALL_PLAN.md` and `contracts/` first. Only edit files under your package. Never edit `contracts/`; if a contract seems wrong, stop and tell me."

## Contracts

### Data flow

Files on disk are the interface between packages.

```text
~/.sitdown/inbox/sessions/   A writes SessionRecord JSON   -> B reads
~/.sitdown/inbox/commits/    A writes CommitRecord JSON    -> B reads
~/.sitdown/processed/        B writes Digest JSON          -> C reads
<vault_path>/              C writes Markdown notes       -> D reads
<event store>              C writes events               -> D reads
MCP server (stdio + HTTP)  D serves tools                -> coding agents, E, F
```

Our home directory is `~/.sitdown/`, never `~/.alike/`, so we run beside the real Alike without collisions.

### SessionRecord (A writes)

```json
{
  "id": "claude:abc123",
  "agent": "claude_code",
  "author": "sam",
  "repo": "acme/app",
  "branch": "feat/payments",
  "cwd": "/home/sam/app",
  "started_at": "2026-10-11T18:02:00Z",
  "ended_at": "2026-10-11T18:40:00Z",
  "prompts": ["add refund endpoint"],
  "edits": [{ "file": "src/refund.ts", "added_lines": [[10, 42]] }],
  "transcript_path": "~/.sitdown/archive/claude/abc123.jsonl"
}
```

### CommitRecord (A writes)

```json
{
  "sha": "9f2e1d",
  "author": "sam",
  "repo": "acme/app",
  "branch": "feat/payments",
  "message": "fix refund rounding",
  "at": "2026-10-11T18:45:00Z",
  "files": [{ "file": "src/refund.ts", "added_lines": [[10, 48]], "removed_lines": [] }],
  "co_authors": ["Claude"]
}
```

### Digest (B writes)

```json
{
  "source": "claude:abc123",
  "author": "sam",
  "feature": "payments",
  "date": "2026-10-11",
  "headline": "Added refund endpoint",
  "summary": "...",
  "decisions": [
    {
      "slug": "refund-idempotency",
      "title": "Use idempotency keys for refunds",
      "chosen": "...",
      "rejected": ["..."],
      "reason": "..."
    }
  ],
  "attribution": [
    { "file": "src/refund.ts", "lines": [10, 42], "label": "agent" },
    { "file": "src/refund.ts", "lines": [43, 48], "label": "human" }
  ],
  "human_interventions": 2
}
```

Attribution labels: `human`, `autocomplete`, `agent`, `agent_edited`, `human_refactored_by_agent`, `pasted`. Recorded at the source, never guessed from code style.

### Vault (C writes)

```text
<vault_path>/
  daily/2026-10-11.md
  features/payments.md
  decisions/2026-10-11-refund-idempotency.md
  people/sam.md
```

Note format. The tool writes only between the markers; everything outside them is the human's and is never changed.

```markdown
---
type: decision            # daily | feature | decision | person
feature: "[[payments]]"
author: sam
sources: [session:claude:abc123, commit:9f2e1d]
updated: 2026-10-11
---
# Use idempotency keys for refunds

<!-- auto:start -->
Chose idempotency keys so retried refunds can't double-charge.
Rejected: client-side dedupe (agent's first attempt).
<!-- auto:end -->

Hand-written notes below are never touched.
```

### Events (C writes)

Entity = UUIDv5 of the author. Send `FeatureTouched` before the event it applies to. Categories and numbers only; never raw text.

| Event | Value type | Example |
| --- | --- | --- |
| `FeatureTouched` | string | `FeatureTouched("payments")` |
| `AgentSession` | string | `AgentSession("claude_code")` |
| `CommitMade` | uint (lines changed) | `CommitMade(42)` |
| `AuthorType` | string | `AuthorType("agent_edited")` |
| `DecisionRecorded` | string (slug) | `DecisionRecorded("refund-idempotency")` |
| `HumanIntervened` | none | `HumanIntervened` |
| `QuestionAsked` | string (topic) | `QuestionAsked("auth")` |
| `AnswerFound` | bool | `AnswerFound(false)` |
| `AnswerLatencyMs` | uint | `AnswerLatencyMs(1800)` |
| `StandupMinutes` | uint | `StandupMinutes(12)` |

### MCP tools (D serves)

| Tool | Input | Returns |
| --- | --- | --- |
| `get_brief` | `{ branch?: string, feature?: string }` | Recent decisions, open threads, who else is working on it |
| `search_docs` | `{ query: string }` | Matching notes with paths and sources |
| `get_decision` | `{ slug?: string, topic?: string }` | Decision record: chosen, rejected, reason |
| `who_knows` | `{ feature: string }` | People ranked by recent activity |
| `get_summary` | `{ author?: string, from?: date, to?: date }` | Precomputed daily or demo-day summary |
| `log_unanswered` | `{ topic: string, asked_by?: string }` | Records a doc gap; returns the developer to ping |
| `record_decision` | `{ title, chosen, rejected?, reason, feature }` | Path of the new decision note |

Every answer cites its note path and source session or commit.

### Config

`~/.sitdown/config.json`:

```json
{
  "vault_path": "~/vault",
  "event_store": "keewano",
  "llm": "cloud",
  "people": { "sam": ["sam@example.com"] }
}
```

`event_store`: `keewano` or `sqlite`. `llm`: `cloud` or `ollama`. Keys from environment variables: `LLM_API_KEY`, `KEEWANO_API_KEY`, `KEEWANO_PAT`, `DIAL_API_KEY`.

## Ownership

| Agent | Package | PRD |
| --- | --- | --- |
| A | `packages/capture/` | `prds/PRD-A-capture.md` |
| B | `packages/summarizer/` | `prds/PRD-B-summarizer.md` |
| C | `packages/vault/` | `prds/PRD-C-vault-events.md` |
| D | `packages/mcp/` | `prds/PRD-D-mcp-server.md` |
| E | `packages/voice/` | `prds/PRD-E-voice.md` |
| F | `packages/evals/`, `demo/`, `scripts/`, root `README.md` | `prds/PRD-F-evals-demo.md` |

## Windows

Demo on Linux or Mac if at all possible. If Windows is required:

- Capture supports Claude Code only on Windows.
- Use `sql.js` (pure JavaScript), not native SQLite bindings.
- Test `demo-reset` and the full demo on the Windows machine before the 4:00 PM freeze.
- The backup video recorded on Linux is the safety net.

## Submission checklist

- [ ] GitHub repo public, README current, "What is mocked" filled in
- [ ] Project details, team, technologies on HackerSquad
- [ ] Demo video, 5 minutes or less
- [ ] Keewano project name on the submission
- [ ] Submitted by 4:45 PM
