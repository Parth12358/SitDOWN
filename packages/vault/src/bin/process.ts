#!/usr/bin/env node
// C's main entry: read Digests from processed/, selectively regenerate the vault, emit the
// typed events, commit the vault, and record state. One-shot by default; `--watch` polls.
//
// Env overrides (see config.ts): SITDOWN_PROCESSED, SITDOWN_VAULTS_ROOT, SITDOWN_CENTRAL_VAULT, SITDOWN_EVENTS_DB,
// SITDOWN_EVENT_STORE, SITDOWN_HOME, SITDOWN_CONFIG.
// Flags: --watch[=ms]  poll instead of exiting; --all  reprocess every Digest.
import { loadConfig } from "../config.js";
import { makeEventSink } from "../events.js";
import { eventsForDigest } from "../events/map.js";
import { batchMessage, commitAll } from "../git.js";
import { chronological, loadDigests } from "../reads.js";
import {
  changedDigests,
  loadState,
  recordDigests,
  saveState,
  unemittedDigests,
} from "../state.js";
import { collectAffected, writeBatch } from "../writer.js";

interface Options {
  watchMs: number | null;
  all: boolean;
}

function parseArgs(argv: string[]): Options {
  let watchMs: number | null = null;
  let all = false;
  for (const a of argv) {
    if (a === "--watch") watchMs = 3000;
    else if (a.startsWith("--watch=")) watchMs = Math.max(500, Number(a.slice(8)) || 3000);
    else if (a === "--all") all = true;
  }
  return { watchMs, all };
}

async function runOnce(all: boolean): Promise<number> {
  const cfg = loadConfig();
  const digests = await loadDigests(cfg.processedDir);
  if (!digests.length) {
    console.log(`[vault] no digests in ${cfg.processedDir}`);
    return 0;
  }

  const state = await loadState(cfg.stateDir);
  const changed = all ? digests : changedDigests(digests, state);
  if (!changed.length) {
    console.log("[vault] nothing new to process");
    return 0;
  }

  // 1. Regenerate exactly the affected notes from the full digest set, split across the central
  //    vault (shared) and each person's own vault (private).
  const affected = collectAffected(changed);
  const written = await writeBatch(digests, affected, {
    central: cfg.centralVault,
    personVaultFor: cfg.personVault,
    centralName: cfg.centralName,
  });
  console.log(`[vault] wrote ${written.length} note(s) for ${changed.length} changed digest(s)`);

  // 2. Emit events (chronological), FeatureTouched already ordered first per digest.
  //    Events are immutable facts: emit each source exactly once, even if its Digest is
  //    re-summarized and re-selected as "changed", so the event stream never double-counts.
  const toEmit = unemittedDigests(changed, state);
  const sink = makeEventSink(cfg.eventStore);
  let emitted = 0;
  for (const d of chronological(toEmit)) {
    for (const { author, event, ts } of eventsForDigest(d)) {
      await sink.emit(author, event, ts);
      emitted++;
    }
  }
  await sink.flush?.();
  console.log(`[vault] emitted ${emitted} event(s) to ${cfg.eventStore} (${toEmit.length} new source(s))`);

  // 3. Commit each touched vault (central + every affected person's) naming the sources.
  const msg = batchMessage(changed.map((d) => d.source));
  const vaults = new Set<string>([cfg.centralVault]);
  for (const author of new Set(changed.map((d) => d.author))) vaults.add(cfg.personVault(author));
  let committedCount = 0;
  for (const v of vaults) if (await commitAll(v, msg)) committedCount++;
  if (committedCount) console.log(`[vault] committed ${committedCount} vault(s)`);

  // 4. Record state: hashes for all changed notes, plus the sources whose events we just emitted.
  await saveState(cfg.stateDir, recordDigests(state, changed, toEmit));
  return written.length;
}

async function main(): Promise<void> {
  const { watchMs, all } = parseArgs(process.argv.slice(2));
  await runOnce(all);
  if (watchMs == null) return;

  console.log(`[vault] watching (every ${watchMs}ms); Ctrl-C to stop`);
  // Simple poll loop. Each pass only processes changed digests (selective).
  const tick = async (): Promise<void> => {
    try {
      await runOnce(false);
    } catch (err) {
      console.error(`[vault] watch pass failed: ${(err as Error).message}`);
    }
  };
  const interval = setInterval(() => void tick(), watchMs);
  process.on("SIGINT", () => {
    clearInterval(interval);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
