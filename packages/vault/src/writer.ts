// Orchestrates note writing. Aggregate notes (feature/daily/person) are regenerated from
// the full digest set so re-runs never duplicate entries. Every write goes through the
// marker engine (human text outside the markers is preserved) and is atomic.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Decision, Digest } from "@sitdown/contracts";
import { atomicWrite } from "./atomic.js";
import { loadConfig } from "./config.js";
import { composeNote } from "./markers.js";
import { renderDaily } from "./notes/daily.js";
import { renderDecision } from "./notes/decision.js";
import type { RenderedNote } from "./notes/decision.js";
import { renderFeature } from "./notes/feature.js";
import { renderPersonIndex } from "./notes/person.js";
import { renderMe, renderPersonalDaily } from "./notes/personal.js";
import { chronological, loadDigests } from "./reads.js";

/** Write one rendered note through the marker engine. Returns its absolute path. */
async function writeNote(vaultPath: string, rendered: RenderedNote): Promise<string> {
  const abs = path.join(vaultPath, rendered.relPath);
  let existing: string | null = null;
  try {
    existing = await readFile(abs, "utf8");
  } catch {
    existing = null;
  }
  await atomicWrite(abs, composeNote(existing, rendered.spec));
  return abs;
}

/** Sources (chronological) of all digests that declare a decision slug. */
function sourcesForSlug(allDigests: Digest[], slug: string): string[] {
  const declaring = allDigests.filter((d) => (d.decisions ?? []).some((x) => x.slug === slug));
  return chronological(declaring).map((d) => d.source);
}

export interface AffectedKeys {
  features: Set<string>;
  dates: Set<string>;
  authors: Set<string>;
  /** slug -> a representative digest that declares it (for author/date/feature context). */
  decisions: Map<string, Digest>;
}

/** Collect the note-keys touched by a set of (changed) digests. */
export function collectAffected(changed: Digest[]): AffectedKeys {
  const a: AffectedKeys = {
    features: new Set(),
    dates: new Set(),
    authors: new Set(),
    decisions: new Map(),
  };
  for (const d of changed) {
    a.features.add(d.feature);
    a.dates.add(d.date);
    a.authors.add(d.author);
    for (const dec of d.decisions ?? []) if (!a.decisions.has(dec.slug)) a.decisions.set(dec.slug, d);
  }
  return a;
}

/** Where a batch writes: the shared central vault, and a resolver for each person's own vault. */
export interface WriteTargets {
  /** Central (team) vault: features, decisions, team daily, shareable people index. */
  central: string;
  /** Resolve a person's own vault (their daily + private me.md). */
  personVaultFor: (author: string) => string;
  /** Obsidian vault name for central, used in cross-vault links. Defaults to basename(central). */
  centralName?: string;
}

/**
 * Regenerate exactly the affected notes from the full digest set (selective update), splitting
 * writes between the central vault (shared) and each person's own vault (private). Returns every
 * written path.
 */
export async function writeBatch(
  allDigests: Digest[],
  affected: AffectedKeys,
  targets: WriteTargets,
): Promise<string[]> {
  const written: string[] = [];
  const central = targets.central;
  const centralName = targets.centralName ?? path.basename(central);

  // --- Central vault: shared, single source of truth ---
  for (const feature of affected.features) {
    const subset = allDigests.filter((d) => d.feature === feature);
    if (subset.length) written.push(await writeNote(central, renderFeature(feature, subset)));
  }
  for (const date of affected.dates) {
    const subset = allDigests.filter((d) => d.date === date);
    if (subset.length) written.push(await writeNote(central, renderDaily(date, subset)));
  }
  for (const author of affected.authors) {
    const subset = allDigests.filter((d) => d.author === author);
    if (subset.length) written.push(await writeNote(central, renderPersonIndex(author, subset)));
  }
  for (const [slug, rep] of affected.decisions) {
    const dec = (rep.decisions ?? []).find((x) => x.slug === slug)!;
    const rendered = renderDecision(dec, {
      author: rep.author,
      date: rep.date,
      feature: rep.feature,
      sources: sourcesForSlug(allDigests, slug),
    });
    written.push(await writeNote(central, rendered));
  }

  // --- Personal vaults: each person's own log + private me.md (their activity only) ---
  for (const author of affected.authors) {
    const mine = allDigests.filter((d) => d.author === author);
    if (!mine.length) continue;
    const pv = targets.personVaultFor(author);
    written.push(await writeNote(pv, renderMe(author, mine, centralName)));
    for (const date of affected.dates) {
      const forDay = mine.filter((d) => d.date === date);
      if (forDay.length) written.push(await writeNote(pv, renderPersonalDaily(date, author, forDay, centralName)));
    }
  }

  return written;
}

/**
 * Write/refresh all notes implied by one Digest. Aggregates are rebuilt from every Digest
 * in the configured processed dir (so history stays complete and de-duplicated).
 * Exported for D and for direct/single use.
 */
export async function writeDigest(digest: Digest, targets?: WriteTargets): Promise<string[]> {
  const cfg = loadConfig();
  const t: WriteTargets = targets ?? {
    central: cfg.centralVault,
    personVaultFor: cfg.personVault,
    centralName: cfg.centralName,
  };
  const all = await loadDigests(cfg.processedDir);
  if (!all.some((d) => d.source === digest.source)) all.push(digest);
  return writeBatch(all, collectAffected([digest]), t);
}

/** Write a single decision note. Used directly by D's record_decision. Returns its path. */
export async function writeDecision(
  decision: Decision,
  opts: { author: string; date: string; feature: string; sources?: string[]; vaultPath: string },
): Promise<string> {
  const rendered = renderDecision(decision, {
    author: opts.author,
    date: opts.date,
    feature: opts.feature,
    sources: opts.sources ?? [],
  });
  return writeNote(opts.vaultPath, rendered);
}
