#!/usr/bin/env node
// SitDOWN capture CLI (fork of @alikeai/setup, MIT). Entry point only — logic lives in ../src.
// Subcommands: install-hooks, install-git-hook, --dry-run, --doctor, --uninstall.
import { main } from "../src/cli.mjs";

main(process.argv.slice(2)).catch((err) => {
  // Hooks fail open: never block a coding agent.
  console.error("[sitdown] capture error:", err?.message ?? err);
  process.exit(0);
});
