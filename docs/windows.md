# SitDOWN on Windows

SitDOWN runs on Windows — all file paths use `path.join`, the event store is pure-JS `sql.js` (no native build), and `claude -p` is launched in a Windows-safe way. This guide gets you to a clean recording and shows how to debug each stage.

## TL;DR

```powershell
corepack enable pnpm
pnpm install
pnpm build
pnpm demo            # build → seed → serve http://localhost:8788
pnpm demo:showcase   # narrated end-to-end tour + live capture test
```

Record in **Windows Terminal** (modern colors). You need **Claude Code installed and signed in** (`claude --version`).

## Setup, step by step

1. **Node 20+** — `node --version`. Install from nodejs.org if missing.
2. **pnpm** — `corepack enable pnpm`. If `corepack` isn't found, update Node or `npm i -g pnpm`.
3. **Git** — `git --version`. Install Git for Windows.
4. **Claude Code** — `claude --version`. The AI answers and the default summarizer use `claude -p`.
5. **Install + build** — `pnpm install` then `pnpm build`.
6. **Run** — `pnpm demo`, open http://localhost:8788.

## Windows-specific notes

- **Terminal:** use **Windows Terminal** or VS Code's terminal. Old `conhost`/legacy console may show raw escape codes — SitDOWN auto-disables colors when output isn't a real terminal and honors `NO_COLOR=1`.
- **`claude -p` launching:** on Windows, `claude` is usually `claude.cmd`. SitDOWN spawns it through the shell on Windows and passes the system prompt on **stdin** (not as a quoted CLI arg), so it launches correctly. If your install is elsewhere, set `CLAUDE_BIN` (see below).
- **PowerShell `&&`:** `pnpm demo` chains steps with `&&`, which npm/pnpm run through `cmd.exe` (works). If you run the raw commands yourself in **PowerShell 5.1**, run them on separate lines (5.1 has no `&&`); PowerShell 7+ supports `&&`.
- **Paths:** the demo home is `demo\.sitdown-demo` (git-ignored). A real config goes at `%USERPROFILE%\.sitdown\config.json`. Use `~` in config values — SitDOWN expands it.
- **Line endings:** generated notes are plain UTF-8; Git may warn about CRLF. Harmless for the demo.

## Environment knobs (for debugging)

| Variable | Effect |
| --- | --- |
| `CLAUDE_BIN` | Path/name of the Claude CLI (default `claude`). Set if `claude -p` can't be found. |
| `CLAUDE_TIMEOUT_MS` | Max time for a `claude -p` call (default 60000 server / 120000 summarizer). |
| `NO_COLOR=1` | Disable ANSI colors in the demo scripts. |
| `PORT` | Dashboard server port (default 8788). |
| `PAUSE_MS` | Pause between showcase steps (default 700). |
| `SITDOWN_HOME` | Override the demo/runtime home (default `demo\.sitdown-demo` for the demo). |

PowerShell example:

```powershell
$env:CLAUDE_BIN="claude"; $env:CLAUDE_TIMEOUT_MS="120000"; pnpm demo:serve
```

## Debugging checklist (run these in order)

Each check isolates one stage. Run from the repo root.

**1. Toolchain**
```powershell
node --version        # v20+
pnpm --version
git --version
claude --version      # must resolve; if not, fix PATH or set CLAUDE_BIN
```

**2. Build is present**
```powershell
pnpm build
dir packages\mcp\dist\http.js        # should exist
dir packages\summarizer\dist\llm.js  # should exist
```

**3. Data was seeded (C ran)**
```powershell
pnpm demo:seed
dir demo\.sitdown-demo\vaults\central\decisions   # many .md files
```
If empty: C didn't write — check the `pnpm demo:seed` output for a `[vault] wrote N note(s)` line.

**4. Server is up (D)**
```powershell
pnpm demo:serve
# in another terminal:
curl http://localhost:8788/api/health
```
Expect `{"ok":true,"fixtures":false,"events":"sqlite", ...}`. `fixtures:true` means it fell back to sample data — your seed didn't land where the server looks (re-run `pnpm demo:seed`).

**5. A tool answers (D)**
```powershell
curl -X POST http://localhost:8788/api/tool -H "content-type: application/json" -d "{\"tool\":\"who_knows\",\"args\":{\"feature\":\"billing\"}}"
```
Expect a ranked list of **names** (not UUIDs).

**6. The AI answers (B via `claude -p`)**
```powershell
curl -X POST http://localhost:8788/api/answer -H "content-type: application/json" -d "{\"q\":\"why do refunds use idempotency keys?\"}"
```
Expect a grounded answer + `citations`. If it errors with "could not run claude", fix step 1 / `CLAUDE_BIN`. Slow (8–12s) is normal — it's a real `claude -p` call.

**7. Full pipeline, live (A→B→C→D)**
```powershell
pnpm demo:test
```
Expect `✔ END-TO-END LIVE TEST PASSED`.

## Common Windows failures

| Symptom | Fix |
| --- | --- |
| `claude: command not found` / spawn ENOENT | Install/sign in to Claude Code; or set `CLAUDE_BIN` to the full path. |
| Raw escape codes in the terminal | Use Windows Terminal, or set `NO_COLOR=1`. |
| `EADDRINUSE` on 8788 | Another server is running — close it or set `$env:PORT="8799"`. |
| `pnpm` not found | `corepack enable pnpm`, or update Node. |
| AI answers time out | Raise `CLAUDE_TIMEOUT_MS`; confirm `claude -p "hi"` works standalone. |
| `fixtures:true` in /api/health | Re-run `pnpm demo:seed` (the server reads `demo\.sitdown-demo`). |

More symptom→fix in [troubleshooting.md](troubleshooting.md).
