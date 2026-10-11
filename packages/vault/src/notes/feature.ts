// Feature note: features/<feature>.md — history newest first, each entry cites its source.
import type { Digest } from "@sitdown/contracts";
import type { FrontMatter } from "../frontmatter.js";
import type { NoteSpec } from "../markers.js";
import { reverseChronological } from "../reads.js";
import { asSentence, decisionLinks, latestDate, wikilink } from "./common.js";
import type { RenderedNote } from "./decision.js";

function entry(d: Digest): string {
  const paren = [wikilink(d.author), ...decisionLinks(d), `source ${d.source}`];
  return `- **${d.date}** — ${asSentence(d.headline)} (${paren.join(", ")})`;
}

export function renderFeature(feature: string, digests: Digest[]): RenderedNote {
  const ordered = reverseChronological(digests);
  const fm: FrontMatter = new Map();
  fm.set("type", "feature");
  fm.set("feature", feature); // bare (no wikilink) per fixture
  fm.set("updated", latestDate(digests));

  const autoBody = ["History (newest first):", "", ...ordered.map(entry)].join("\n");
  return {
    relPath: `features/${feature}.md`,
    spec: { frontMatter: fm, title: feature, autoBody },
  };
}
