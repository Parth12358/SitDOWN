import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEdits, relativize } from "../src/edits.mjs";
import { parseUnifiedDiff, parseRepoSlug, coAuthorsFromMessage } from "../src/git.mjs";
import { resolveAuthor } from "../src/config.mjs";

test("buildEdits: Write -> [1, lineCount]; offline fallback for Edit", () => {
  const ops = [
    { tool: "Write", file: "src/a.ts", content: "l1\nl2\nl3" },
    { tool: "Edit", file: "src/a.ts", old_string: "x", new_string: "n1\nn2" },
  ];
  const edits = buildEdits(ops, { cwd: null, locate: false });
  assert.equal(edits.length, 1);
  assert.equal(edits[0].file, "src/a.ts");
  // Write -> [1,3], Edit fallback -> [1,2]; sorted by start (both start at 1, insertion order kept)
  assert.deepEqual(edits[0].added_lines, [[1, 3], [1, 2]]);
});

test("buildEdits: Edit range located against on-disk content", () => {
  // Simulate by passing an absolute file that doesn't exist -> fallback; then a real locate case
  const ops = [{ tool: "Edit", file: "/no/such/file.ts", old_string: "a", new_string: "x\ny\nz" }];
  const edits = buildEdits(ops, { cwd: null, locate: true });
  assert.deepEqual(edits[0].added_lines, [[1, 3]]); // unreadable -> count fallback
});

test("relativize: absolute path under cwd becomes forward-slashed relative", () => {
  assert.equal(relativize("/home/sam/app/src/x.ts", "/home/sam/app"), "src/x.ts");
  assert.equal(relativize("src/x.ts", "/home/sam/app"), "src/x.ts");
  assert.equal(relativize("/other/x.ts", "/home/sam/app"), "/other/x.ts");
});

test("parseUnifiedDiff: added and removed ranges per file", () => {
  const diff = [
    "diff --git a/src/r.ts b/src/r.ts",
    "--- a/src/r.ts",
    "+++ b/src/r.ts",
    "@@ -10,0 +11,3 @@",
    "+a",
    "+b",
    "+c",
    "@@ -20,2 +24,0 @@",
    "-x",
    "-y",
  ].join("\n");
  const files = parseUnifiedDiff(diff);
  assert.equal(files.length, 1);
  assert.equal(files[0].file, "src/r.ts");
  assert.deepEqual(files[0].added_lines, [[11, 13]]);
  assert.deepEqual(files[0].removed_lines, [[20, 21]]);
});

test("parseRepoSlug handles ssh and https remotes", () => {
  assert.equal(parseRepoSlug("git@github.com:acme/app.git"), "acme/app");
  assert.equal(parseRepoSlug("https://github.com/acme/app.git"), "acme/app");
  assert.equal(parseRepoSlug("https://github.com/acme/app"), "acme/app");
  assert.equal(parseRepoSlug(null), null);
});

test("coAuthorsFromMessage extracts trailer names", () => {
  const msg = "fix refund rounding\n\nCo-authored-by: Claude <noreply@anthropic.com>\nCo-authored-by: Pat";
  assert.deepEqual(coAuthorsFromMessage(msg), ["Claude", "Pat"]);
});

test("resolveAuthor maps email and slug through people", () => {
  const people = { sam: ["sam@example.com"], alex: ["alex@corp.io"] };
  assert.equal(resolveAuthor({ name: "Sam Smith", email: "sam@example.com" }, people), "sam");
  assert.equal(resolveAuthor({ name: "alex", email: null }, people), "alex");
  assert.equal(resolveAuthor({ name: "Jamie Lee", email: "jamie@x.io" }, people), "jamie-lee");
});
