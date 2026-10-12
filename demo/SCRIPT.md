# Demo runbook (≤ 5 minutes)

The whole demo runs locally through the **real** product (capture → summarizer → vault+events → MCP), surfaced by the **Ask the record** dashboard. Summaries use your signed-in Claude Code session via `claude -p` — no API key.

## Prereqs
- Node 20+, pnpm (via corepack), and **Claude Code installed + signed in** (for live AI answers).
- First run only: `pnpm install`.

## One command to bring it up
```bash
pnpm demo
```
This builds the packages, seeds an org's worth of data (≈23 people, 16 features, ~180 sessions, ~570 events) through the real pipeline, and starts the dashboard at **http://localhost:8788**.

(Separately: `pnpm demo:seed` reseeds · `pnpm demo:serve` just serves · `pnpm demo:test` runs the end-to-end live test.)

## Run of show

1. **The problem (20s).** Agents write most of the code; the *why* vanishes and new sessions start blind. SitDOWN turns every session + commit into docs nobody writes.

2. **Open the dashboard (30s).** http://localhost:8788 — a cream "Ask the record" console. One answer is already on screen. Point out: it's reading a real vault, `live — real vault` in the footer.

3. **Ask, with sources (60s).** Type **"why do refunds use idempotency keys?"**
   - It retrieves the relevant notes and `claude -p` synthesizes a short, grounded answer.
   - Click a cited **`decisions/…md`** chip under the answer → the note opens in the reader (chosen / rejected / reason, right there).

4. **Drill into a person (45s).** Ask **"what did otto do?"** then a follow-up **"anything unfinished?"**
   - It builds a per-person dossier (every daily entry, decisions, features) and the follow-up keeps otto as the subject (conversation memory). Mention `@name` works inline too.

5. **Standup (45s).** Click **Standup** (nav) or the **↻ Since last standup** chip.
   - It figures out the last 7 days and summarizes what each person shipped + the decisions made — the thing standups waste time reconstructing.

6. **Who to ask (20s).** Ask **"who knows billing?"** → ranked from the event store (real `who_knows`), with an **Ask [person]** button.

7. **It's live: a real Claude Code session (60–90s).** Set up beforehand (see *Live Claude Code session* below): three terminals open, with the dashboard, the watcher, and `claude` in the playground.
   - In the `claude` terminal, ask for a small change that has a decision in it, e.g. *"search in src/search.js is a linear scan and case-sensitive. Make it case-insensitive and add a simple prefix index. Don't use a full-text library, too heavy for this app."*
   - When Claude finishes its turn, the `Stop` hook captures the session. The watcher terminal then prints **A capture → B summary (claude -p, ~9s) → decisions → C vault ok → D ready**.
   - In the dashboard, ask **"what did parth just do on search, and why no full-text library?"** The answer cites the brand-new `decisions/…-no-full-text-library.md`. Click it.
   - Fallback if Claude Code misbehaves on stage: `pnpm demo:test` pushes a scripted session through the same pipeline and prints `✔ END-TO-END LIVE TEST PASSED`.

8. **What's mocked / next (20s).** See the root README "What is mocked": Keewano reads, Dial voice, and Ollama are stubbed; everything shown above is live.

## Live Claude Code session

`pnpm demo:live-setup` creates `demo/.sitdown-demo/playground`. This is a tiny git repo (author `parth`, branch `feat/search`) with a **project-level** `.claude/settings.json` `Stop` hook that runs `demo/capture-hook.mjs`. Only sessions started in that folder are captured, and they go to the demo home, never `~/.sitdown`. Your global Claude settings are untouched.

```bash
pnpm demo:seed && pnpm demo:live-setup   # reset data + (re)create the playground
pnpm demo:serve                          # terminal 1: dashboard
pnpm demo:watch                          # terminal 2: inbox → claude -p → vault, narrated
cd demo/.sitdown-demo/playground && claude   # terminal 3: the agent (trust the folder when asked)
```

The hook fires after every Claude turn. The watcher waits until the record has been quiet for ~2.5s, then re-summarizes, so a multi-turn session keeps updating its notes. Override the persona with `DEMO_AUTHOR=jin DEMO_BRANCH=feat/api pnpm demo:live-setup` (delete the playground folder first). To reset the playground's code between runs: `git -C demo/.sitdown-demo/playground checkout -- .`

## Recording on Windows
Works on Windows — record in **Windows Terminal** (renders colors; old `conhost` won't). Setup:
```powershell
corepack enable pnpm
pnpm install
pnpm demo            # build → seed → serve at http://localhost:8788
```
`claude -p` is spawned Windows-safely (through the shell, system prompt on stdin). You need Claude Code installed and signed in. Colors auto-disable when output isn't a terminal (`NO_COLOR` also respected).

## One-command showcase
```bash
pnpm demo:showcase   # narrates every capability against the live server, then the live A→B→C→D test
```

## Reset between runs
```bash
pnpm demo:seed      # rebuild the demo vault + events to the known state
```
`scripts/demo-reset.mjs` resets an isolated `~/.sitdown` demo vault for the capture-hook flow; the dashboard demo uses `demo/.sitdown-demo` (gitignored).

## Backup
Record a screen capture of steps 2–7 before demo day in case Wi-Fi or `claude -p` is slow on stage.

## If something's off
- Blank answers / "needs the live app": the server isn't running — `pnpm demo:serve`.
- AI answers slow (~8–12s): expected — each is a real `claude -p` call; the thinking dots show it's working.
- `claude: command not found`: install/sign in to Claude Code, or demo the browse views + canned artifact instead.
