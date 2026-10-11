# PRD: &lt;app&gt; (Automated Agent Documentation)

`<app>` automatically turns every agent session and commit into living, linked documentation that people and agents can query. A voice assistant in meetings is a secondary way to read it.

## Problem

Agent-heavy teams produce code faster than anyone can document it, and the reasoning behind the work disappears.

- **Agents forget.** Each new session starts blind to earlier decisions and dead ends, so agents redo or undo past work.
- **The why is lost.** Git records the final diff, not the approaches tried, rejected, or the reasons behind a choice.
- **Mixed tooling.** A team runs several agents (Claude Code, Cursor, Codex) plus hand-written code; no single tool sees all of it.
- **Docs go stale.** Nobody has time to write them, so wikis and Obsidian vaults drift from reality.
- **Meetings pay the cost.** Standups become status recitals; demo-day prep means reconstructing weeks of work from memory.
- **Credit gets blurred.** When an agent writes the code, the engineer's judgment becomes invisible.

**Why now:** coding agents write a large share of code at many teams, and every session leaves a transcript. That transcript is the raw material for documentation nobody has to write.

## Goals

- Turn every agent session and commit into documentation with zero manual writing.
- Capture decisions and reasoning, not just what changed.
- Make the docs queryable by people and by the next agent session.
- Keep docs in plain Markdown the developer owns (Obsidian-compatible).
- Attribute work honestly: human, AI, or both.
- Run fully locally when required: no login, nothing leaves the machine.

## Non-goals

- Productivity monitoring: no time tracking, keystroke logging, rankings, or lines-of-code metrics.
- Replacing coding agents. This documents their work; it doesn't do the work.
- Detecting AI-written code by style analysis.
- Overwriting notes people wrote by hand.

## Users and use cases

| User | Use case | Today | With `<app>` |
| --- | --- | --- | --- |
| Developer | Resume work or hand off to a new agent session | Re-explain context to the agent | Agent starts briefed from the docs |
| Developer | Keep an Obsidian vault current | Manual notes that go stale | Notes update automatically |
| Developer | Prepare for standup or demo day | Reconstruct work from memory | Auto-drafted summary of what they built and why |
| Developer | Get credit at review time | Rebuild a brag doc from scratch | Running record of contributions and decisions |
| Teammate | "Has anyone tried this before?" | Ask around | Query the docs: past attempts and reasons |
| Manager | "Where are we on payments?" | Ping people or wait for standup | Ask the docs or the voice assistant |
| New hire | Learn why the code looks this way | Read code, ask seniors | Read linked decision records per feature |

## Requirements

| ID | Requirement | Priority | Agent |
| --- | --- | --- | --- |
| R1 | Capture every agent session (tasks, decisions, dead ends) | P0 | A |
| R2 | Capture hand-written work from commits | P0 | A |
| R3 | Generate linked Markdown notes: daily, feature, decision, person | P0 | B, C |
| R4 | Never overwrite hand-written notes | P0 | C |
| R5 | Query layer for agents and people (MCP) | P0 | D |
| R6 | Attribute work: human, agent, agent-edited | P1 | B |
| R7 | Developer reviews and controls what is shared; private by default | P1 | C, D |
| R8 | Activity events drive behavior (routing, selective regeneration) | P1 | C, D |
| R9 | Detect doc gaps from unanswered questions; ping the right developer | P1 | D |
| R10 | Fully local mode (Ollama, SQLite) | P1 | B, C |
| R11 | Evals on answer quality (Sparta) | P1 | F |
| R12 | Voice assistant answers in standups and demo days | P2 | E |
| R13 | Per-person follow-up texts after meetings | P2 | E |
| R14 | Demo-day summaries and running brag doc | P2 | D |
| R15 | AI-aware blame view | P2 | later |
| R16 | Voice-print speaker ID (opt-in) | P2 | later |

## Success metrics

| Metric | What it shows |
| --- | --- |
| Notes written manually per week | Docs truly write themselves |
| Agent sessions started with docs context | Agents stop starting blind |
| Questions answered from docs vs unanswered | Docs are complete enough to trust |
| Answer accuracy (Sparta evals) | Docs are correct, not just present |
| Doc gaps flagged vs filled | Self-improving loop works |
| Standup minutes, before vs after | Meeting time saved |
| Installs still active after 2 weeks | It feels like help, not surveillance |

## Scope

| Area | Hackathon build | Work version (local only, Mac) |
| --- | --- | --- |
| Agent capture | Fork of `@alikeai/setup`, local-only | Same |
| Human capture | Git `post-commit` hook | Same |
| Summaries | Cloud LLM | Ollama |
| Docs | Markdown vault | Existing Obsidian vault, git-versioned |
| Events | Keewano | SQLite |
| Query | MCP server | Same, localhost |
| Voice + SMS | Dial | Out of scope |
| Evals | Sparta | Local test set |

## Partner tools

- **Alike:** used by the team while building (judged on how we use it for coding). Its MIT-licensed installer is forked for capture, with Alike's permission.
- **Keewano:** event store; queries change what the product does (routing, gap detection, selective regeneration).
- **Dial:** voice and SMS for the meeting assistant.
- **Sparta:** evals on answer quality.

## Risks

- **Feels like surveillance.** Developer owns and reviews their record; no hours or activity metrics.
- **Inaccurate docs.** Every note links to its source; evals catch regressions.
- **Secrets in transcripts.** Filter before summarizing; local mode available.
- **Company policy.** Recording work or using AI tools may need IT approval.
- **Platform overlap.** Agent vendors may add similar features. Our edge: neutral across all agents plus hand-written code, in files the developer owns.

## Open questions

- [ ] Product name
- [ ] Dial: keypad tones for meeting PINs, mid-call tool calls, max call length
- [ ] Keewano: self-hosted option
- [ ] Sparta: rubric
