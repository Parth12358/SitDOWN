// Selective-regeneration bookkeeping: remember a content hash per Digest source so a
// re-run only rebuilds notes (and re-emits events) for Digests that are new or changed.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Digest } from "@sitdown/contracts";
import { atomicWrite } from "./atomic.js";

interface StateFile {
  /** source id -> content hash of the last-processed Digest. */
  sources: Record<string, string>;
  /** source ids whose events have already been emitted (events are immutable facts; emit once). */
  emitted?: Record<string, true>;
}

const EMPTY: StateFile = { sources: {}, emitted: {} };

function stateFilePath(stateDir: string): string {
  return path.join(stateDir, "vault.json");
}

export function digestHash(d: Digest): string {
  return createHash("sha256").update(JSON.stringify(d)).digest("hex");
}

export async function loadState(stateDir: string): Promise<StateFile> {
  try {
    const s = JSON.parse(await readFile(stateFilePath(stateDir), "utf8")) as StateFile;
    return { sources: s.sources ?? {}, emitted: s.emitted ?? {} };
  } catch {
    return { sources: {}, emitted: {} };
  }
}

export async function saveState(stateDir: string, state: StateFile): Promise<void> {
  await atomicWrite(stateFilePath(stateDir), JSON.stringify(state, null, 2) + "\n");
}

/** Digests that are new or whose content changed since the last run. */
export function changedDigests(digests: Digest[], state: StateFile): Digest[] {
  return digests.filter((d) => state.sources[d.source] !== digestHash(d));
}

/** Digests whose events have never been emitted (so a re-summarized digest doesn't double-count). */
export function unemittedDigests(digests: Digest[], state: StateFile): Digest[] {
  const emitted = state.emitted ?? {};
  return digests.filter((d) => !emitted[d.source]);
}

/** Record the current hashes for a set of digests, and mark `emitted` sources as emitted. */
export function recordDigests(state: StateFile, digests: Digest[], emitted: Digest[] = []): StateFile {
  const sources = { ...state.sources };
  for (const d of digests) sources[d.source] = digestHash(d);
  const emittedMap = { ...(state.emitted ?? {}) };
  for (const d of emitted) emittedMap[d.source] = true;
  return { sources, emitted: emittedMap };
}
