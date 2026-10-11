// Personal vault notes — one vault per person (`<vaults_root>/<author>`), SitDOWN-owned and
// kept apart from the human's real Obsidian space. A personal vault holds ONLY that person's own
// activity, so nobody else's work ever appears in it:
//   - me.md               their private person note (contributions + decisions)
//   - daily/<date>.md     their own daily log
// Features and decisions themselves live in the CENTRAL vault (single source of truth); personal
// notes reference them with `obsidian://` links, which resolve across separate Obsidian vaults
// (plain [[wikilinks]] do not).
import type { Decision, Digest } from "@sitdown/contracts";
import type { FrontMatter } from "../frontmatter.js";
import { chronological } from "../reads.js";
import { decisionsWithDate, latestDate } from "./common.js";
import type { RenderedNote } from "./decision.js";

/** A cross-vault link into the central vault that Obsidian can actually follow. */
function centralRef(centralName: string, relNoExt: string, label: string): string {
  const vault = encodeURIComponent(centralName);
  const file = encodeURIComponent(relNoExt);
  return `[${label}](obsidian://open?vault=${vault}&file=${file})`;
}
const featureRef = (c: string, feature: string): string => centralRef(c, `features/${feature}`, feature);
const decisionRef = (c: string, date: string, dec: Decision): string =>
  centralRef(c, `decisions/${date}-${dec.slug}`, dec.title);

/** me.md — the person's private note in their own vault. */
export function renderMe(author: string, digests: Digest[], centralName: string): RenderedNote {
  const ordered = chronological(digests);
  const contributions = ordered.map(
    (d) => `- ${featureRef(centralName, d.feature)} — ${d.headline} (${d.source})`,
  );
  const decisions = decisionsWithDate(ordered).map(
    ({ date, decision }) => `- ${decisionRef(centralName, date, decision)}`,
  );
  const autoBody = ["## Contributions", ...contributions, "", "## Decisions", ...decisions].join("\n");

  const fm: FrontMatter = new Map();
  fm.set("type", "person");
  fm.set("author", author);
  fm.set("private", true); // personal vault is private by default
  fm.set("updated", latestDate(digests));

  return { relPath: "me.md", spec: { frontMatter: fm, title: author, autoBody } };
}

/** daily/<date>.md in a person's own vault — only that person's activity that day. */
export function renderPersonalDaily(
  date: string,
  author: string,
  digests: Digest[],
  centralName: string,
): RenderedNote {
  const bullets = chronological(digests).map((d) => {
    const parts = [featureRef(centralName, d.feature)];
    for (const dec of d.decisions ?? []) parts.push(`decision ${decisionRef(centralName, d.date, dec)}`);
    parts.push(`source ${d.source}`);
    return `- ${d.headline} — ${parts.join(" · ")}`;
  });

  const fm: FrontMatter = new Map();
  fm.set("type", "daily");
  fm.set("date", date);
  fm.set("author", author);
  fm.set("private", true);
  fm.set("updated", date);

  return { relPath: `daily/${date}.md`, spec: { frontMatter: fm, title: date, autoBody: bullets.join("\n") } };
}
