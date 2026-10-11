#!/usr/bin/env node
// Eval runner — PRD-F. Scores the docs by calling D's MCP tools over Streamable HTTP.
//
// Endpoint resolution:
//   - MCP_HTTP set            -> use that running server (live integration path).
//   - otherwise               -> spawn packages/mcp/dist/http.js on a free port against whatever
//                                vault/events D resolves (live vault if present, else the fixtures).
// Metrics: accuracy (answerable), made-up (hallucinated on unanswerable), correct "I don't know",
// latency p50 + max. Prints a table and writes results.json.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import net from "node:net";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const { cases } = JSON.parse(readFileSync(path.join(here, "..", "cases.json"), "utf8"));
const resultsPath = path.join(here, "..", "results.json");

const DEFAULT_ARGS = {
  search_docs: (c) => ({ query: c.question }),
  get_decision: (c) => ({ topic: c.question }),
  get_brief: (c) => ({ feature: c.question }),
  who_knows: (c) => ({ feature: c.question }),
  get_summary: (c) => ({}),
};

function argsFor(c) {
  return c.args ?? (DEFAULT_ARGS[c.tool] ? DEFAULT_ARGS[c.tool](c) : {});
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHealth(base, ms = 6000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

// --- minimal MCP Streamable-HTTP client ---------------------------------------
const ACCEPT = "application/json, text/event-stream";

async function rpc(base, method, params, sid) {
  const headers = { "content-type": "application/json", accept: ACCEPT };
  if (sid) headers["mcp-session-id"] = sid;
  const res = await fetch(`${base}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: Math.floor(Math.random() * 1e9), method, params }),
  });
  const sidOut = res.headers.get("mcp-session-id");
  const text = await res.text();
  const line = text.split("\n").find((l) => l.startsWith("data:")) ?? text;
  let json = {};
  try {
    json = JSON.parse(line.replace(/^data:\s*/, ""));
  } catch {
    /* leave {} */
  }
  return { sidOut, json };
}

async function connect(base) {
  const init = await rpc(base, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "sitdown-evals", version: "0" },
  });
  const sid = init.sidOut;
  await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: ACCEPT, "mcp-session-id": sid },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  return sid;
}

async function callTool(base, sid, name, args) {
  const { json } = await rpc(base, "tools/call", { name, arguments: args }, sid);
  const result = json.result ?? {};
  const textPart = result.content?.find?.((c) => c.type === "text")?.text;
  let parsed;
  try {
    parsed = textPart ? JSON.parse(textPart) : result.structuredContent;
  } catch {
    parsed = undefined;
  }
  const blob = JSON.stringify(parsed ?? result ?? json).toLowerCase();
  return { parsed, blob, error: json.error };
}

// --- scoring ------------------------------------------------------------------
function isNotFound(parsed, blob) {
  if (parsed && typeof parsed === "object") {
    if (parsed.found === false) return true;
    if (Array.isArray(parsed.results) && parsed.results.length === 0) return true;
    if (Array.isArray(parsed.people) && parsed.people.length === 0) return true;
  }
  return /i don't know|don't cover|no (recorded|matching)/.test(blob);
}

function scoreCase(c, parsed, blob, error) {
  const unanswerable = !!c.unanswerable;
  if (error) return { pass: false, hallucinated: false, idk: false, note: `error: ${error.message ?? error}` };
  if (unanswerable) {
    const idk = isNotFound(parsed, blob);
    return { pass: idk, hallucinated: !idk, idk, note: idk ? "correct I-don't-know" : "MADE UP an answer" };
  }
  const missing = (c.expect ?? []).filter((e) => !blob.includes(String(e).toLowerCase()));
  const found = !isNotFound(parsed, blob);
  const pass = found && missing.length === 0;
  return {
    pass,
    hallucinated: false,
    idk: false,
    note: pass ? "ok" : missing.length ? `missing: ${missing.join(", ")}` : "not found",
  };
}

function pct(n, d) {
  return d === 0 ? "n/a" : `${((100 * n) / d).toFixed(0)}%`;
}
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

// --- main ---------------------------------------------------------------------
async function main() {
  let base = process.env.MCP_HTTP?.replace(/\/$/, "");
  let child;
  if (!base) {
    const httpEntry = path.join(repoRoot, "packages", "mcp", "dist", "http.js");
    if (!existsSync(httpEntry)) {
      console.error(`[evals] ${httpEntry} not found — run \`pnpm --filter @sitdown/mcp build\` first,`);
      console.error("[evals] or point MCP_HTTP at a running server.");
      process.exit(1);
    }
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    console.log(`[evals] starting MCP server: ${httpEntry} on :${port}`);
    child = spawn(process.execPath, [httpEntry], {
      env: { ...process.env, MCP_HTTP_PORT: String(port), MCP_HTTP_HOST: "127.0.0.1" },
      stdio: ["ignore", "ignore", "inherit"],
    });
  }

  try {
    if (!(await waitForHealth(base))) {
      console.error(`[evals] MCP server at ${base} never became healthy`);
      process.exit(1);
    }
    console.log(`[evals] ${cases.length} cases against ${base}\n`);
    const sid = await connect(base);

    const rows = [];
    for (const c of cases) {
      const t0 = performance.now();
      const { parsed, blob, error } = await callTool(base, sid, c.tool, argsFor(c));
      const ms = Math.round(performance.now() - t0);
      const score = scoreCase(c, parsed, blob, error);
      rows.push({ id: c.id, tool: c.tool, type: c.type, unanswerable: !!c.unanswerable, ms, ...score });
    }

    // table
    const w = { id: 20, tool: 13, type: 13, ms: 6, res: 6 };
    const head = `${"id".padEnd(w.id)}${"tool".padEnd(w.tool)}${"type".padEnd(w.type)}${"ms".padStart(w.ms)}  ${"result".padEnd(w.res)}  note`;
    console.log(head);
    console.log("-".repeat(head.length));
    for (const r of rows) {
      const res = r.pass ? "PASS" : "FAIL";
      console.log(
        `${r.id.padEnd(w.id)}${r.tool.padEnd(w.tool)}${r.type.padEnd(w.type)}${String(r.ms).padStart(w.ms)}  ${res.padEnd(w.res)}  ${r.note}`,
      );
    }

    const answerable = rows.filter((r) => !r.unanswerable);
    const unanswerable = rows.filter((r) => r.unanswerable);
    const lat = rows.map((r) => r.ms).sort((a, b) => a - b);
    const summary = {
      total: rows.length,
      passed: rows.filter((r) => r.pass).length,
      accuracy_answerable: pct(answerable.filter((r) => r.pass).length, answerable.length),
      correct_idk: pct(unanswerable.filter((r) => r.idk).length, unanswerable.length),
      made_up: rows.filter((r) => r.hallucinated).length,
      latency_p50_ms: percentile(lat, 50),
      latency_max_ms: lat[lat.length - 1] ?? 0,
    };

    console.log("\nsummary");
    console.log("-------");
    console.log(`passed              ${summary.passed}/${summary.total}`);
    console.log(`accuracy (answerable)  ${summary.accuracy_answerable}`);
    console.log(`correct "I don't know" ${summary.correct_idk}`);
    console.log(`made-up answers        ${summary.made_up}`);
    console.log(`latency p50 / max      ${summary.latency_p50_ms}ms / ${summary.latency_max_ms}ms`);

    writeFileSync(resultsPath, JSON.stringify({ endpoint: base, summary, cases: rows }, null, 2));
    console.log(`\nwrote ${path.relative(repoRoot, resultsPath)}`);

    process.exitCode = summary.passed === summary.total ? 0 : 1;
  } finally {
    if (child) child.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
