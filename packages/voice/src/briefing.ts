// @sitdown/voice — E. Briefing builder: call get_summary per attendee and compose the Dial
// system prompt. Most recent and most decision-heavy items first, capped to Dial's prompt size.
import type { McpClient, PersonSummary, DecisionItem } from "./mcp.js";
import { behaviorBlock, type BehaviorOptions } from "./prompt.js";

export interface BriefingOptions extends BehaviorOptions {
  /** Hard cap on the composed prompt, in characters. Default 6000. */
  maxChars?: number;
  from?: string;
  to?: string;
}

const DEFAULT_MAX_CHARS = 6000;

/**
 * Build the full voice-agent system prompt for a meeting with `attendees`.
 * Behavior rules first, then one section per attendee (decisions before plain updates),
 * people ordered by how decision-heavy and how recent their work is.
 */
export async function buildBriefing(
  attendees: string[],
  mcp: McpClient,
  opts: BriefingOptions = {},
): Promise<string> {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;

  // Fetch each attendee's summary (tolerate per-person failures — a missing person is fine).
  const summaries: PersonSummary[] = [];
  for (const author of attendees) {
    try {
      const got = await mcp.get_summary({ author, from: opts.from, to: opts.to });
      // get_summary may return just this author, or everyone — keep what matches, else all.
      const mine = got.filter((s) => s.author === author);
      summaries.push(...(mine.length ? mine : got));
    } catch {
      // skip this attendee; the briefing still composes from the rest
    }
  }

  const ordered = rankSummaries(dedupeByAuthor(summaries));
  const header = behaviorBlock(opts);
  const roster =
    attendees.length > 0
      ? `Attendees today: ${attendees.join(", ")}.`
      : "Attendees: (not specified).";

  const sections = ordered.map(renderPerson);
  const body = ["# Meeting briefing", roster, "", ...sections].join("\n");

  return capPrompt(`${header}\n\n${body}`.trim(), maxChars);
}

/** People ranked by decision count (desc) then most recent activity (desc). */
export function rankSummaries(summaries: PersonSummary[]): PersonSummary[] {
  return [...summaries].sort((a, b) => {
    const dc = b.decisions.length - a.decisions.length;
    if (dc !== 0) return dc;
    return latestDate(b).localeCompare(latestDate(a));
  });
}

function dedupeByAuthor(summaries: PersonSummary[]): PersonSummary[] {
  const byAuthor = new Map<string, PersonSummary>();
  for (const s of summaries) {
    const existing = byAuthor.get(s.author);
    if (!existing) byAuthor.set(s.author, s);
    else {
      existing.items.push(...s.items);
      existing.decisions.push(...s.decisions);
    }
  }
  return [...byAuthor.values()];
}

function latestDate(s: PersonSummary): string {
  const dates = [s.date, ...s.items.map((i) => i.date)].filter(Boolean) as string[];
  return dates.sort().at(-1) ?? "";
}

function renderPerson(s: PersonSummary): string {
  const lines: string[] = [];
  lines.push(`## ${s.author}${s.headline ? ` — ${s.headline}` : ""}`);

  if (s.decisions.length) {
    lines.push("Decisions (why things are the way they are):");
    for (const d of s.decisions) lines.push(`- ${renderDecision(d)}`);
  }

  // Plain updates, newest first, excluding ones already covered by a decision line.
  const covered = new Set(s.decisions.map((d) => d.slug).filter(Boolean) as string[]);
  const updates = [...s.items]
    .filter((i) => !i.decision || !covered.has(i.decision))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  if (updates.length) {
    lines.push("Recent work:");
    for (const i of updates) {
      const tags = [i.feature, i.source].filter(Boolean).join(", ");
      lines.push(`- ${i.text}${tags ? ` (${tags})` : ""}`);
    }
  }
  return lines.join("\n");
}

function renderDecision(d: DecisionItem): string {
  const parts = [d.title];
  if (d.chosen) parts.push(`Chose: ${d.chosen}`);
  if (d.rejected?.length) parts.push(`Rejected: ${d.rejected.join("; ")}`);
  if (d.reason) parts.push(`Why: ${d.reason}`);
  const tail = [d.feature, d.source].filter(Boolean).join(", ");
  return parts.join(" ") + (tail ? ` (${tail})` : "");
}

/** Trim the prompt to a character budget on a line boundary, leaving a visible marker. */
export function capPrompt(prompt: string, maxChars: number): string {
  if (prompt.length <= maxChars) return prompt;
  const marker = "\n\n[briefing truncated to fit the call's prompt limit]";
  const slice = prompt.slice(0, Math.max(0, maxChars - marker.length));
  const lastNl = slice.lastIndexOf("\n");
  return (lastNl > maxChars * 0.5 ? slice.slice(0, lastNl) : slice) + marker;
}
