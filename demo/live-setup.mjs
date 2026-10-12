#!/usr/bin/env node
// Create the live-demo playground: a small git repo whose project-level .claude/settings.json runs
// the real capture hook (demo/capture-hook.mjs) after every Claude Code turn. Open Claude Code in
// it, do some work, and `pnpm demo:watch` turns the session into vault notes the dashboard answers.
//
//   node demo/live-setup.mjs          (idempotent; prints the folder to open)
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.SITDOWN_HOME ? path.resolve(process.env.SITDOWN_HOME) : path.join(here, ".sitdown-demo");
const PLAY = path.join(HOME, "playground");
const AUTHOR = process.env.DEMO_AUTHOR || "parth";
const BRANCH = process.env.DEMO_BRANCH || "feat/search";

const fwd = (p) => p.split(path.sep).join("/");
const git = (...args) => spawnSync("git", args, { cwd: PLAY, encoding: "utf8" });

mkdirSync(path.join(PLAY, ".claude"), { recursive: true });
mkdirSync(path.join(PLAY, "src"), { recursive: true });

// Project-scoped hook: only sessions started in this folder are captured.
const hook = `"${fwd(process.execPath)}" "${fwd(path.join(here, "capture-hook.mjs"))}"`;
writeFileSync(
  path.join(PLAY, ".claude", "settings.json"),
  JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: hook }] }] } }, null, 2) + "\n",
);

if (!existsSync(path.join(PLAY, ".git"))) {
  writeFileSync(path.join(PLAY, "README.md"), "# acme/app\n\nTiny demo app.\n");
  writeFileSync(
    path.join(PLAY, "src", "search.js"),
    "// Product search. TODO: it's a linear scan over every product.\nexport function search(products, q) {\n  return products.filter((p) => p.name.includes(q));\n}\n",
  );
  git("init", "-q", "-b", "main");
  git("config", "user.name", AUTHOR);
  git("config", "user.email", `${AUTHOR}@example.com`);
  git("add", "-A");
  git("commit", "-q", "-m", "initial app");
  git("checkout", "-q", "-b", BRANCH);
}

console.log(`playground ready: ${PLAY}`);
console.log(`  author: ${AUTHOR} · branch: ${git("rev-parse", "--abbrev-ref", "HEAD").stdout.trim()}`);
console.log(`  hook:   ${hook}`);
console.log(`\nNext:\n  1. pnpm demo:serve      (terminal 1)\n  2. pnpm demo:watch      (terminal 2)\n  3. cd "${PLAY}" && claude   (terminal 3) — do some work, then ask the dashboard about it`);
