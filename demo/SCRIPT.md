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

7. **It's live, not canned (40s).** In another terminal: `pnpm demo:test`.
   - It pushes a brand-new coding session (API-key rotation) through capture → real `claude -p` summary → vault/events, then asks the dashboard about it — and the new work shows up, attributed, cited. Prints `✔ END-TO-END LIVE TEST PASSED`.

8. **What's mocked / next (20s).** See the root README "What is mocked": Keewano reads, Dial voice, and Ollama are stubbed; everything shown above is live.

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
