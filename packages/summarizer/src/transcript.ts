// Transcript loading + trimming (PRD-B).
// Transcripts are JSONL: {type, timestamp, message:{role, content}}.
// `content` is a string, or an array of blocks incl. {type:"tool_use", name, input:{...}}.
// Trimming keeps prompts, agent messages, tool names, and file paths; drops any single
// tool body (content/patch/new_string/old_string) over 2 KB before sending to the LLM.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const MAX_TOOL_BODY_BYTES = 2048;

/** Expand a leading ~ to the user's home directory. */
export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return path.join(homedir(), p.slice(2));
  return p;
}

export interface TranscriptEntry {
  type?: string;
  timestamp?: string;
  message?: { role?: string; content?: unknown };
}

/** Read a JSONL transcript. Returns [] if the file is missing or empty. Never throws on bad lines. */
export function loadTranscript(transcriptPath: string): TranscriptEntry[] {
  let raw: string;
  try {
    raw = readFileSync(expandHome(transcriptPath), "utf8");
  } catch {
    return [];
  }
  const out: TranscriptEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // skip malformed line
    }
  }
  return out;
}

function tooBig(s: unknown): boolean {
  return typeof s === "string" && Buffer.byteLength(s, "utf8") > MAX_TOOL_BODY_BYTES;
}

function clip(s: string): string {
  return `${s.slice(0, 200)}… [${Buffer.byteLength(s, "utf8")} bytes elided]`;
}

/**
 * Render a transcript into a compact, LLM-ready string.
 * - user/assistant text is kept verbatim
 * - tool_use blocks keep their name + file_path; large bodies are elided
 */
export function trimTranscript(entries: TranscriptEntry[]): string {
  const lines: string[] = [];
  for (const entry of entries) {
    const role = entry.message?.role ?? entry.type ?? "unknown";
    const content = entry.message?.content;

    if (typeof content === "string") {
      lines.push(`${role}: ${content}`);
      continue;
    }
    if (!Array.isArray(content)) continue;

    for (const block of content as Array<Record<string, unknown>>) {
      if (block?.type === "text" && typeof block.text === "string") {
        lines.push(`${role}: ${block.text}`);
      } else if (block?.type === "tool_use") {
        const name = typeof block.name === "string" ? block.name : "tool";
        const input = (block.input ?? {}) as Record<string, unknown>;
        const file =
          (typeof input.file_path === "string" && input.file_path) ||
          (typeof input.path === "string" && input.path) ||
          "";
        const parts: string[] = [`[tool ${name}${file ? ` ${file}` : ""}]`];
        for (const key of ["old_string", "new_string", "content", "patch"]) {
          const v = input[key];
          if (typeof v !== "string") continue;
          parts.push(`${key}: ${tooBig(v) ? clip(v) : v}`);
        }
        lines.push(`${role}: ${parts.join(" ")}`);
      }
    }
  }
  return lines.join("\n");
}
