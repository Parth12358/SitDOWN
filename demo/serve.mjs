#!/usr/bin/env node
// Serve the SitDOWN dashboard wired to the REAL product: same-origin HTTP that runs D's actual
// MCP tools against the real vault + event store (falls back to contracts/fixtures when no vault
// is configured). No CORS, no canned data — the dashboard's live path calls /api/tool here.
//
//   pnpm --filter @sitdown/mcp build           # once, so dist/ exists
//   node demo/serve.mjs                         # then open http://localhost:8788
//   SITDOWN_CENTRAL_VAULT=… SITDOWN_VAULTS_ROOT=… SITDOWN_EVENTS_DB=… node demo/serve.mjs
import { createServer } from "node:http";
import { readFileSync, existsSync, realpathSync } from "node:fs";
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

// Default to the demo home so `node demo/serve.mjs` just works (cross-OS, no env needed).
process.env.SITDOWN_HOME = process.env.SITDOWN_HOME || path.resolve(here, "..", "demo", ".sitdown-demo");
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

// Everyone the docs know about (config + whoever has a person note in the vault).
function peopleNames() {
  const set = new Set(Object.keys(ctx.cfg.people || {}));
  for (const n of readNotes(ctx.centralVault, "person")) set.add(typeof n.frontmatter.author === "string" ? n.frontmatter.author : n.name);
  return [...set];
}
// Pull one daily note's bullets for a given person (its `## [[name]]` section).
function dailyBulletsFor(note, person) {
  const out = []; let on = false;
  for (const line of note.autoBody.split(/\r?\n/)) {
    const h = /^##\s+\[\[([^\]]+)\]\]/.exec(line) || /^##\s+(.+)$/.exec(line);
    if (h) { on = h[1].trim().toLowerCase() === person.toLowerCase(); continue; }
    const b = /^[-*]\s+(.*)$/.exec(line.trim());
    if (on && b) out.push(b[1].replace(/\[\[|\]\]/g, "").trim());
  }
  return out;
}
// A full dossier of one person's work, gathered across the vault.
function dossier(person) {
  const cite = new Set(); const parts = [`=== ${person} ===`];
  const pnote = readNotes(ctx.centralVault, "person").find((n) => (n.frontmatter.author || n.name) === person);
  if (pnote) { parts.push(`Profile (${pnote.relPath}):\n${pnote.autoBody}`); cite.add(pnote.relPath); }
  const days = [];
  for (const d of readNotes(ctx.centralVault, "daily")) {
    const b = dailyBulletsFor(d, person);
    if (b.length) { days.push(`${d.name}: ${b.join("; ")}`); cite.add(d.relPath); }
  }
  if (days.length) parts.push(`Daily log:\n${days.map((x) => "- " + x).join("\n")}`);
  const decs = readNotes(ctx.centralVault, "decision").filter((n) => n.frontmatter.author === person);
  if (decs.length) { parts.push(`Decisions ${person} made:\n${decs.map((n) => `- ${n.title} — ${n.autoBody.replace(/\s+/g, " ").slice(0, 220)} (${n.relPath})`).join("\n")}`); decs.forEach((n) => cite.add(n.relPath)); }
  const feats = readNotes(ctx.centralVault, "feature").filter((n) => new RegExp(`\\b${person}\\b`, "i").test(n.autoBody));
  if (feats.length) { parts.push(`Features ${person} touched: ${feats.map((n) => n.name).join(", ")}`); feats.forEach((n) => cite.add(n.relPath)); }
  return { text: parts.join("\n\n"), citations: [...cite], empty: !pnote && !days.length && !decs.length };
}

