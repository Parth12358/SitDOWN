#!/usr/bin/env node
// Serve the SitDOWN dashboard wired to the REAL product: same-origin HTTP that runs D's actual
// MCP tools against the real vault + event store (falls back to contracts/fixtures when no vault
// is configured). No CORS, no canned data — the dashboard's live path calls /api/tool here.
//
//   pnpm --filter @sitdown/mcp build           # once, so dist/ exists
//   node demo/serve.mjs                         # then open http://localhost:8788
//   SITDOWN_CENTRAL_VAULT=… SITDOWN_VAULTS_ROOT=… SITDOWN_EVENTS_DB=… node demo/serve.mjs
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mcp = path.resolve(here, "..", "packages", "mcp", "dist");

let loadConfig, createEventStore, tools, readNotes;
try {
  ({ loadConfig } = await import(path.join(mcp, "config.js")));
  ({ createEventStore } = await import(path.join(mcp, "events", "index.js")));
  ({ readNotes } = await import(path.join(mcp, "vault.js")));
  tools = await import(path.join(mcp, "tools.js"));
} catch (e) {
  console.error("Could not load the MCP build. Run `pnpm --filter @sitdown/mcp build` first.\n", e.message);
  process.exit(1);
}

const cfg = loadConfig();
const events = createEventStore(cfg);
const ctx = { centralVault: cfg.centralVault, personVaultFor: cfg.personVault, cfg, events };
const PORT = Number(process.env.PORT || 8788);

// Run `claude -p` headlessly (uses the signed-in Claude Code session; no API key). Prompt on stdin.
function askClaude(prompt) {
  return new Promise((resolve, reject) => {
    const bin = process.env.CLAUDE_BIN || "claude";
    const child = spawn(bin, ["-p", "--output-format", "json"], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("claude -p timed out")); }, Number(process.env.CLAUDE_TIMEOUT_MS) || 60000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => reject(new Error(`could not run \`${bin} -p\` (is Claude Code installed?): ${e.message}`)));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`claude -p exited ${code}: ${err.slice(0, 300)}`));
      try { const env = JSON.parse(out); return resolve(typeof env.result === "string" ? env.result : out); } catch { return resolve(out); }
    });
    child.stdin.write(prompt); child.stdin.end();
  });
}

// RAG: retrieve the most relevant notes, then let the model synthesize a grounded, cited answer.
async function answer(q, requester) {
  const sr = await tools.search_docs({ query: q, requester }, ctx);
  const hits = sr.results || [];
  if (!hits.length) return { answer: "I don't know — the docs don't cover this yet.", citations: [], found: false };
  const notes = {};
  for (const t of ["decision", "feature", "daily", "person"]) for (const n of readNotes(ctx.centralVault, t)) notes[n.relPath] = n;
  const context = hits.slice(0, 6).map((h) => {
    const n = notes[h.path];
    return `### ${h.title}\npath: ${h.path}\nsources: ${(h.sources || []).join(", ") || "—"}\n${n ? n.autoBody : h.snippet}`;
  }).join("\n\n");
  const prompt = `You are SitDOWN, answering a teammate's question strictly from the engineering notes below.
Use ONLY these notes. Answer in 2–4 sentences, concrete and specific. Name the people and decisions involved.
If the notes don't contain the answer, say you don't know. Do not invent anything.

QUESTION: ${q}

NOTES:
${context}

Reply with ONLY a JSON object: {"answer": "<your answer>", "citations": ["<note path or source id you used>", ...]}`;
  const raw = await askClaude(prompt);
  let parsed;
  try { const s = raw.indexOf("{"), e = raw.lastIndexOf("}"); parsed = JSON.parse(raw.slice(s, e + 1)); }
  catch { parsed = { answer: raw.trim(), citations: [] }; }
  const citations = (parsed.citations && parsed.citations.length ? parsed.citations : sr.citations) || [];
  return { answer: parsed.answer || "I don't know.", citations, found: true };
}

