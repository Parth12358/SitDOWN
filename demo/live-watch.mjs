#!/usr/bin/env node
// Live pipeline for the demo: watch demo/.sitdown-demo/inbox/sessions (filled by the real Claude
// Code hook), and for each new or updated SessionRecord run B (summarize via `claude -p`) → write
// processed/ → C (vault + events). The running dashboard picks the new notes up immediately.
//
// The Stop hook fires after every turn, so a session's record is rewritten as it grows; we
// re-summarize it once it has been quiet for a moment (DEBOUNCE_MS).
//
//   pnpm demo:watch               (only records written after start)
//   pnpm demo:watch -- --all      (also anything already in the inbox)
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const HOME = process.env.SITDOWN_HOME ? path.resolve(process.env.SITDOWN_HOME) : path.join(here, ".sitdown-demo");
const INBOX = path.join(HOME, "inbox", "sessions");
const PROCESSED = path.join(HOME, "processed");
const VAULTS = path.join(HOME, "vaults"), CENTRAL = path.join(VAULTS, "central");
const EVENTS = path.join(HOME, "events.sqlite");
const POLL_MS = Number(process.env.SITDOWN_POLL_MS) || 1500;
const DEBOUNCE_MS = Number(process.env.DEBOUNCE_MS) || 2500;

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const col = (code, s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);
const stamp = () => col(90, new Date().toLocaleTimeString());
const log = (tag, msg) => console.log(`${stamp()} ${col(33, tag.padEnd(10))} ${msg}`);

const { summarize } = await import(pathToFileURL(path.join(repo, "packages/summarizer/dist/index.js")).href);
const { makeLlm } = await import(pathToFileURL(path.join(repo, "packages/summarizer/dist/llm.js")).href);
const llm = makeLlm("claude_cli");

const startedAt = process.argv.includes("--all") ? 0 : Date.now();
const done = new Map(); // file -> mtimeMs we last processed
let busy = false;

function pending() {
  let names;
  try { names = readdirSync(INBOX).filter((n) => n.endsWith(".json")); } catch { return []; }
  const now = Date.now();
  return names
    .map((n) => { const f = path.join(INBOX, n); return { f, m: statSync(f).mtimeMs }; })
    .filter(({ f, m }) => m > startedAt && m !== done.get(f) && now - m >= DEBOUNCE_MS);
}

async function processOne({ f, m }) {
  const record = JSON.parse(readFileSync(f, "utf8"));
  log("A capture", `${record.id} · ${record.author} · ${record.branch || "-"} · ${record.prompts?.length ?? 0} prompt(s), ${record.edits?.length ?? 0} edit(s)`);

  log("B summary", "claude -p …");
  const t0 = Date.now();
  const digest = await summarize(record, { llm });
  log("B summary", `${((Date.now() - t0) / 1000).toFixed(1)}s → ${col(1, digest.headline)} ${col(90, `[${digest.feature}]`)}`);
  for (const d of digest.decisions || []) log("", col(36, `decision: ${d.slug}`));

  mkdirSync(PROCESSED, { recursive: true });
  writeFileSync(path.join(PROCESSED, digest.source.replace(/[^a-z0-9]+/gi, "-") + ".json"), JSON.stringify(digest, null, 2));

  const c = spawnSync(process.execPath, [path.join(repo, "packages/vault/dist/bin/process.js")], {
    env: { ...process.env, SITDOWN_HOME: HOME, SITDOWN_PROCESSED: PROCESSED, SITDOWN_VAULTS_ROOT: VAULTS, SITDOWN_CENTRAL_VAULT: CENTRAL, SITDOWN_EVENTS_DB: EVENTS, SITDOWN_EVENT_STORE: "sqlite" },
    encoding: "utf8",
  });
  const line = (c.stdout || "").split("\n").find((l) => l.includes("note(s)")) || (c.stderr || "").trim();
  log("C vault", `${c.status === 0 ? col(32, "ok") : col(31, "failed")} ${line.replace("[vault] ", "")}`);
  log("D ready", col(32, `ask the dashboard: "what did ${record.author} just do?"`));
  done.set(f, m);
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    for (const item of pending()) {
      try { await processOne(item); } catch (e) { log("error", col(31, e.message)); done.set(item.f, item.m); }
    }
  } finally { busy = false; }
}

console.log(`${col(1, "SitDOWN live watcher")} — ${INBOX}`);
console.log(col(90, "waiting for Claude Code sessions in the playground (Ctrl-C to stop)…\n"));
setInterval(tick, POLL_MS);
tick();
