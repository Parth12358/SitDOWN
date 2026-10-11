// Inbox watcher (PRD-B). Polls ~/.sitdown/inbox/{sessions,commits} and writes one Digest per
// record to ~/.sitdown/processed/<source>.json, exactly once. Processed ids are tracked in
// ~/.sitdown/state/summarizer.json. All paths built with path.join + os.homedir() (cross-OS).
// Home can be overridden with SITDOWN_HOME (used by tests).
import { readdir, readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import type { SessionRecord, CommitRecord, Config } from "@sitdown/contracts";
import { summarize, type AnyRecord } from "./index.js";
import { makeLlm } from "./llm.js";

const POLL_MS = Number(process.env.SITDOWN_POLL_MS) || 3000;

export function sitdownHome(): string {
  return process.env.SITDOWN_HOME || path.join(os.homedir(), ".sitdown");
}

const paths = (home: string) => ({
  sessions: path.join(home, "inbox", "sessions"),
  commits: path.join(home, "inbox", "commits"),
  processed: path.join(home, "processed"),
  state: path.join(home, "state", "summarizer.json"),
  config: path.join(home, "config.json"),
});

/** Digest source id -> output filename (`session:claude:abc123` -> `session-claude-abc123.json`). */
export function sourceToFilename(source: string): string {
  return `${source.replace(/:/g, "-")}.json`;
}

async function readJsonFiles<T>(dir: string): Promise<T[]> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const out: T[] = [];
  for (const name of names.sort()) {
    try {
      out.push(JSON.parse(await readFile(path.join(dir, name), "utf8")) as T);
    } catch {
      // skip unreadable/malformed record
    }
  }
  return out;
}

async function loadState(statePath: string): Promise<Set<string>> {
  try {
    const data = JSON.parse(await readFile(statePath, "utf8")) as { processed?: string[] };
    return new Set(data.processed ?? []);
  } catch {
    return new Set();
  }
}

async function writeAtomic(target: string, contents: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  await writeFile(tmp, contents);
  await rename(tmp, target);
}

async function loadConfig(configPath: string): Promise<Config> {
  try {
    return JSON.parse(await readFile(configPath, "utf8")) as Config;
  } catch {
    return { vault_path: "~/vault", event_store: "sqlite", llm: "claude_cli" };
  }
}

function sourceOf(record: AnyRecord): string {
  return "sha" in record ? `commit:${record.sha}` : `session:${record.id}`;
}

/** Process any not-yet-seen inbox records once. Returns the source ids newly written. */
export async function processInbox(home = sitdownHome()): Promise<string[]> {
  const p = paths(home);
  const config = await loadConfig(p.config);
  const llm = makeLlm(config.llm === "ollama" || config.llm === "cloud" ? config.llm : "claude_cli");

  const sessions = await readJsonFiles<SessionRecord>(p.sessions);
  const commits = await readJsonFiles<CommitRecord>(p.commits);
  const state = await loadState(p.state);
  const written: string[] = [];

  for (const record of [...sessions, ...commits] as AnyRecord[]) {
    const source = sourceOf(record);
    if (state.has(source)) continue;
    try {
      const digest = await summarize(record, { sessions, llm });
      await writeAtomic(
        path.join(p.processed, sourceToFilename(source)),
        `${JSON.stringify(digest, null, 2)}\n`,
      );
      state.add(source);
      await writeAtomic(p.state, `${JSON.stringify({ processed: [...state] }, null, 2)}\n`);
      written.push(source);
      console.log(`[summarizer] wrote ${sourceToFilename(source)}`);
    } catch (err) {
      console.error(`[summarizer] failed ${source}:`, err instanceof Error ? err.message : err);
    }
  }
  return written;
}

async function main(): Promise<void> {
  const home = sitdownHome();
  console.log(`[summarizer] watching ${home} (poll ${POLL_MS}ms)`);
  // run immediately, then on an interval
  await processInbox(home).catch((e) => console.error("[summarizer]", e));
  setInterval(() => {
    processInbox(home).catch((e) => console.error("[summarizer]", e));
  }, POLL_MS);
}

function isMain(): boolean {
  const entry = process.argv[1];
  return !!entry && fileURLToPath(import.meta.url) === path.resolve(entry);
}

if (isMain()) {
  void main();
}
