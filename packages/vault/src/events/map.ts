// Map a Digest to its ordered typed events. FeatureTouched always precedes the event it
// applies to. Categories and numbers only — never raw text in a value.
//
// Timestamp caveat: a Digest carries only `date` (no wall-clock time; those live in A's
// SessionRecords). We derive ts from `date` with small per-event increments so ordering is
// deterministic and FeatureTouched sorts strictly before its event. See README.
import type { AgentKind, AttributionLabel, Digest, SitdownEvent } from "@sitdown/contracts";
import { parseSource } from "../reads.js";

export interface TimedEvent {
  author: string;
  event: SitdownEvent;
  ts: string;
}

const AGENT_KINDS: Record<string, AgentKind> = {
  claude: "claude_code",
  claude_code: "claude_code",
  codex: "codex",
  cursor: "cursor",
  windsurf: "windsurf",
  zed: "zed",
};

function agentKind(token: string | undefined): AgentKind {
  if (!token) return "other";
  return AGENT_KINDS[token] ?? "other";
}

/** Lines in an inclusive [start, end] range. */
const rangeLen = ([a, b]: [number, number]): number => Math.max(0, b - a + 1);

/** Total added lines across a digest's attribution. */
function linesChanged(d: Digest): number {
  return (d.attribution ?? []).reduce((n, a) => n + rangeLen(a.lines), 0);
}

/** The attribution label covering the most lines (the commit's dominant author type). */
function dominantLabel(d: Digest): AttributionLabel | undefined {
  const totals = new Map<AttributionLabel, number>();
  for (const a of d.attribution ?? []) {
    totals.set(a.label, (totals.get(a.label) ?? 0) + rangeLen(a.lines));
  }
  let best: AttributionLabel | undefined;
  let bestN = -1;
  for (const [label, n] of totals) if (n > bestN) ((bestN = n), (best = label));
  return best;
}

/** Build the ordered SitdownEvent list for a digest (without timestamps). */
function eventsFor(d: Digest): SitdownEvent[] {
  const src = parseSource(d.source);
  const out: SitdownEvent[] = [{ name: "FeatureTouched", value: d.feature }];

  if (src.kind === "session") {
    for (let i = 0; i < (d.human_interventions ?? 0); i++) out.push({ name: "HumanIntervened" });
    out.push({ name: "AgentSession", value: agentKind(src.agent) });
    for (const dec of d.decisions ?? []) out.push({ name: "DecisionRecorded", value: dec.slug });
  } else {
    out.push({ name: "CommitMade", value: linesChanged(d) });
    const label = dominantLabel(d);
    if (label) out.push({ name: "AuthorType", value: label });
  }
  return out;
}

/** Derive a sortable ISO timestamp from a date, offset by sequence to preserve order. */
function tsFor(date: string, seq: number): string {
  const base = Date.parse(`${date}T12:00:00Z`);
  return new Date(base + seq * 1000).toISOString().replace(".000Z", "Z");
}

/** Ordered, timestamped events for one digest. */
export function eventsForDigest(d: Digest): TimedEvent[] {
  return eventsFor(d).map((event, i) => ({ author: d.author, event, ts: tsFor(d.date, i) }));
}
