// Parse a Codex transcript into the same structural shape as the Claude parser.
//
// Codex's real on-disk format is not vendor-verified (see @alikeai/setup parser-codex.mjs, MIT),
// so this is a deliberately tolerant line-JSON parser. It handles the contracts/fixtures shape
// (`message.content` blocks with a `apply_patch` tool_use) and probes the documented real fields
// (`payload.git.branch`, nested `cwd`/`timestamp`). File edits come from the apply_patch body.
import { newerTimestamp } from "../util.mjs";

/** Read a string field off a record or its `.payload` (one level deep). */
function pick(rec, key) {
  if (rec && typeof rec[key] === "string") return rec[key];
  const p = rec?.payload;
  if (p && typeof p === "object" && typeof p[key] === "string") return p[key];
  return null;
}

function pickGitBranch(rec) {
  const git = rec?.payload?.git ?? rec?.git;
  if (git && typeof git === "object" && typeof git.branch === "string" && git.branch) return git.branch;
  return null;
}

/**
 * Parse an apply_patch body into per-file added-line counts.
 * Envelope (codex apply_patch):
 *   *** Update File: path/to/file     (or `*** Add File:` / `*** Delete File:`)
 *   @@ ...
 *   + added line
 *   - removed line
 * @returns {Array<{ tool: 'apply_patch', file: string, addedLineCount: number }>}
 */
export function parseApplyPatch(patch) {
  const ops = [];
  if (typeof patch !== "string") return ops;
  let current = null;
  for (const line of patch.split("\n")) {
    const m = line.match(/^\*\*\*\s+(?:Update|Add|Move|Delete)\s+File:\s+(.+?)\s*$/);
    if (m) {
      current = { tool: "apply_patch", file: m[1].trim(), addedLineCount: 0 };
      ops.push(current);
      continue;
    }
    if (!current) continue;
    // Added lines start with '+' but not the '+++' file marker.
    if (line.startsWith("+") && !line.startsWith("+++")) current.addedLineCount += 1;
  }
  return ops.filter((o) => o.file);
}

function promptText(line) {
  if (line.isMeta === true) return null;
  const content = line.message?.content ?? line.content;
  if (typeof content === "string") {
    const t = content.trim();
    return t.length ? t : null;
  }
  if (Array.isArray(content)) {
    const parts = content
      .filter((b) => b && b.type === "text" && typeof b.text === "string")
      .map((b) => b.text);
    const t = parts.join("\n").trim();
    return t.length ? t : null;
  }
  return null;
}

export function parseCodexTranscript(text, fallbackKey = "unknown") {
  let sessionKey = null;
  let startedAt = null;
  let endedAt = null;
  let cwd = null;
  let branch = null;
  const prompts = [];
  const editOps = [];

  for (const raw of text.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    let rec;
    try {
      rec = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (typeof rec !== "object" || rec === null) continue;

    if (sessionKey === null) sessionKey = pick(rec, "id") ?? pick(rec, "session_id") ?? pick(rec, "sessionId");
    const ts = pick(rec, "timestamp");
    if (ts) {
      if (startedAt === null) startedAt = ts;
      endedAt = newerTimestamp(endedAt, ts);
    }
    if (cwd === null) cwd = pick(rec, "cwd");
    if (branch === null) branch = pickGitBranch(rec);

    const role = rec.message?.role ?? rec.role ?? rec.type;
    if (rec.type === "user" || role === "user") {
      const p = promptText(rec);
      if (p) prompts.push(p);
    }

    // apply_patch may appear as a tool_use block (fixture shape) or a top-level call (real shape).
    const content = rec.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === "tool_use" && block.name === "apply_patch") {
          editOps.push(...parseApplyPatch(block.input?.patch));
        }
      }
    }
    if (rec.type === "apply_patch" || rec.name === "apply_patch") {
      editOps.push(...parseApplyPatch(rec.input?.patch ?? rec.patch ?? rec.payload?.patch));
    }
  }

  return {
    agent: "codex",
    sessionKey: sessionKey ?? fallbackKey,
    prompts,
    editOps,
    started_at: startedAt,
    ended_at: endedAt,
    cwd,
    branch,
  };
}
