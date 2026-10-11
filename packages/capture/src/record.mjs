// Assemble a SessionRecord from a parsed transcript + git/identity context, and write it
// atomically to ~/.sitdown/inbox/sessions/<sessionKey>.json. Schema in contracts/.
import path from "node:path";
import { inboxSessions } from "./paths.mjs";
import { buildEdits } from "./edits.mjs";
import { atomicWriteJson } from "./fs-atomic.mjs";
import { toIso } from "./util.mjs";

/** agent id -> the short namespace used in the record id (`claude:abc123`). */
const NS_FOR_AGENT = { claude_code: "claude", codex: "codex", cursor: "cursor" };

/** A filesystem-safe session key (no colons/slashes) for the inbox filename. */
function safeKey(key) {
  return String(key).replace(/[^A-Za-z0-9._-]/g, "_");
}

/**
 * @param {object} parsed  output of parseTranscript
 * @param {object} ctx     { author, repo, branch, cwd, transcriptPath, locate? }
 * @returns {object} SessionRecord
 */
export function buildSessionRecord(parsed, ctx = {}) {
  const ns = NS_FOR_AGENT[parsed.agent] ?? "other";
  // Strip a leading `<ns>-` the fixture filenames carry (claude-abc123 -> abc123); real
  // sessionIds (uuids) are untouched.
  let key = parsed.sessionKey ?? "unknown";
  if (key.startsWith(`${ns}-`)) key = key.slice(ns.length + 1);

  const cwd = ctx.cwd ?? parsed.cwd ?? "";
  const edits = buildEdits(parsed.editOps ?? [], { cwd: cwd || null, locate: ctx.locate !== false });

  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  return {
    id: `${ns}:${key}`,
    agent: parsed.agent,
    author: ctx.author ?? "unknown",
    repo: ctx.repo ?? "",
    branch: ctx.branch ?? parsed.branch ?? "",
    cwd,
    started_at: toIso(parsed.started_at) ?? nowIso,
    ended_at: toIso(parsed.ended_at) ?? nowIso,
    prompts: parsed.prompts ?? [],
    edits,
    transcript_path: ctx.transcriptPath ?? "",
  };
}

/** Write a SessionRecord to the inbox; returns the written path. */
export function writeSessionRecord(record) {
  const key = record.id.includes(":") ? record.id.slice(record.id.indexOf(":") + 1) : record.id;
  const file = path.join(inboxSessions(), `${safeKey(key)}.json`);
  atomicWriteJson(file, record);
  return file;
}
