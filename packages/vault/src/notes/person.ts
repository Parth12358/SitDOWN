// Central people index: central/people/<author>.md — a SHAREABLE summary of a person's
// contributions + decisions. The private, full version lives in that person's own vault as
// me.md (see notes/personal.ts). Links resolve within the central vault.
import type { Digest } from "@sitdown/contracts";
import type { FrontMatter } from "../frontmatter.js";
import type { NoteSpec } from "../markers.js";
import { chronological } from "../reads.js";
import { decisionStem, decisionsWithDate, latestDate, wikilink } from "./common.js";
import type { RenderedNote } from "./decision.js";

export function renderPersonIndex(author: string, digests: Digest[]): RenderedNote {
  const ordered = chronological(digests);

  const contributions = ordered.map(
    (d) => `- ${wikilink(d.feature)} — ${d.headline} (${d.source})`,
  );
  const decisions = decisionsWithDate(ordered).map(
    ({ date, decision }) => `- ${wikilink(decisionStem(date, decision.slug))} — ${decision.title}`,
  );

  const autoBody = ["## Contributions", ...contributions, "", "## Decisions", ...decisions].join("\n");

  const fm: FrontMatter = new Map();
  fm.set("type", "person");
  fm.set("author", author);
  fm.set("private", false); // central index is the shareable view; the private copy is me.md
  fm.set("updated", latestDate(digests));

  return {
    relPath: `people/${author}.md`,
    spec: { frontMatter: fm, title: author, autoBody },
  };
}
