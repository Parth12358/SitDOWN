// Person note: people/<author>.md — contributions + decisions. private by default.
import type { Digest } from "@sitdown/contracts";
import type { FrontMatter } from "../frontmatter.js";
import type { NoteSpec } from "../markers.js";
import { chronological } from "../reads.js";
import { decisionStem, decisionsWithDate, latestDate, wikilink } from "./common.js";
import type { RenderedNote } from "./decision.js";

export function renderPerson(author: string, digests: Digest[]): RenderedNote {
  const ordered = chronological(digests);

  const contributions = ordered.map(
    (d) => `- ${wikilink(d.feature)} — ${d.headline} (${d.source})`,
  );
  const decisions = decisionsWithDate(ordered).map(
    ({ date, decision }) => `- ${wikilink(decisionStem(date, decision.slug))} — ${decision.title}`,
  );

  const autoBody = [
    "## Contributions",
    ...contributions,
    "",
    "## Decisions",
    ...decisions,
  ].join("\n");

  const fm: FrontMatter = new Map();
  fm.set("type", "person");
  fm.set("author", author);
  fm.set("private", true); // R7: private by default
  fm.set("updated", latestDate(digests));

  return {
    relPath: `people/${author}.md`,
    spec: { frontMatter: fm, title: author, autoBody },
  };
}
