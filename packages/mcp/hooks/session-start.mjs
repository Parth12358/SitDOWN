#!/usr/bin/env node
// Claude Code SessionStart hook: brief the agent on the current branch's feature.
// Prints a short Markdown summary to stdout (Claude Code injects it into context).
// Fails open within 5s per the project rule — a hook must never block the agent.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function currentBranch() {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

async function run() {
  const branch = process.env.SITDOWN_BRANCH || currentBranch();
  if (!branch) return;

  const { loadConfig } = await import(pathToFileURL(path.join(here, "..", "dist", "config.js")).href);
  const { createEventStore } = await import(pathToFileURL(path.join(here, "..", "dist", "events", "index.js")).href);
  const { get_brief } = await import(pathToFileURL(path.join(here, "..", "dist", "tools.js")).href);

  const cfg = loadConfig();
  const ctx = { vaultPath: cfg.vaultPath, cfg, events: createEventStore(cfg), requester: process.env.SITDOWN_REQUESTER };
  const brief = await get_brief({ branch }, ctx);
  if (!brief.found) return;

  const lines = [`## SitDOWN brief — ${brief.feature}`, ""];
  if (brief.decisions.length) {
    lines.push("Recent decisions:");
    for (const d of brief.decisions) lines.push(`- **${d.title}** — chose: ${d.chosen} (reason: ${d.reason})`);
    lines.push("");
  }
  if (brief.who_else.length) lines.push(`Also working on it: ${brief.who_else.map((w) => w.author).join(", ")}.`);
  if (brief.open_threads.length) lines.push(`Open threads: ${brief.open_threads.map((t) => t.topic).join(", ")}.`);
  process.stdout.write(lines.join("\n") + "\n");
}

// Fail open: never let the hook hang the session.
const timer = setTimeout(() => process.exit(0), 5000);
timer.unref();
run()
  .catch(() => {})
  .finally(() => process.exit(0));
