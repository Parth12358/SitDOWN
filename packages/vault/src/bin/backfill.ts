#!/usr/bin/env node
// Replay a repo's git history as events so the store has data from the start
// (Keewano needs ~5 min before new events are queryable — run this early).
// Each commit -> FeatureTouched + CommitMade + AuthorType, with the ORIGINAL commit time.
//
// Usage: node dist/backfill.js [--repo <path>] [--limit N] [--store sqlite|keewano]
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AttributionLabel, SitdownEvent } from "@sitdown/contracts";
import { loadConfig } from "../config.js";
import { makeEventSink } from "../events.js";

const run = promisify(execFile);

interface Commit {
  sha: string;
  author: string;
  ts: string; // ISO (original commit author date)
  paths: string[];
  linesAdded: number;
  agent: boolean;
}

function parseArgs(argv: string[]): { repo: string; limit: number | null; store?: string } {
  let repo = process.cwd();
  let limit: number | null = null;
  let store: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repo") repo = argv[++i];
    else if (argv[i] === "--limit") limit = Number(argv[++i]) || null;
    else if (argv[i] === "--store") store = argv[++i];
  }
  return { repo, limit, store };
}

const AGENT_COAUTHOR = /co-authored-by:.*(claude|anthropic|codex|copilot|cursor|gpt)/i;

async function readBodies(repo: string): Promise<Map<string, string>> {
  const { stdout } = await run(
    "git",
    ["log", "--no-merges", "--pretty=format:%H%x1f%B%x1e"],
    { cwd: repo, maxBuffer: 50 * 1024 * 1024 },
  );
  const map = new Map<string, string>();
  for (const rec of stdout.split("\x1e")) {
    const trimmed = rec.replace(/^\s+/, "");
    if (!trimmed) continue;
    const sep = trimmed.indexOf("\x1f");
    if (sep === -1) continue;
    map.set(trimmed.slice(0, sep), trimmed.slice(sep + 1));
  }
  return map;
}

async function readCommits(repo: string, limit: number | null): Promise<Commit[]> {
  const bodies = await readBodies(repo);
  const args = ["log", "--no-merges", "--numstat", "--pretty=format:@@@%x1f%H%x1f%an%x1f%aI"];
  if (limit) args.push(`-n${limit}`);
  const { stdout } = await run("git", args, { cwd: repo, maxBuffer: 50 * 1024 * 1024 });

  const commits: Commit[] = [];
  let cur: Commit | null = null;
  for (const line of stdout.split("\n")) {
    if (line.startsWith("@@@")) {
      if (cur) commits.push(cur);
      const [, sha, author, ts] = line.split("\x1f");
      const body = bodies.get(sha) ?? "";
      cur = { sha, author, ts, paths: [], linesAdded: 0, agent: AGENT_COAUTHOR.test(body) };
    } else if (cur && line.trim()) {
      const [added, , ...rest] = line.split("\t");
      const path = rest.join("\t");
      if (path) cur.paths.push(path);
      cur.linesAdded += added === "-" ? 0 : Number(added) || 0;
    }
  }
  if (cur) commits.push(cur);
  // git log is newest-first; replay oldest-first so history reads chronologically.
  return commits.reverse();
}

/** Feature from the most-edited top-level folder of the commit's files. */
function featureOf(paths: string[]): string {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const seg = p.includes("/") ? p.slice(0, p.indexOf("/")) : "root";
    counts.set(seg, (counts.get(seg) ?? 0) + 1);
  }
  let best = "general";
  let bestN = -1;
  for (const [seg, n] of counts) if (n > bestN) ((bestN = n), (best = seg));
  return best;
}

async function main(): Promise<void> {
  const { repo, limit, store } = parseArgs(process.argv.slice(2));
  const cfg = loadConfig();
  const backend = (store ?? cfg.eventStore) as "sqlite" | "keewano";
  const sink = makeEventSink(backend);

  const commits = await readCommits(repo, limit);
  let emitted = 0;
  for (const c of commits) {
    const feature = featureOf(c.paths);
    const label: AttributionLabel = c.agent ? "agent" : "human";
    const events: SitdownEvent[] = [
      { name: "FeatureTouched", value: feature }, // precede the events it applies to
      { name: "CommitMade", value: c.linesAdded },
      { name: "AuthorType", value: label },
    ];
    for (const event of events) {
      await sink.emit(c.author, event, c.ts);
      emitted++;
    }
  }
  await sink.flush?.();
  console.log(
    `[backfill] replayed ${commits.length} commit(s) from ${repo} as ${emitted} event(s) -> ${backend}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
