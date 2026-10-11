import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseTranscript } from "../src/parse/index.mjs";
import { buildSessionRecord } from "../src/record.mjs";
import { validateRecord } from "../src/validate.mjs";
import { CONTRACTS_FIXTURES } from "./helpers.mjs";

const CASES = [
  ["claude-abc123.jsonl", { author: "sam", repo: "acme/app", branch: "feat/payments", cwd: "/home/sam/app", transcriptPath: "~/.sitdown/archive/claude/abc123.jsonl" }, "claude:abc123"],
  ["claude-def456.jsonl", { author: "alex", repo: "acme/app", branch: "feat/auth", cwd: "/home/alex/app", transcriptPath: "~/.sitdown/archive/claude/def456.jsonl" }, "claude:def456"],
  ["codex-ghi789.jsonl", { author: "alex", repo: "acme/app", branch: "feat/auth", cwd: "/home/alex/app", transcriptPath: "~/.sitdown/archive/codex/ghi789.jsonl" }, "codex:ghi789"],
];

for (const [file, ctx, expectedId] of CASES) {
  test(`fixture ${file} -> schema-valid SessionRecord (${expectedId})`, async () => {
    const text = readFileSync(path.join(CONTRACTS_FIXTURES, "transcripts", file), "utf8");
    const parsed = parseTranscript({ transcriptPath: file, text });
    const rec = buildSessionRecord(parsed, { ...ctx, locate: false });
    assert.equal(rec.id, expectedId);
    const v = await validateRecord("session", rec);
    assert.ok(v.valid, `errors: ${JSON.stringify(v.errors)}`);
  });
}
