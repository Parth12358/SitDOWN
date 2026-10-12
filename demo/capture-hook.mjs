#!/usr/bin/env node
// Claude Code `Stop` hook for the live demo: the real capture (A) session-end runtime, pointed at
// the isolated demo home so a real session lands in demo/.sitdown-demo/inbox — never ~/.sitdown.
// Wired into the playground repo's .claude/settings.json by `node demo/live-setup.mjs`.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.SITDOWN_HOME ||= path.join(here, ".sitdown-demo");

try {
  const { main } = await import(pathToFileURL(path.join(here, "..", "packages", "capture", "src", "cli.mjs")).href);
  await main(["session-end", "--agent", "claude_code"]);
} catch (e) {
  // Hooks fail open: never block the agent.
  console.error("[sitdown] capture error:", e?.message ?? e);
}
process.exit(0);
