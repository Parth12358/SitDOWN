// Decision note: decisions/<date>-<slug>.md
import type { Decision } from "@sitdown/contracts";
import type { FrontMatter } from "../frontmatter.js";
import type { NoteSpec } from "../markers.js";
import { decisionStem, wikilink } from "./common.js";

export interface DecisionContext {
  author: string;
  date: string;
  feature: string;
  /** Source ids (session:.../commit:...) in chronological order. */
  sources: string[];
}

export interface RenderedNote {
  relPath: string;
  spec: NoteSpec;
}

function body(dec: Decision): string {
  const parts = [`**Chose:** ${dec.chosen}`];
  if (dec.rejected && dec.rejected.length) {
    const rejected = dec.rejected.join("; ");
    parts.push(`**Rejected:** ${/[.!?]$/.test(rejected) ? rejected : rejected + "."}`);
  }
  parts.push(`**Reason:** ${dec.reason}`);
  return parts.join("\n\n");
}

export function renderDecision(dec: Decision, ctx: DecisionContext): RenderedNote {
  const stem = decisionStem(ctx.date, dec.slug);
  const fm: FrontMatter = new Map();
  fm.set("type", "decision");
  fm.set("feature", wikilink(ctx.feature)); // quoted on serialize: "[[feature]]"
  fm.set("author", ctx.author);
  fm.set("sources", ctx.sources);
  fm.set("updated", ctx.date);

  return {
    relPath: `decisions/${stem}.md`,
    spec: { frontMatter: fm, title: dec.title, autoBody: body(dec) },
  };
}
