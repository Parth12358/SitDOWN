# Troubleshooting

Symptom → likely cause → fix. OS-agnostic (Windows specifics in [windows.md](windows.md)).

## Install / build

**`pnpm: command not found`** — run `corepack enable pnpm` (ships with Node 20+), or `npm i -g pnpm`.

**`pnpm build` errors with `Cannot find module '@sitdown/contracts'`** — run `pnpm install` first (it links the workspace packages), then `pnpm build`.

**MCP server / demo exits: "Could not load the MCP build"** — `dist/` is missing. Run `pnpm build` (or `pnpm --filter @sitdown/mcp build`).

## The dashboard / server

**`pnpm demo:serve` then the page is blank or "needs the live app"** — the server isn't reachable. Confirm `curl http://localhost:8788/api/health` returns JSON. If the port is taken, set `PORT` (e.g. `PORT=8799 pnpm demo:serve`).

**`/api/health` shows `"fixtures": true`** — the server fell back to the sample fixtures because it didn't find a seeded vault at the demo home. Run `pnpm demo:seed`, then restart the server.

**`EADDRINUSE: 8788`** — a server is already running. Stop the other one, or run on another port with `PORT`.

## Answers

**"could not run `claude -p` (is Claude Code installed?)"** — the summarizer/AI couldn't launch the Claude CLI. Check `claude --version`; sign in; or set `CLAUDE_BIN` to the full path. Verify standalone: `echo "say hi as JSON {\"ok\":true}" | claude -p --output-format json`.

**AI answers are slow (8–12s)** — expected. Each `/api/answer` and `/api/standup` is a real `claude -p` call; the "synthesizing…" dots mean it's working. Raise `CLAUDE_TIMEOUT_MS` if it times out on a slow machine.

**AI says "I don't know" for something that exists** — retrieval didn't surface it. Check the note is in the vault (`ls <central>/features` etc.), and that your phrasing includes a feature or person name. For a person, name them (or use `@name`) so the person-dossier path kicks in.

**`who_knows` returns UUIDs instead of names** — the person isn't resolvable. SitDOWN resolves names from `config.people` **and** the vault's `people/*.md`; make sure the person has a note in the central vault (C writes one for anyone with a digest). Re-seed if needed.

**Follow-up questions "forget" the subject** — the dashboard sends the last few turns as history; a bare page reload clears it. Re-ask naming the subject once, then follow up.

## Data / pipeline

**No events / empty `who_knows` after a reset** — the event store was wiped but C's `state/` still marked sources emitted. Fixed in the product (C reconciles when the SQLite store is missing) and the demo/reset scripts clear `state/`. If you hit it, delete the home's `state/` dir and re-run the seed.

**C committed into the wrong git repo** — fixed: C now `git init`s the vault as its own repo instead of committing into an enclosing one. If you see stray `sitdown: update docs from N sources` commits in a parent repo, that predates the fix — reset them and re-pull.

**`demo-reset` refuses to run** — it won't wipe a non-empty vault outside `~/.sitdown` without `--force`. That's the safety guard; point it at a demo path or pass `--force` deliberately.

## Reset to a known good state

```bash
pnpm demo:seed        # rebuilds the demo vault + events deterministically
pnpm demo:serve
pnpm demo:test        # confirms the whole pipeline end-to-end
```

Still stuck? The per-stage checklist in [windows.md](windows.md#debugging-checklist-run-these-in-order) works on any OS — it isolates which stage (A/B/C/D) is failing.
