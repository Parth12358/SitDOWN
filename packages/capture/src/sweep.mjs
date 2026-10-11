// Archive a finished session's transcript to ~/.sitdown/archive/<agent>/<key>.jsonl.
// LOCAL ONLY — this is the archive half of the upstream sweep with the upload path removed.
// Returns the ~-relative archive path to store in the SessionRecord.
import { readFileSync } from "node:fs";
import path from "node:path";
import { archiveTranscriptPath, tildify } from "./paths.mjs";
import { atomicWriteFile } from "./fs-atomic.mjs";

const AGENT_DIR = { claude_code: "claude", codex: "codex", cursor: "cursor" };

/**
 * Copy transcript text into the archive atomically.
 * @param {{ agent: string, sessionKey: string, text: string }} session
 * @returns {string} ~-prefixed archive path
 */
export function archiveTranscript({ agent, sessionKey, text }) {
  const dir = AGENT_DIR[agent] ?? "other";
  const dest = archiveTranscriptPath(dir, sessionKey);
  atomicWriteFile(dest, text);
  return tildify(dest);
}

/** Read a transcript file; returns null if unreadable (fail-open). */
export function readTranscript(transcriptPath) {
  try {
    return readFileSync(transcriptPath, "utf8");
  } catch {
    return null;
  }
}

/** Strip the agent prefix from a fixture-style stem for the archive filename. */
export function archiveKeyFor(agent, sessionKey) {
  const ns = AGENT_DIR[agent] ?? "other";
  return sessionKey.startsWith(`${ns}-`) ? sessionKey.slice(ns.length + 1) : sessionKey;
}

export { AGENT_DIR };
