// Shared formatting helpers for note rendering. Keep output aligned with
// contracts/fixtures/vault/* (structure, frontmatter, wikilinks, citations).
import type { Decision, Digest } from "@sitdown/contracts";

/** `[[payments]]` */
export const wikilink = (target: string): string => `[[${target}]]`;

/** Filename stem / wikilink target for a decision: `<date>-<slug>`. */
export const decisionStem = (date: string, slug: string): string => `${date}-${slug}`;

/** Ensure a headline reads as a sentence (single trailing period), e.g. feature history. */
export function asSentence(text: string): string {
  const t = text.trimEnd();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** Decision wikilinks for a digest's decisions: `decision [[<date>-<slug>]]`, in order. */
export function decisionLinks(d: Digest): string[] {
  return (d.decisions ?? []).map((dec) => `decision ${wikilink(decisionStem(d.date, dec.slug))}`);
}

/** Latest date across a set of digests (frontmatter `updated`). */
export function latestDate(digests: Digest[]): string {
  return digests.reduce((max, d) => (d.date > max ? d.date : max), digests[0]?.date ?? "");
}

/** All decisions authored across a set of digests, paired with their digest date. */
export function decisionsWithDate(digests: Digest[]): Array<{ date: string; decision: Decision }> {
  const out: Array<{ date: string; decision: Decision }> = [];
  for (const d of digests) {
    for (const dec of d.decisions ?? []) out.push({ date: d.date, decision: dec });
  }
  return out;
}
