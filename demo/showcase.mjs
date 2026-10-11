#!/usr/bin/env node
// SitDOWN showcase — runs the whole product end-to-end against the live server and narrates each
// capability. Great for demo day or a quick "does it all work?" pass.
//
//   pnpm demo:showcase          (starts the server itself if it isn't already running)
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const BASE = process.env.MCP_HTTP || "http://127.0.0.1:8788";
const PAUSE = Number(process.env.PAUSE_MS ?? 700);

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const C = COLOR
  ? { dim: "\x1b[2m", b: "\x1b[1m", r: "\x1b[0m", amber: "\x1b[38;5;179m", green: "\x1b[32m", rust: "\x1b[38;5;131m", gray: "\x1b[90m" }
  : { dim: "", b: "", r: "", amber: "", green: "", rust: "", gray: "" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rule = () => console.log(C.gray + "─".repeat(74) + C.r);
function step(n, title) { console.log(`\n${C.amber}${C.b}  ${n}. ${title}${C.r}`); rule(); }
function say(label, text) { console.log(`${C.rust}${label}${C.r} ${text}`); }
function block(text, indent = "   ") { console.log(text.split("\n").map((l) => C.dim + indent + C.r + l).join("\n")); }

async function post(p, body) { const r = await fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) }); return r.json(); }
async function getJSON(p) { const r = await fetch(BASE + p); return r.ok ? r.json() : null; }
async function health() { try { return await getJSON("/api/health"); } catch { return null; } }

async function ensureServer() {
  if (await health()) return null;
  console.log(`${C.dim}starting dashboard server…${C.r}`);
  const child = spawn(process.execPath, [path.join(repo, "demo", "serve.mjs")], { cwd: repo, stdio: "ignore", detached: false });
  for (let i = 0; i < 40; i++) { await sleep(250); if (await health()) return child; }
  throw new Error("server did not come up — run `pnpm demo:seed` first, then `pnpm demo:serve`");
}

async function main() {
  console.log(`\n${C.amber}${C.b}┌─ SitDOWN ─ ask the record ────────────────────────────────────────────┐${C.r}`);
  console.log(`${C.amber}${C.b}└─ live showcase ───────────────────────────────────────────────────────┘${C.r}`);
  const started = await ensureServer();

  // 1. It's real, not canned.
  step(1, "Live over a real vault + event store");
  const h = await health();
  say("vault:", `${h.central}`);
  say("mode: ", `${h.fixtures ? "fixtures" : "generated org vault"} · events: ${h.events}`);
  await sleep(PAUSE);

  // 2. Grounded, cited AI answer.
  step(2, "Ask in plain language → grounded, cited answer");
  say("Q:", "why do refunds use idempotency keys?");
  const a2 = await post("/api/answer", { q: "why do refunds use idempotency keys?" });
  block(a2.answer); console.log(`   ${C.gray}sources: ${(a2.citations || []).slice(0, 4).join(", ")}${C.r}`);
  await sleep(PAUSE);

  // 3. Person dossier + conversation memory.
  step(3, "Drill into a person — and follow up (it remembers)");
  say("Q:", "what did otto do?");
  const a3 = await post("/api/answer", { q: "what did otto do?" });
  block(a3.answer.slice(0, 520));
  say("\nQ (follow-up):", "and is anything of his unfinished?");
  const a3b = await post("/api/answer", { q: "and is anything of his unfinished?", history: [{ q: "what did otto do?", a: a3.answer }] });
  block(a3b.answer.slice(0, 360));
  console.log(`   ${C.green}↳ kept "otto" as the subject with no name in the follow-up${C.r}`);
  await sleep(PAUSE);

  // 4. Who to ask (event-store ranking).
  step(4, "Who knows this? (ranked from the event stream)");
  const a4 = await post("/api/tool", { tool: "who_knows", args: { feature: "billing" } });
  say("billing →", (a4.people || []).map((p) => `${p.author} (${p.score})`).join(", "));
  await sleep(PAUSE);

  // 5. Standup digest.
  step(5, "What happened since last standup");
  const a5 = await post("/api/standup", {});
  say("window:", `${a5.since} → ${a5.until}`);
  block((a5.answer || "").slice(0, 620));
  await sleep(PAUSE);

  // 6. Clickable source → read the note.
  step(6, "Every answer cites notes you can open");
  const notePath = (a2.citations || []).find((c) => /\.md$/.test(c)) || "central/features/payments.md";
  const n = await getJSON("/api/note?path=" + encodeURIComponent(notePath));
  say("opened:", notePath);
  if (n) block(n.content.split("\n").slice(0, 10).join("\n"));
  await sleep(PAUSE);

  // 7. The money shot: a brand-new session, live, end to end.
  step(7, "LIVE: a new coding session flows capture → claude -p → vault → answer");
  spawnSync(process.execPath, [path.join(repo, "demo", "live-test.mjs")], { cwd: repo, stdio: "inherit" });

  rule();
  console.log(`\n${C.green}${C.b}  ✔ showcase complete${C.r} — open ${C.b}${BASE}${C.r} to click around.`);
  if (started) console.log(`${C.dim}  (a server was started for this run; it keeps running. Ctrl-C this process to leave it, or stop it later.)${C.r}`);
  console.log("");
}

main().catch((e) => { console.error(`\n${C.rust}showcase error:${C.r} ${e.message}`); process.exit(1); });
