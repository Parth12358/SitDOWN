#!/usr/bin/env node
// End-to-end LIVE test: push a brand-new coding session through the REAL pipeline and prove it
// becomes queryable.  A (capture parser) → B (summarize via real `claude -p`) → C (vault+events)
// → D (ask the running server).  No fixtures, no fakes.
//
//   SITDOWN_HOME=demo/.sitdown-demo node demo/live-test.mjs      (server must be running on :8788)
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const HOME = process.env.SITDOWN_HOME ? path.resolve(process.env.SITDOWN_HOME) : path.join(repo, "demo", ".sitdown-demo");
const VAULTS = path.join(HOME, "vaults"), CENTRAL = path.join(VAULTS, "central");
const EVENTS = path.join(HOME, "events.sqlite"), PROCESSED = path.join(HOME, "processed");
const ARCHIVE = path.join(HOME, "archive", "claude");
const BASE = process.env.MCP_HTTP || "http://127.0.0.1:8788";
const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const col = (code, s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);
const ok = (b) => (b ? col(32, "PASS") : col(31, "FAIL"));

const { parseTranscript } = await import(pathToFileURL(path.join(repo, "packages/capture/src/parse/index.mjs")).href);
const { buildSessionRecord } = await import(pathToFileURL(path.join(repo, "packages/capture/src/record.mjs")).href);
const { summarize } = await import(pathToFileURL(path.join(repo, "packages/summarizer/dist/index.js")).href);
const { makeLlm } = await import(pathToFileURL(path.join(repo, "packages/summarizer/dist/llm.js")).href);

// 1. A brand-new Claude Code session: Jin adds API-key rotation (a topic NOT in the seed).
const KEY = "livetest" + String(Date.now()).slice(-5);
const transcript = [
  { type: "user", timestamp: "2026-10-11T19:00:00Z", message: { role: "user", content: "rotate our API keys automatically — they live forever right now" } },
  { type: "assistant", timestamp: "2026-10-11T19:02:00Z", message: { role: "assistant", content: "I'll rotate keys on a 90-day schedule. I'm thinking a hard cutover at expiry to keep it simple." } },
  { type: "user", timestamp: "2026-10-11T19:05:00Z", message: { role: "user", content: "a hard cutover will break any client mid-request. keep the old key valid for a 24h overlap." } },
  { type: "assistant", timestamp: "2026-10-11T19:07:00Z", message: { role: "assistant", content: "Good point. I'll rotate every 90 days and keep the previous key valid for a 24-hour overlap window so in-flight clients don't break." } },
  { type: "assistant", timestamp: "2026-10-11T19:09:00Z", message: { role: "assistant", content: [{ type: "tool_use", name: "Write", input: { file_path: "src/api.ts", content: "export function rotateApiKey() { /* 90d rotation, 24h overlap */ }" } }] } },
  { type: "assistant", timestamp: "2026-10-11T19:20:00Z", message: { role: "assistant", content: "Done. Keys rotate every 90 days; the prior key stays valid for 24 hours." } },
];
mkdirSync(ARCHIVE, { recursive: true });
const tpath = path.join(ARCHIVE, `${KEY}.jsonl`);
writeFileSync(tpath, transcript.map((e) => JSON.stringify(e)).join("\n"));

// 2. A: parse the transcript into a SessionRecord (real capture logic).
const parsed = parseTranscript({ agent: "claude_code", transcriptPath: tpath, text: readFileSync(tpath, "utf8"), fallbackKey: KEY });
const record = buildSessionRecord(parsed, { author: "jin", repo: "acme/app", branch: "feat/api", cwd: repo, transcriptPath: tpath, locate: false });
console.log(`\nA · capture → SessionRecord  ${ok(!!record.id)}  id=${record.id} prompts=${record.prompts.length} edits=${record.edits.length}`);

// 3. B: summarize with the REAL claude -p backend.
console.log("B · summarizing with real `claude -p` … (a few seconds)");
const t0 = Date.now();
const digest = await summarize(record, { llm: makeLlm("claude_cli") });
const madeDecision = (digest.decisions || []).some((d) => /overlap|rotat/i.test(JSON.stringify(d)));
console.log(`B · Digest in ${((Date.now() - t0) / 1000).toFixed(1)}s  ${ok(!!digest.headline && digest.feature === "api")}  feature=${digest.feature}`);
console.log(`     headline: ${digest.headline}`);
console.log(`     decision captured (rotation/overlap): ${ok(madeDecision)}  ${(digest.decisions || []).map((d) => d.slug).join(", ") || "(none)"}`);

// 4. C: write the digest, regenerate the vault + events.
mkdirSync(PROCESSED, { recursive: true });
writeFileSync(path.join(PROCESSED, digest.source.replace(/[^a-z0-9]+/gi, "-") + ".json"), JSON.stringify(digest, null, 2));
const c = spawnSync(process.execPath, [path.join(repo, "packages/vault/dist/bin/process.js"), "--all"], {
  env: { ...process.env, SITDOWN_HOME: HOME, SITDOWN_PROCESSED: PROCESSED, SITDOWN_VAULTS_ROOT: VAULTS, SITDOWN_CENTRAL_VAULT: CENTRAL, SITDOWN_EVENTS_DB: EVENTS, SITDOWN_EVENT_STORE: "sqlite" }, encoding: "utf8",
});
const apiNote = path.join(CENTRAL, "features", "api.md");
const inVault = existsSync(apiNote) && /jin|rotat/i.test(readFileSync(apiNote, "utf8"));
console.log(`C · vault + events  ${ok(c.status === 0)}  ${(c.stdout || "").split("\n").find((l) => l.includes("note(s)")) || ""}`);
console.log(`C · new work in features/api.md  ${ok(inVault)}`);

// 5. D: ask the live server and confirm it surfaces the brand-new work.
async function askAI(q) {
  const r = await fetch(`${BASE}/api/answer`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q }) });
  return r.json();
}
try {
  const a = await askAI("what's the newest change to API keys, who did it, and what was the overlap decision?");
  const hit = /jin/i.test(a.answer) && /(overlap|rotat)/i.test(a.answer);
  console.log(`\nD · live AI answer  ${ok(hit && a.found)}`);
  console.log(`     ${a.answer.replace(/\n/g, "\n     ").slice(0, 500)}`);
  console.log(`     cites: ${(a.citations || []).slice(0, 5).join(", ")}`);
  console.log(`\n${hit && madeDecision && inVault ? col(32, "✔ END-TO-END LIVE TEST PASSED") : col(31, "✖ something didn't flow through")}`);
} catch (e) {
  console.log(`\nD · could not reach ${BASE} — is the server running?  (${e.message})`);
}
