import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBriefing, rankSummaries, capPrompt } from "../briefing.js";
import { MockMcpClient, type PersonSummary } from "../mcp.js";

test("buildBriefing composes behavior rules + per-attendee sections from the mock docs", async () => {
  const prompt = await buildBriefing(["sam", "alex"], new MockMcpClient());
  assert.match(prompt, /AI (documentation )?assistant/i);
  assert.match(prompt, /Stay SILENT unless/i);
  assert.match(prompt, /## sam/);
  assert.match(prompt, /## alex/);
  // Decisions carry the reasoning and a source citation.
  assert.match(prompt, /idempotency keys for refunds/i);
  assert.match(prompt, /session:claude:abc123/);
});

test("buildBriefing answers from the briefing only by default (no tool claim)", async () => {
  const prompt = await buildBriefing(["sam"], new MockMcpClient());
  assert.match(prompt, /Answer only from the briefing below/i);
});

test("rankSummaries puts more decision-heavy people first", () => {
  const a: PersonSummary = { author: "a", date: "2026-10-10", items: [], decisions: [] };
  const b: PersonSummary = {
    author: "b",
    date: "2026-10-09",
    items: [],
    decisions: [{ title: "x" }],
  };
  const ranked = rankSummaries([a, b]);
  assert.equal(ranked[0].author, "b");
});

test("capPrompt truncates oversized prompts and marks the cut", () => {
  const long = "line\n".repeat(5000);
  const capped = capPrompt(long, 200);
  assert.ok(capped.length <= 200);
  assert.match(capped, /truncated/);
});
