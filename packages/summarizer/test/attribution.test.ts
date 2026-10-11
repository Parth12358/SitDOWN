import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { SessionRecord, CommitRecord, Digest } from "@sitdown/contracts";
import { attributeSession, attributeCommit } from "../src/attribution.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.resolve(here, "../../../contracts/fixtures");
const read = <T>(rel: string): T => JSON.parse(readFileSync(path.join(fixtures, rel), "utf8")) as T;

const sessions = [
  read<SessionRecord>("inbox/sessions/abc123.json"),
  read<SessionRecord>("inbox/sessions/def456.json"),
  read<SessionRecord>("inbox/sessions/ghi789.json"),
];

test("session attribution: agent lines come straight from the session edits", () => {
  const abc = sessions[0];
  assert.deepEqual(attributeSession(abc), [
    { file: "src/refund.ts", lines: [10, 42], label: "agent" },
  ]);
});

test("commit 9f2e1d: agent_edited over the session range, human on the rest", () => {
  const commit = read<CommitRecord>("inbox/commits/9f2e1d.json");
  const golden = read<Digest>("processed/commit-9f2e1d.json");
  assert.deepEqual(attributeCommit(commit, sessions), golden.attribution);
});

test("commit 7a3b2c: human edits of agent code across two files are agent_edited", () => {
  const commit = read<CommitRecord>("inbox/commits/7a3b2c.json");
  const result = attributeCommit(commit, sessions);
  // refresh.ts [1,54] matches def456; login.ts [88,90] matches ghi789 -> all agent_edited.
  assert.deepEqual(result, [
    { file: "src/auth/refresh.ts", lines: [1, 54], label: "agent_edited" },
    { file: "src/auth/login.ts", lines: [88, 90], label: "agent_edited" },
  ]);
});

test("co-author-only commit (no session match) is whole-commit agent", () => {
  const commit: CommitRecord = {
    sha: "deadbeef",
    author: "sam",
    repo: "acme/app",
    branch: "feat/unknown",
    message: "scaffold",
    at: "2026-10-11T20:00:00Z",
    files: [{ file: "src/new.ts", added_lines: [[1, 20]], removed_lines: [] }],
    co_authors: ["Claude"],
  };
  assert.deepEqual(attributeCommit(commit, sessions), [
    { file: "src/new.ts", lines: [1, 20], label: "agent" },
  ]);
});
