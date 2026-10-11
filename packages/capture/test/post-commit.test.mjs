import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { runPostCommit } from "../src/hooks/post-commit.mjs";
import { validateRecord } from "../src/validate.mjs";
import { inboxCommits } from "../src/paths.mjs";
import { makeTempDir, cleanup, withSitdownHome, initRepo, writeFile } from "./helpers.mjs";

test("post-commit: commit -> schema-valid CommitRecord with ranges + co-authors", async () => {
  const home = makeTempDir("home-");
  const repo = makeTempDir("repo-");
  const restore = withSitdownHome(home);
  try {
    const git = initRepo(repo, { name: "sam", email: "sam@example.com", branch: "feat/payments" });
    writeFile(home, "config.json", JSON.stringify({ vault_path: "~/v", event_store: "sqlite", llm: "cloud", people: { sam: ["sam@example.com"] } }));
    writeFile(repo, "src/refund.ts", "a\nb\nc\n");
    git(["add", "-A"]);
    git(["commit", "-q", "-m", "fix refund rounding\n\nCo-authored-by: Claude <noreply@anthropic.com>"]);

    const res = await runPostCommit({ cwd: repo });
    assert.ok(res.written);

    const files = readdirSync(inboxCommits());
    assert.equal(files.length, 1);
    const rec = JSON.parse(readFileSync(path.join(inboxCommits(), files[0]), "utf8"));

    assert.equal(rec.author, "sam");
    assert.equal(rec.branch, "feat/payments");
    assert.equal(rec.message, "fix refund rounding\n\nCo-authored-by: Claude <noreply@anthropic.com>");
    assert.deepEqual(rec.co_authors, ["Claude"]);
    assert.equal(rec.files.length, 1);
    assert.equal(rec.files[0].file, "src/refund.ts");
    assert.deepEqual(rec.files[0].added_lines, [[1, 3]]);

    const v = await validateRecord("commit", rec);
    assert.ok(v.valid, `schema valid: ${JSON.stringify(v.errors)}`);
  } finally {
    restore();
    cleanup(home);
    cleanup(repo);
  }
});
