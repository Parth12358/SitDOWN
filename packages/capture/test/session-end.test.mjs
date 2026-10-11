import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { runSessionEnd } from "../src/hooks/session-end.mjs";
import { validateRecord } from "../src/validate.mjs";
import { inboxSessions, configPath } from "../src/paths.mjs";
import { makeTempDir, cleanup, withSitdownHome, initRepo, writeFile } from "./helpers.mjs";

test("session-end: real transcript -> schema-valid SessionRecord with located edit range", async () => {
  const home = makeTempDir("home-");
  const repo = makeTempDir("repo-");
  const restore = withSitdownHome(home);
  try {
    initRepo(repo, { name: "sam", email: "sam@example.com", branch: "feat/payments" });
    // config.json maps sam
    writeFile(home, "config.json", JSON.stringify({ vault_path: "~/vault", event_store: "sqlite", llm: "cloud", people: { sam: ["sam@example.com"] } }));
    // the file the transcript edits (so the Edit range is located on disk: new_string at line 3)
    writeFile(repo, "src/refund.ts", "line1\nline2\n// idempotency-key guard\nconst key = 1;\nline5\n");

    const tp = writeFile(
      repo,
      "transcript.jsonl",
      [
        JSON.stringify({ type: "user", timestamp: "2026-10-11T18:02:00Z", sessionId: "sess-001", cwd: repo, gitBranch: "feat/payments", promptSource: "typed", message: { role: "user", content: "add refund endpoint" } }),
        JSON.stringify({ type: "assistant", timestamp: "2026-10-11T18:14:05Z", message: { role: "assistant", content: [{ type: "tool_use", name: "Edit", input: { file_path: path.join(repo, "src/refund.ts"), old_string: "x", new_string: "// idempotency-key guard\nconst key = 1;" } }] } }),
        JSON.stringify({ type: "user", timestamp: "2026-10-11T18:20:00Z", promptSource: "system", message: { role: "user", content: "injected context" } }),
        JSON.stringify({ type: "assistant", timestamp: "2026-10-11T18:38:00Z", message: { role: "assistant", content: "done" } }),
      ].join("\n")
    );

    const res = await runSessionEnd({ session_id: "sess-001", transcript_path: tp, cwd: repo });
    assert.ok(res.written, "a record was written");

    const files = readdirSync(inboxSessions());
    assert.equal(files.length, 1);
    const rec = JSON.parse(readFileSync(path.join(inboxSessions(), files[0]), "utf8"));

    assert.equal(rec.id, "claude:sess-001");
    assert.equal(rec.agent, "claude_code");
    assert.equal(rec.author, "sam");
    assert.equal(rec.branch, "feat/payments");
    assert.deepEqual(rec.prompts, ["add refund endpoint"]); // system-source dropped
    assert.equal(rec.edits.length, 1);
    assert.equal(rec.edits[0].file, "src/refund.ts"); // relativized to cwd
    assert.deepEqual(rec.edits[0].added_lines, [[3, 4]]); // located on disk
    assert.ok(rec.transcript_path.startsWith("~/"), "archive path is ~-relative");

    const v = await validateRecord("session", rec);
    assert.ok(v.valid, `schema valid: ${JSON.stringify(v.errors)}`);
  } finally {
    restore();
    cleanup(home);
    cleanup(repo);
  }
});

test("session-end: .sitdownignore opts a repo out", async () => {
  const home = makeTempDir("home-");
  const repo = makeTempDir("repo-");
  const restore = withSitdownHome(home);
  try {
    writeFile(home, ".sitdownignore", `${repo}\n`);
    const tp = writeFile(repo, "t.jsonl", JSON.stringify({ type: "user", timestamp: "2026-01-01T00:00:00Z", sessionId: "s", message: { role: "user", content: "hi" } }));
    const res = await runSessionEnd({ session_id: "s", transcript_path: tp, cwd: repo });
    assert.equal(res.written, null);
    assert.match(res.reason, /ignore/);
  } finally {
    restore();
    cleanup(home);
    cleanup(repo);
  }
});
