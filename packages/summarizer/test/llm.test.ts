import { test } from "node:test";
import assert from "node:assert/strict";
import { claudeCliLlm } from "../src/llm.js";

test("claude_cli backend parses a plain JSON result from the runner", async () => {
  const llm = claudeCliLlm(async () => '{"headline":"hi","summary":"s"}');
  const out = (await llm.completeJson("prompt")) as { headline: string };
  assert.equal(out.headline, "hi");
});

test("claude_cli backend tolerates markdown fences and surrounding prose", async () => {
  const llm = claudeCliLlm(async () => 'Here you go:\n```json\n{"headline":"x"}\n```\nDone.');
  const out = (await llm.completeJson("prompt")) as { headline: string };
  assert.equal(out.headline, "x");
});

test("claude_cli backend throws when the runner returns no JSON object", async () => {
  const llm = claudeCliLlm(async () => "sorry, no idea");
  await assert.rejects(() => llm.completeJson("prompt"), /no JSON object/);
});
