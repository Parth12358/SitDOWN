// Attribution — recorded from the capture records, never guessed from code style (PRD-B).
//
// Session:  each edited range is `agent` (the agent wrote those lines in the session).
// Commit:   compare the commit's added lines against earlier agent sessions on the same
//           branch + file:
//             - lines overlapping a session edit -> `agent_edited` (a human commit touched agent code)
//             - remaining added lines            -> `human`
//           If the commit matched NO session on any file but carries an agent `Co-authored-by:`
//           trailer -> the whole commit is `agent`.
import type {
  SessionRecord,
  CommitRecord,
  Attribution,
  LineRange,
} from "@sitdown/contracts";

type Range = [number, number]; // inclusive [start, end]

const AGENT_COAUTHOR = /claude|gpt|codex|copilot|cursor|gemini|\bbot\b|\[bot\]|agent/i;

/** Merge overlapping/adjacent ranges into a sorted mask. */
function mergeMask(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: Range[] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1] + 1) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** Sub-ranges of `r` that fall inside the mask. */
function intersectOne([s, e]: Range, mask: Range[]): Range[] {
  const out: Range[] = [];
  for (const [ms, me] of mask) {
    const lo = Math.max(s, ms);
    const hi = Math.min(e, me);
    if (lo <= hi) out.push([lo, hi]);
  }
  return out;
}

/** Sub-ranges of `r` NOT covered by the (sorted, merged) mask. */
function subtractOne([s, e]: Range, mask: Range[]): Range[] {
  const out: Range[] = [];
  let cur = s;
  for (const [ms, me] of mask) {
    if (me < cur) continue;
    if (ms > e) break;
    if (ms > cur) out.push([cur, Math.min(ms - 1, e)]);
    cur = Math.max(cur, me + 1);
    if (cur > e) break;
  }
  if (cur <= e) out.push([cur, e]);
  return out;
}

function hasAgentCoauthor(commit: CommitRecord): boolean {
  return (commit.co_authors ?? []).some((name) => AGENT_COAUTHOR.test(name));
}

/** Attribution for a session: every edited range is agent-written. */
export function attributeSession(session: SessionRecord): Attribution[] {
  const out: Attribution[] = [];
  for (const edit of session.edits) {
    for (const range of edit.added_lines) {
      out.push({ file: edit.file, lines: [range[0], range[1]] as LineRange, label: "agent" });
    }
  }
  return out;
}

/**
 * Attribution for a commit, cross-referenced against earlier sessions.
 * `sessions` should be all known SessionRecords (the attributor filters to the commit's branch).
 */
export function attributeCommit(
  commit: CommitRecord,
  sessions: SessionRecord[],
): Attribution[] {
  // Build a per-file mask of agent-written ranges from same-branch sessions.
  const agentByFile = new Map<string, Range[]>();
  for (const s of sessions) {
    if (s.branch !== commit.branch) continue;
    for (const edit of s.edits) {
      const list = agentByFile.get(edit.file) ?? [];
      for (const r of edit.added_lines) list.push([r[0], r[1]]);
      agentByFile.set(edit.file, list);
    }
  }
  const matchedAny = commit.files.some((f) => (agentByFile.get(f.file) ?? []).length > 0);
  const wholeCommitAgent = !matchedAny && hasAgentCoauthor(commit);

  const out: Attribution[] = [];
  for (const file of commit.files) {
    const mask = mergeMask(agentByFile.get(file.file) ?? []);
    const entries: Attribution[] = [];
    for (const r of file.added_lines) {
      const range: Range = [r[0], r[1]];
      if (mask.length > 0) {
        for (const part of intersectOne(range, mask))
          entries.push({ file: file.file, lines: part as LineRange, label: "agent_edited" });
        for (const part of subtractOne(range, mask))
          entries.push({ file: file.file, lines: part as LineRange, label: "human" });
      } else {
        entries.push({
          file: file.file,
          lines: range as LineRange,
          label: wholeCommitAgent ? "agent" : "human",
        });
      }
    }
    // Stable, human-readable order: ascending by start line within the file.
    entries.sort((a, b) => a.lines[0] - b.lines[0]);
    out.push(...entries);
  }
  return out;
}