// RAG: person-aware retrieval + keyword search, then a grounded, cited answer. `history` is recent
// {q,a} turns so follow-ups ("go deeper", "what else") keep their subject.
async function answer(q, requester, history = []) {
  const all = peopleNames();
  const named = all.filter((n) => new RegExp(`\\b${n}\\b`, "i").test(q));
  // If the question names nobody, fall back to the tagged person, then to anyone named in the recent turns.
  let focus = named.length ? named : (requester && all.includes(requester) ? [requester] : []);
  if (!focus.length) { const histText = history.map((h) => `${h.q} ${h.a || ""}`).join(" "); focus = all.filter((n) => new RegExp(`\\b${n}\\b`, "i").test(histText)); }
  focus = [...new Set(focus)].slice(0, 3);

  const blocks = []; const cites = new Set();
  for (const p of focus) { const d = dossier(p); if (!d.empty) { blocks.push(d.text); d.citations.forEach((c) => cites.add(c)); } }

  const sr = await tools.search_docs({ query: q, requester }, ctx);
  const notes = {}; for (const t of ["decision", "feature", "daily", "person"]) for (const n of readNotes(ctx.centralVault, t)) notes[n.relPath] = n;
  for (const h of (sr.results || []).slice(0, 6)) { if (cites.has(h.path)) continue; const n = notes[h.path]; blocks.push(`### ${h.title} (${h.path})\nsources: ${(h.sources || []).join(", ") || "—"}\n${n ? n.autoBody : h.snippet}`); cites.add(h.path); }

  if (!blocks.length) return { answer: "I don't know — the docs don't cover this yet.", citations: [], found: false };

  const wantsDetail = /detail|deep|deeper|everything|more|thorough|breakdown|all of/i.test(q) || focus.length > 0;
  const histText = history.filter((h) => h.q).slice(-3).map((h) => `Q: ${h.q}\nA: ${(h.a || "").slice(0, 300)}`).join("\n");
  const shape = focus.length
    ? `This question is about ${focus.join(" and ")}. Give a DETAILED, organized rundown grouped by feature or date: what they shipped, the decisions they made (chosen vs rejected and why), and anything open or unfinished. Use short **bold** headers and - bullets.`
    : wantsDetail ? "Give a thorough answer with short **bold** headers and - bullets." : "Answer in 2–4 crisp sentences.";
  // Grounded-RAG prompt: XML-delimited blocks, context-only, mandatory citations, explicit
  // not-found rule (second hallucination guard; the first is the empty-retrieval skip above).
  const prompt = `You are SitDOWN, a documentation assistant for an engineering team. The notes in <context> are generated from the team's real coding sessions and commits.

<rules>
- Answer using ONLY <context>. Never use outside knowledge, and never guess or invent.
- Be concrete: name the people, features, dates, and decisions involved.
- If <context> does not contain the answer, reply exactly: "I don't know — the docs don't cover this yet." and nothing else.
- In "citations", list the note paths and source ids from <context> that you actually used.
- Format: ${shape}
</rules>
${histText ? `<conversation>\n${histText}\n</conversation>\n` : ""}<context>
${blocks.join("\n\n")}
</context>

<question>${q}</question>

Return ONLY a JSON object: {"answer": "<markdown>", "citations": ["<note path or source id>", ...]}`;
  const raw = await askClaude(prompt);
  let parsed;
  try { const s = raw.indexOf("{"), e = raw.lastIndexOf("}"); parsed = JSON.parse(raw.slice(s, e + 1)); }
  catch { parsed = { answer: raw.trim(), citations: [] }; }
  const citations = (parsed.citations && parsed.citations.length ? parsed.citations : [...cites]) || [];
  return { answer: parsed.answer || "I don't know.", citations, found: true, focus };
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
  if (u.pathname === "/api/note") {
    // Serve a single .md note from the central or a per-person vault. Path-safe: resolved paths
    // must stay inside a known vault and end in .md.
    const rel = (u.searchParams.get("path") || "").replace(/^\/+/, "").replace(/^central\//, "");
    const roots = [cfg.centralVault, cfg.vaultsRoot].map((r) => { try { return realpathSync(r); } catch { return path.resolve(r); } });
    const cands = [path.join(cfg.centralVault, rel), path.join(cfg.vaultsRoot, rel)];
    let hit = null;
    for (const c of cands) {
      if (!c.endsWith(".md") || !existsSync(c)) continue;
      let real; try { real = realpathSync(c); } catch { continue; }
      if (roots.some((r) => real === r || real.startsWith(r + path.sep))) { hit = c; break; }
    }
    if (!hit) return json(404, { error: "note not found", path: rel });
    return json(200, { path: rel, content: readFileSync(hit, "utf8") });
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
      try { const { q, requester, history } = JSON.parse(b || "{}"); return json(200, await answer(String(q || ""), requester, Array.isArray(history) ? history : [])); }
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
