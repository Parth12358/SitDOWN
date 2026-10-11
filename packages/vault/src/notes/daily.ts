// Daily note: daily/<date>.md — one section per person, headlines + links.
import type { Digest } from "@sitdown/contracts";
import type { FrontMatter } from "../frontmatter.js";
import type { NoteSpec } from "../markers.js";
import { chronological, compareDigests, groupBy } from "../reads.js";
import { decisionLinks, wikilink } from "./common.js";
import type { RenderedNote } from "./decision.js";

function bullet(d: Digest): string {
  const parts = [wikilink(d.feature), ...decisionLinks(d), `source ${d.source}`];
  return `- ${d.headline} — ${parts.join(" · ")}`;
}

export function renderDaily(date: string, digests: Digest[]): RenderedNote {
  const byAuthor = groupBy(digests, (d) => d.author);
  // Authors ordered by their earliest activity that day, then by name (deterministic).
  const authors = [...byAuthor.keys()].sort((a, b) => {
    const da = chronological(byAuthor.get(a)!)[0];
    const db = chronological(byAuthor.get(b)!)[0];
    const c = compareDigests(da, db);
    return c !== 0 ? c : a < b ? -1 : 1;
  });

  const sections = authors.map((author) => {
    const bullets = chronological(byAuthor.get(author)!).map(bullet);
    return [`## ${wikilink(author)}`, ...bullets].join("\n");
  });

  const fm: FrontMatter = new Map();
  fm.set("type", "daily");
  fm.set("date", date);
  fm.set("updated", date);

  return {
    relPath: `daily/${date}.md`,
    spec: { frontMatter: fm, title: date, autoBody: sections.join("\n\n") },
  };
}
