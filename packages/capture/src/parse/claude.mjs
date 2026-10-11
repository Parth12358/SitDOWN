// Parse a Claude Code transcript (JSONL) into the structural shape a SessionRecord is built from.
// Handles BOTH the real ~/.claude/projects format and the simplified contracts/fixtures shape:
// every line is `{ type, timestamp, message: { role, content } }`; real lines additionally carry
// `cwd`, `gitBranch`, `sessionId`. `content` is either a string or an array of blocks.
//
// Structural fields only (timestamps, cwd, branch, file paths) — never inferred from prose.
import { newerTimestamp } from "../util.mjs";

const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);

// promptSource values that are NOT a human prompt (injected context). Absent field => keep
// (the fixtures carry no promptSource and are plain typed prompts).
const NON_HUMAN_PROMPT_SOURCE = new Set(["system"]);

/** Pull plain human-prompt text out of a user message, skipping tool_result / meta blocks. */
function userPromptText(line) {
  // Synthetic/meta user turns (tool results, local-command wrappers) are not human prompts.
  if (line.isMeta === true) return null;
  if (typeof line.promptSource === "string" && NON_HUMAN_PROMPT_SOURCE.has(line.promptSource)) return null;
  const content = line.message?.content;
  if (typeof content === "string") {
    const t = content.trim();
    // Slash-command / local-command wrappers come in as user text but aren't typed prompts.
    if (!t.length || t.startsWith("<command-") || t.includes("<local-command-stdout>")) return null;
    return t;
  }
  if (Array.isArray(content)) {
    const parts = [];
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
      // tool_result / image / other blocks are not prompts — skip.
    }
    const t = parts.join("\n").trim();
    return t.length ? t : null;
  }
  return null;
}

/** Normalize a Claude edit tool_use into an editOp (line-range computation lives in edits.mjs). */
function editOpFromToolUse(block) {
  const input = block.input ?? {};
  const base = { tool: block.name, file: input.file_path ?? input.filePath ?? null };
  if (!base.file) return null;
  if (block.name === "Write") return { ...base, content: input.content ?? "" };
  if (block.name === "Edit") {
    return { ...base, old_string: input.old_string ?? "", new_string: input.new_string ?? "" };
  }
  if (block.name === "MultiEdit") {
    // One editOp per sub-edit so each range is located independently.
    const edits = Array.isArray(input.edits) ? input.edits : [];
    return {
      ...base,
      multi: edits.map((e) => ({
        old_string: e.old_string ?? "",
        new_string: e.new_string ?? "",
      })),
    };
  }
  return null;
}

/**
 * @param {string} text  raw JSONL
 * @param {string} fallbackKey  filename stem, used when the transcript carries no sessionId
 * @returns {{ agent, sessionKey, prompts, editOps, started_at, ended_at, cwd, branch }}
 */
export function parseClaudeTranscript(text, fallbackKey = "unknown") {
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
      continue; // tolerant: skip malformed lines, never throw
    }
    if (typeof rec !== "object" || rec === null) continue;

    if (sessionKey === null && typeof rec.sessionId === "string") sessionKey = rec.sessionId;
    if (typeof rec.timestamp === "string") {
      if (startedAt === null) startedAt = rec.timestamp;
      endedAt = newerTimestamp(endedAt, rec.timestamp);
    }
    if (cwd === null && typeof rec.cwd === "string") cwd = rec.cwd;
    if (branch === null && typeof rec.gitBranch === "string" && rec.gitBranch) branch = rec.gitBranch;

    const role = rec.message?.role ?? rec.type;
    if (rec.type === "user" || role === "user") {
      const p = userPromptText(rec);
      if (p) prompts.push(p);
    } else if (rec.type === "assistant" || role === "assistant") {
      const content = rec.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === "tool_use" && EDIT_TOOLS.has(block.name)) {
            const op = editOpFromToolUse(block);
            if (op) editOps.push(op);
          }
        }
      }
    }
  }

  return {
    agent: "claude_code",
    sessionKey: sessionKey ?? fallbackKey,
    prompts,
    editOps,
    started_at: startedAt,
    ended_at: endedAt,
    cwd,
    branch,
  };
}
