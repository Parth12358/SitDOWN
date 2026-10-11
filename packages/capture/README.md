# @sitdown/capture (Agent A)

Local-only fork of [`@alikeai/setup`](https://www.npmjs.com/package/@alikeai/setup) (MIT). Captures every finished coding-agent session and every git commit into the inbox — nothing leaves the machine.

**PRD:** [`../../prds/PRD-A-capture.md`](../../prds/PRD-A-capture.md) · **Owns:** this package only.

## Outputs (contract)
- `~/.sitdown/inbox/sessions/<id>.json` — SessionRecord
- `~/.sitdown/inbox/commits/<sha>.json` — CommitRecord

Schemas: `contracts/schemas/`. Validate your output against them.

## Getting the fork
```bash
npm pack @alikeai/setup@0.2.1
npm pack @alikeai/harness-snippets@0.2.0
```
Keep their `LICENSE` and copyright. See PRD-A for the keep/remove table (strip pairing, uploads, telemetry, `/pair/*`, `/mcp`, `/harness-telemetry`; keep archive sweep, parsers, hook entry).

## Commands
```bash
pnpm --filter @sitdown/capture run install-hooks       # wire agent end-of-session hooks (additive, local)
pnpm --filter @sitdown/capture run install-git-hook    # post-commit hook in the current repo
sitdown --dry-run | --doctor | --uninstall
pnpm --filter @sitdown/capture test                    # includes the no-network guard
```

## Hard rules
- Hooks fail open and exit within 5 seconds, always.
- No network calls (enforced by `test/no-network.test.mjs`).
- Home dir is `~/.sitdown/`, hook command is `sitdown`, ignore file `.sitdownignore` — so the real Alike keeps working alongside it.
- Agent priority: Claude Code, then Codex, then Cursor.
