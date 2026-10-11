// @sitdown/voice — E. Text-only standup fallback for when voice calls fail (`voice standup --sms`).
// Asks each person by text, answers from the MCP docs, and posts a team summary. No new data.
import type { Dialer } from "./dial.js";
import type { McpClient, PersonSummary } from "./mcp.js";

export interface StandupReport {
  perPerson: Array<{ slug: string; to: string; body: string }>;
  summary: string;
  summarySentTo: string[];
}

/** Compose the "here's your brief, anything blocking?" SMS for one person. */
export function composePersonalStandup(summary: PersonSummary): string {
  const lines = [`SitDOWN standup — ${summary.author}:`];
  if (summary.headline) lines.push(summary.headline);
  const top = summary.decisions[0];
  if (top) lines.push(`Key decision: ${top.title}.`);
  lines.push("Reply with anything you're blocked on or want looked up.");
  return lines.join("\n");
}

/** Compose the team summary posted to everyone. */
export function composeTeamSummary(summaries: PersonSummary[]): string {
  const lines = ["SitDOWN standup summary:"];
  for (const s of summaries) {
    lines.push(`• ${s.author}: ${s.headline ?? firstItem(s)}`);
  }
  if (summaries.length === 0) lines.push("(no activity found in the docs)");
  return lines.join("\n");
}

function firstItem(s: PersonSummary): string {
  return s.items[0]?.text ?? "no recorded updates";
}

export async function runStandupSms(
  attendees: Array<{ slug: string; phone: string }>,
  mcp: McpClient,
  dialer: Dialer,
  opts: { fromNumberId: string },
): Promise<StandupReport> {
  // Pull each attendee's summary from the docs.
  const summaries: PersonSummary[] = [];
  for (const { slug } of attendees) {
    try {
      const got = await mcp.get_summary({ author: slug });
      const mine = got.filter((s) => s.author === slug);
      summaries.push(...(mine.length ? mine : got));
    } catch {
      // skip
    }
  }

  // Text each person their personal standup brief.
  const perPerson: StandupReport["perPerson"] = [];
  for (const { slug, phone } of attendees) {
    const summary = summaries.find((s) => s.author === slug);
    if (!summary) continue;
    const body = composePersonalStandup(summary);
    try {
      await dialer.sendMessage({ to: phone, fromNumberId: opts.fromNumberId, body });
      perPerson.push({ slug, to: phone, body });
    } catch {
      // continue
    }
  }

  // Post the team summary to everyone.
  const summary = composeTeamSummary(summaries);
  const summarySentTo: string[] = [];
  for (const { phone } of attendees) {
    try {
      await dialer.sendMessage({ to: phone, fromNumberId: opts.fromNumberId, body: summary });
      summarySentTo.push(phone);
    } catch {
      // continue
    }
  }

  return { perPerson, summary, summarySentTo };
}
