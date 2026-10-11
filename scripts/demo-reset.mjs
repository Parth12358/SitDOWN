#!/usr/bin/env node
// demo-reset — PRD-F. STUB. Node only; must run on Linux, Mac, Windows (path.join + os.homedir()).
// Resets the vault and event store to a known state, then replays today's real sessions through B and C.
import os from "node:os";
import path from "node:path";

const HOME = path.join(os.homedir(), ".sitdown");

async function main() {
  console.log(`[demo-reset] home=${HOME}`);
  console.error("demo-reset not implemented — reset vault + events, then replay sessions through B and C");
  process.exit(1);
}
main();
