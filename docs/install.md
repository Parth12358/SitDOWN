# Install & run

## Prerequisites

- **Node.js 20+** — `node --version`
- **pnpm** — `corepack enable pnpm` then `pnpm --version` (corepack ships with Node)
- **Git** — `git --version`
- **Claude Code**, installed and signed in — `claude --version`. The default summarizer and the dashboard AI shell out to `claude -p`, using your session (no API key).

No native toolchain is needed — the SQLite event store uses `sql.js` (pure JavaScript).

## Install

```bash
corepack enable pnpm
pnpm install          # installs all workspace packages
pnpm build            # compiles the TypeScript packages to dist/
```

`pnpm build` is required before running the MCP server, the demo, or the eval suite (they import the compiled `dist/`).

## Run the demo (fastest path)

```bash
pnpm demo             # build → seed the demo org → serve at http://localhost:8788
```

Open **http://localhost:8788**. Ask in plain language; every answer cites notes you can click to read.

| Command | Does |
| --- | --- |
| `pnpm demo` | build + seed + serve (one shot) |
| `pnpm demo:seed` | regenerate the demo vault + events (the known org state) |
| `pnpm demo:serve` | serve the dashboard (after a seed) |
| `pnpm demo:showcase` | narrated end-to-end tour + the live capture test |
| `pnpm demo:test` | the live A→B→C→D test only |

The demo lives in an isolated home at `demo/.sitdown-demo` (git-ignored) and never touches a real vault.

## Verify the build

```bash
pnpm -r build && pnpm -r test     # all packages build + their tests pass
```

Expected: capture, summarizer, vault, mcp, voice tests pass; evals has no unit tests (it's exercised by `pnpm demo:test`).

## Configure a real project (optional)

```bash
cp config.example.json ~/.sitdown/config.json
```

```jsonc
{
  "vaults_root": "~/sitdown/vaults",            // central/ + one <person>/ vault each
  "central_vault": "~/sitdown/vaults/central",  // optional; defaults under vaults_root
  "event_store": "sqlite",                        // or "keewano"
  "llm": "claude_cli",                            // or "cloud" (LLM_API_KEY) / "ollama"
  "people": { "sam": ["sam@example.com"] }        // slug → contact handles
}
```

Then wire capture + the query server:

```bash
pnpm --filter @sitdown/capture run install-hooks       # agent session hooks (additive, local)
pnpm --filter @sitdown/capture run install-git-hook     # commit hook (per repo)
pnpm --filter @sitdown/mcp run start                    # MCP server over stdio
claude mcp add sitdown -- node packages/mcp/dist/stdio.js
```

Secrets come from the environment only — see `.env.example`.

On Windows, read [windows.md](windows.md) first. If anything misbehaves, [troubleshooting.md](troubleshooting.md).
