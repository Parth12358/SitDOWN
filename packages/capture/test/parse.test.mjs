import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseTranscript } from "../src/parse/index.mjs";
import { parseApplyPatch } from "../src/parse/codex.mjs";
import { CONTRACTS_FIXTURES } from "./helpers.mjs";

const fx = (name) => readFileSync(path.join(CONTRACTS_FIXTURES, "transcripts", name), "utf8");

test("claude fixture: prompts, edit ops, agent, ordered timestamps", () => {
  const r = parseTranscript({ transcriptPath: "claude-abc123.jsonl", text: fx("claude-abc123.jsonl") });
  assert.equal(r.agent, "claude_code");
  assert.deepEqual(r.prompts, [
    "add refund endpoint",
    "client-side dedupe won't survive a retry from a different device. use idempotency keys on the server.",
  ]);
  assert.deepEqual(
    r.editOps.map((o) => `${o.tool}:${o.file}`),
    ["Write:src/refund.ts", "Edit:src/refund.ts"]
  );
  assert.equal(r.started_at, "2026-10-11T18:02:00Z");
  assert.equal(r.ended_at, "2026-10-11T18:38:00Z");
});

test("codex fixture: apply_patch -> file edit op, agent=codex", () => {
  const r = parseTranscript({ transcriptPath: "codex-ghi789.jsonl", text: fx("codex-ghi789.jsonl") });
  assert.equal(r.agent, "codex");
  assert.equal(r.prompts[0], "add rate limiting to the login route");
  assert.equal(r.editOps.length, 1);
  assert.equal(r.editOps[0].file, "src/auth/login.ts");
  assert.ok(r.editOps[0].addedLineCount >= 1);
});

test("claude parser drops system-source prompts and command wrappers", () => {
  const text = [
    JSON.stringify({ type: "user", timestamp: "2026-01-01T00:00:00Z", promptSource: "typed", message: { role: "user", content: "real prompt" } }),
    JSON.stringify({ type: "user", timestamp: "2026-01-01T00:00:01Z", promptSource: "system", message: { role: "user", content: "injected" } }),
    JSON.stringify({ type: "user", timestamp: "2026-01-01T00:00:02Z", message: { role: "user", content: "<command-name>/foo</command-name>" } }),
    JSON.stringify({ type: "user", timestamp: "2026-01-01T00:00:03Z", isMeta: true, message: { role: "user", content: "meta" } }),
  ].join("\n");
  const r = parseTranscript({ agent: "claude_code", text });
  assert.deepEqual(r.prompts, ["real prompt"]);
});

test("claude parser skips tool_result blocks in user turns", () => {
  const text = [
    JSON.stringify({ type: "user", timestamp: "2026-01-01T00:00:00Z", message: { role: "user", content: [{ type: "tool_result", content: "output" }] } }),
    JSON.stringify({ type: "user", timestamp: "2026-01-01T00:00:01Z", promptSource: "typed", message: { role: "user", content: [{ type: "text", text: "hi" }] } }),
  ].join("\n");
  const r = parseTranscript({ agent: "claude_code", text });
  assert.deepEqual(r.prompts, ["hi"]);
});

test("parseApplyPatch counts added lines per file", () => {
  const patch = "*** Update File: a.ts\n@@\n+one\n+two\n-removed\n*** Add File: b.ts\n@@\n+only";
  const ops = parseApplyPatch(patch);
  assert.deepEqual(ops, [
    { tool: "apply_patch", file: "a.ts", addedLineCount: 2 },
    { tool: "apply_patch", file: "b.ts", addedLineCount: 1 },
  ]);
});

test("tolerant: malformed lines are skipped, never throw", () => {
  const text = 'not json\n{"type":"user","timestamp":"2026-01-01T00:00:00Z","promptSource":"typed","message":{"role":"user","content":"ok"}}\n{bad';
  const r = parseTranscript({ agent: "claude_code", text });
  assert.deepEqual(r.prompts, ["ok"]);
});