function page() {
  const inner = readFileSync(path.join(here, "dashboard.html"), "utf8");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SitDOWN — Ask the record</title></head><body>${inner}</body></html>`;
}

function isoMinus(iso, days) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); }

// "What got done since last week's standup": summarize the daily notes + decisions in the last 7 days.
async function standup() {
  const dailies = readNotes(ctx.centralVault, "daily")
    .map((n) => ({ n, d: (typeof n.frontmatter.date === "string" && n.frontmatter.date) || n.name }))
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.d));
  if (!dailies.length) return { answer: "No activity recorded yet.", since: null, until: null, citations: [] };
  const until = dailies.map((x) => x.d).sort().at(-1);
  const since = isoMinus(until, 7);
  const win = dailies.filter((x) => x.d > since && x.d <= until).sort((a, b) => (a.d < b.d ? -1 : 1));
  const decs = readNotes(ctx.centralVault, "decision").filter((n) => (n.updated || "") > since && (n.updated || "") <= until);
  if (!win.length) return { answer: `Nothing recorded since the last standup (${since}).`, since, until, citations: [] };
  const daysText = win.map((x) => `## ${x.d}\n${x.n.autoBody}`).join("\n\n");
  const decText = decs.map((n) => `- ${n.title} — ${n.relPath}`).join("\n") || "(none)";
  const prompt = `It is the weekly standup on ${until}. Below are the team's daily notes since the last standup on ${since}. Summarize what got done. Group by person: put the name in **bold**, then 1–2 short bullets of what they shipped or decided. Then a short "Decisions this week" list. Flag anything that reads unfinished or blocked. Be concise and concrete; use only what's below.

DAILY NOTES SINCE ${since}:
${daysText}

DECISIONS SINCE ${since}:
${decText}

Reply with ONLY JSON: {"answer": "<markdown with ** bold names and - bullets>"}`;
  const raw = await askClaude(prompt);
  let p; try { const s = raw.indexOf("{"), e = raw.lastIndexOf("}"); p = JSON.parse(raw.slice(s, e + 1)); } catch { p = { answer: raw.trim() }; }
  return { answer: p.answer || "", since, until, citations: [...new Set([...win.map((x) => x.n.relPath), ...decs.map((n) => n.relPath)])] };
}

const server = createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const json = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };

  if (u.pathname === "/" || u.pathname === "/dashboard.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(page()); return;
  }
  if (u.pathname === "/api/health") {
    return json(200, { ok: true, central: cfg.centralVault, fixtures: cfg.usingFixtures, events: events.kind });
  }
  if (u.pathname === "/api/standup" && req.method === "POST") {
    req.on("data", () => {}); req.on("end", async () => {
      try { return json(200, await standup()); } catch (e) { return json(500, { error: String(e && e.message || e) }); }
    });
    return;
  }
  if (u.pathname === "/api/answer" && req.method === "POST") {
    let b = ""; req.on("data", (c) => (b += c));
    req.on("end", async () => {
      try { const { q, requester } = JSON.parse(b || "{}"); return json(200, await answer(String(q || ""), requester)); }
      catch (e) { return json(500, { error: String(e && e.message || e) }); }
    });
    return;
  }
  if (u.pathname === "/api/tool" && req.method === "POST") {
    let b = ""; req.on("data", c => (b += c));
    req.on("end", async () => {
      try {
        const { tool, args } = JSON.parse(b || "{}");
        if (!tools[tool]) return json(400, { error: `unknown tool: ${tool}` });
        return json(200, await tools[tool](args || {}, ctx));
      } catch (e) { return json(500, { error: String(e && e.message || e) }); }
    });
    return;
  }
  res.writeHead(404, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "not found" }));
});
server.listen(PORT, "127.0.0.1", () =>
  console.log(`SitDOWN dashboard (LIVE) → http://localhost:${PORT}\n  vault: ${cfg.usingFixtures ? "contracts/fixtures (fallback)" : cfg.centralVault}\n  events: ${events.kind}`));
