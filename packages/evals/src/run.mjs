#!/usr/bin/env node
// Eval runner — PRD-F. STUB.
// Calls MCP tools (HTTP endpoint from D; until then, a stub reading contracts/fixtures/vault/).
// Scores: accuracy, made-up answers, correct "I don't know", latency (p50, max). Prints a table; writes results.json.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { cases } = JSON.parse(readFileSync(path.join(here, "..", "cases.json"), "utf8"));

const MCP_HTTP = process.env.MCP_HTTP ?? `http://localhost:${process.env.MCP_HTTP_PORT ?? 7331}`;

async function main() {
  console.log(`[evals] ${cases.length} cases against ${MCP_HTTP}`);
  console.error("eval runner not implemented — wire MCP calls + scoring here");
  process.exit(1);
}
main();
