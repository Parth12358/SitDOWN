// Live integration smoke for the default `claude_cli` backend: a real `claude -p` summarization.
//
// Opt-in only — it spawns Claude Code, is non-deterministic, and spends quota. The normal
// `pnpm test` suite stays fast/offline (the adapter's parsing is covered deterministically in
// llm.test.ts with an injected runner). Run this on demand:
//
//   SITDOWN_LIVE_CLAUDE=1 pnpm --filter @sitdown/summarizer test
//
// Verified working 2026-10-11: fixture refund session -> schema-valid Digest in ~6s, correctly
// capturing the rejected client-side-dedupe approach and the human intervention.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SessionRecord } from "@sitdown/contracts";
import { summarize } from "../src/index.js";
import { makeLlm } from "../src/llm.js";
import { validateDigest } from "../src/schema.js";

const LIVE = !!process.env.SITDOWN_LIVE_CLAUDE;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test(
  "claude -p (claude_cli backend) produces a schema-valid Digest from a real session",
  { skip: LIVE ? false : "set SITDOWN_LIVE_CLAUDE=1 to run the live claude -p smoke", timeout: 180_000 },
  async () => {
    const rec = JSON.parse(
      readFileSync(path.join(root, "contracts/fixtures/inbox/sessions/abc123.json"), "utf8"),
    ) as SessionRecord;
    rec.transcript_path = path.join(root, "contracts/fixtures/transcripts/claude-abc123.jsonl");

    const digest = await summarize(rec, { llm: makeLlm("claude_cli") });

    // Schema + deterministic (code-owned) fields.
    assert.ok(validateDigest(digest).valid, "Digest must validate against the contract schema");
    assert.equal(digest.source, "session:claude:abc123");
    assert.equal(digest.author, "sam");
    assert.equal(digest.feature, "payments");
    assert.equal(digest.attribution?.[0]?.label, "agent");

    // LLM-owned fields: non-empty prose, and it captured the rejected approach.
    assert.ok(digest.headline.length > 0 && digest.summary.length > 0);
    assert.match(JSON.stringify(digest).toLowerCase(), /client-side/);
  },
);
