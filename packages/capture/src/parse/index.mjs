// Agent detection + dispatch. A session is parsed by the agent that produced it; the agent is
// known from the hook that fired (explicit), or guessed from the transcript's filename/shape.
import path from "node:path";
import { parseClaudeTranscript } from "./claude.mjs";
import { parseCodexTranscript } from "./codex.mjs";

const PARSERS = {
  claude_code: parseClaudeTranscript,
  codex: parseCodexTranscript,
  // cursor uses Claude-shaped JSONL today; route it through the Claude parser then relabel.
  cursor: parseClaudeTranscript,
};

/** Best-effort agent id from a transcript path and/or its text. Claude is the default. */
export function detectAgent(transcriptPath = "", text = "") {
  const base = path.basename(transcriptPath).toLowerCase();
  if (base.startsWith("codex") || transcriptPath.includes(`${path.sep}.codex${path.sep}`)) return "codex";
  if (base.startsWith("cursor") || transcriptPath.includes(`${path.sep}.cursor${path.sep}`)) return "cursor";
  if (base.startsWith("claude") || transcriptPath.includes(`${path.sep}projects${path.sep}`)) return "claude_code";
  // Shape sniff: an apply_patch tool_use strongly implies Codex.
  if (/"name"\s*:\s*"apply_patch"/.test(text)) return "codex";
  return "claude_code";
}

/**
 * Parse a transcript for a known or detected agent.
 * @param {{ agent?: string, transcriptPath?: string, text: string, fallbackKey?: string }} args
 */
export function parseTranscript({ agent, transcriptPath = "", text, fallbackKey }) {
  const resolved = agent && PARSERS[agent] ? agent : detectAgent(transcriptPath, text);
  const stem = fallbackKey ?? path.basename(transcriptPath).replace(/\.jsonl$|\.json$/i, "") ?? "unknown";
  const parser = PARSERS[resolved] ?? parseClaudeTranscript;
  const parsed = parser(text, stem);
  // Honor an explicit agent label (e.g. cursor) even though it shares the Claude parser.
  if (agent && PARSERS[agent]) parsed.agent = agent;
  return parsed;
}
