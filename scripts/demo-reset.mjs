#!/usr/bin/env node
// demo-reset — PRD-F. Node only; Linux/Mac/Windows (path.join + os.homedir()).
//
// Resets an isolated demo home under ~/.sitdown to a known state, then replays today's sessions
// (the contract fixture Digests) through C (@sitdown/vault) to regenerate the split vaults:
//   <vaults_root>/central/   shared: features, decisions, team daily, people index
//   <vaults_root>/<person>/  per person: their daily log + private me.md
// Deterministic and offline — no LLM, no network. Safe by construction: it only touches vaults
// under ~/.sitdown unless you pass --vaults-root <path> --force.
//
// Usage:
//   node scripts/demo-reset.mjs
//   node scripts/demo-reset.mjs --vaults-root /path/to/vaults --force
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const FIXTURE_PROCESSED = path.join(repoRoot, "contracts", "fixtures", "processed");
const VAULT_BIN = path.join(repoRoot, "packages", "vault", "dist", "bin", "process.js");

function parseArgs(argv) {
  const o = { force: false, vaultsRoot: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--force") o.force = true;
    else if (argv[i] === "--vaults-root") o.vaultsRoot = argv[++i];
  }
  return o;
}

function isUnder(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const HOME = process.env.SITDOWN_HOME ?? path.join(os.homedir(), ".sitdown");
  const vaultsRoot = opts.vaultsRoot ? path.resolve(opts.vaultsRoot) : path.join(HOME, "vaults");
  const central = path.join(vaultsRoot, "central");
  const eventsDb = path.join(HOME, "events.sqlite");
  const processed = path.join(HOME, "processed");

  console.log(`[demo-reset] home=${HOME}`);
  console.log(`[demo-reset] vaults_root=${vaultsRoot}`);

  if (!existsSync(VAULT_BIN)) {
    console.error(`[demo-reset] ${VAULT_BIN} not found — run \`pnpm --filter @sitdown/vault build\` first.`);
    process.exit(1);
  }

  // Safety: refuse to wipe a non-empty vaults root outside ~/.sitdown without --force.
  const outsideHome = !isUnder(vaultsRoot, HOME);
  const nonEmpty = existsSync(vaultsRoot) && readdirSync(vaultsRoot).length > 0;
  if (outsideHome && nonEmpty && !opts.force) {
    console.error(`[demo-reset] refusing to reset a non-empty vaults root outside ${HOME}.`);
    console.error("[demo-reset] re-run with --force if you really mean to wipe it.");
    process.exit(1);
  }

  // 1. Reset to a clean slate.
  for (const p of [vaultsRoot, processed]) rmSync(p, { recursive: true, force: true });
  rmSync(eventsDb, { force: true });
  mkdirSync(vaultsRoot, { recursive: true });
  mkdirSync(processed, { recursive: true });
  console.log("[demo-reset] cleared vaults, processed/, events.sqlite");

  // 2. Seed today's sessions: the known fixture Digests (already summarized by B).
  let seeded = 0;
  for (const f of readdirSync(FIXTURE_PROCESSED).filter((n) => n.endsWith(".json"))) {
    cpSync(path.join(FIXTURE_PROCESSED, f), path.join(processed, f));
    seeded++;
  }
  console.log(`[demo-reset] seeded ${seeded} digest(s) into ${processed}`);

  // 3. Replay through C -> central + per-person vaults + events.
  const r = spawnSync(process.execPath, [VAULT_BIN, "--all"], {
    env: {
      ...process.env,
      SITDOWN_HOME: HOME,
      SITDOWN_PROCESSED: processed,
      SITDOWN_VAULTS_ROOT: vaultsRoot,
      SITDOWN_CENTRAL_VAULT: central,
      SITDOWN_EVENTS_DB: eventsDb,
      SITDOWN_EVENT_STORE: "sqlite",
    },
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error(`[demo-reset] vault processor exited ${r.status}`);
    process.exit(r.status ?? 1);
  }

  const notes = existsSync(vaultsRoot)
    ? readdirSync(vaultsRoot, { recursive: true }).filter((n) => String(n).endsWith(".md")).length
    : 0;
  console.log(`\n[demo-reset] done — ${notes} note(s) across central + per-person vaults.`);
  console.log("[demo-reset] next:");
  console.log(`  SITDOWN_CENTRAL_VAULT=${central} SITDOWN_VAULTS_ROOT=${vaultsRoot} SITDOWN_EVENTS_DB=${eventsDb} pnpm --filter @sitdown/mcp start:http`);
  console.log("  pnpm --filter @sitdown/evals run eval");
}

main();
