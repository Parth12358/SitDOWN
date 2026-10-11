// Load Digests from the processed/ dir and group them for aggregate note regeneration.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Digest } from "@sitdown/contracts";

export type SourceKind = "session" | "commit";

export interface ParsedSource {
  kind: SourceKind;
  /** Agent token for sessions ("claude", "codex", ...); undefined for commits. */
  agent?: string;
  /** The identifier: session id or commit sha. */
  id: string;
  /** Everything after the kind prefix, used as a stable tiebreak. */
  rest: string;
}

/** Parse "session:claude:abc123" or "commit:9f2e1d". */
export function parseSource(source: string): ParsedSource {
  const parts = source.split(":");
  const kind = (parts[0] as SourceKind) ?? "session";
  const rest = parts.slice(1).join(":");
  if (kind === "session") {
    return { kind, agent: parts[1], id: parts[2] ?? parts[1] ?? "", rest };
  }
  return { kind, id: parts[1] ?? "", rest };
}

const kindRank: Record<SourceKind, number> = { session: 0, commit: 1 };

/**
 * Deterministic chronological order from the Digest alone (which carries only a date):
 *   date asc, then sessions before commits within a day, then id asc.
 * This reproduces the fixture ordering (a commit finalizes the session's work, so it
 * sorts after the session of the same day). Exact wall-clock times are not in the Digest
 * — see the timestamp caveat in the README.
 */
export function compareDigests(a: Digest, b: Digest): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const pa = parseSource(a.source);
  const pb = parseSource(b.source);
  if (kindRank[pa.kind] !== kindRank[pb.kind]) return kindRank[pa.kind] - kindRank[pb.kind];
  return pa.rest < pb.rest ? -1 : pa.rest > pb.rest ? 1 : 0;
}

/** Oldest first (daily, person contributions). */
export function chronological(digests: Digest[]): Digest[] {
  return [...digests].sort(compareDigests);
}

/** Newest first (feature history). */
export function reverseChronological(digests: Digest[]): Digest[] {
  return [...digests].sort((a, b) => compareDigests(b, a));
}

/** Read every Digest JSON in a processed dir. Missing dir -> []. */
export async function loadDigests(processedDir: string): Promise<Digest[]> {
  let names: string[];
  try {
    names = await readdir(processedDir);
  } catch {
    return [];
  }
  const out: Digest[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".json")) continue;
    try {
      const text = await readFile(path.join(processedDir, name), "utf8");
      out.push(JSON.parse(text) as Digest);
    } catch {
      // skip unreadable/invalid files; never block the batch
    }
  }
  return out;
}

/** Group digests by a key selector. */
export function groupBy<K extends string>(
  digests: Digest[],
  key: (d: Digest) => K,
): Map<K, Digest[]> {
  const m = new Map<K, Digest[]>();
  for (const d of digests) {
    const k = key(d);
    const arr = m.get(k);
    if (arr) arr.push(d);
    else m.set(k, [d]);
  }
  return m;
}
