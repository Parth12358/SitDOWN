import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { SessionRecord, Digest } from "@sitdown/contracts";
import { summarize, type AnyRecord } from "../src/index.js";
import type { Llm } from "../src/llm.js";
import { validateDigest } from "../src/schema.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.resolve(here, "../../../contracts/fixtures");
const read = <T>(rel: string): T => JSON.parse(readFileSync(path.join(fixtures, rel), "utf8")) as T;

const sessions = [
  read<SessionRecord>("inbox/sessions/abc123.json"),
  read<SessionRecord>("inbox/sessions/def456.json"),
  read<SessionRecord>("inbox/sessions/ghi789.json"),
];

/** Mock LLM that replays the golden digest's LLM-owned fields (keeps the test deterministic). */
function goldenLlm(golden: Digest): Llm {
  return {
    async completeJson() {
      return {
        headline: golden.headline,
        summary: golden.summary,
        feature: golden.feature,
        decisions: golden.decisions ?? [],
        human_interventions: golden.human_interventions ?? 0,
      };
    },
  };
}

const cases: Array<{ record: string; golden: string }> = [
  { record: "inbox/sessions/abc123.json", golden: "processed/session-claude-abc123.json" },
  { record: "inbox/sessions/def456.json", golden: "processed/session-claude-def456.json" },
  { record: "inbox/sessions/ghi789.json", golden: "processed/session-codex-ghi789.json" },
  { record: "inbox/commits/9f2e1d.json", golden: "processed/commit-9f2e1d.json" },
];

for (const c of cases) {
  test(`pipeline reproduces golden ${path.basename(c.golden)}`, async () => {
    const record = read<AnyRecord>(c.record);
    const golden = read<Digest>(c.golden);
    const digest = await summarize(record, { llm: goldenLlm(golden), sessions });
    assert.equal(validateDigest(digest).valid, true, validateDigest(digest).errors.join("; "));
    assert.deepEqual(digest, golden);
  });
}

test("at least one decision is extracted with its rejected alternative", async () => {
  const golden = read<Digest>("processed/session-claude-abc123.json");
  const digest = await summarize(read<AnyRecord>("inbox/sessions/abc123.json"), {
    llm: goldenLlm(golden),
    sessions,
  });
  const d = digest.decisions?.[0];
  assert.equal(d?.slug, "refund-idempotency");
  assert.ok((d?.rejected?.length ?? 0) >= 1, "expected a rejected alternative");
});

test("double LLM failure falls back to a schema-valid headline+summary digest", async () => {
  const throwing: Llm = {
    async completeJson() {
      throw new Error("no key");
    },
  };
  const digest = await summarize(read<AnyRecord>("inbox/sessions/abc123.json"), {
    llm: throwing,
    sessions,
  });
  assert.equal(validateDigest(digest).valid, true, validateDigest(digest).errors.join("; "));
  assert.equal(digest.source, "session:claude:abc123");
  assert.ok(digest.headline.length > 0 && digest.summary.length > 0);
  // attribution is recorded, so it survives the fallback
  assert.deepEqual(digest.attribution, [
    { file: "src/refund.ts", lines: [10, 42], label: "agent" },
  ]);
});

test("secrets are redacted before reaching the LLM prompt", async () => {
  let seen = "";
  const spy: Llm = {
    async completeJson(prompt: string) {
      seen = prompt;
      return { headline: "x", summary: "y", feature: "payments", decisions: [], human_interventions: 0 };
    },
  };
  const record: SessionRecord = {
    ...sessions[0],
    prompts: ["use key sk-ant-abcdef0123456789ABCDEF to call the api"],
  };
  await summarize(record, { llm: spy, sessions });
  assert.ok(!seen.includes("sk-ant-abcdef0123456789ABCDEF"), "API key leaked into prompt");
  assert.ok(seen.includes("[REDACTED]"), "expected redaction marker");
});
