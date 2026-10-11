// Git post-commit hook runtime: turn the just-made commit into a CommitRecord in the inbox.
// Installed per-repo (`sitdown install-git-hook`). Runs with cwd = the repo. Fails open.
import path from "node:path";
import { inboxCommits } from "../paths.mjs";
import { atomicWriteJson } from "../fs-atomic.mjs";
import { validateRecord } from "../validate.mjs";
import { toIso } from "../util.mjs";
import {
  runGit,
  gitIdentity,
  gitRepoSlug,
  gitBranch,
  commitFileRanges,
  coAuthorsFromMessage,
} from "../git.mjs";
import { loadConfig, resolveAuthor } from "../config.mjs";

/**
 * @param {{ cwd?: string }} [opts]
 * @returns {Promise<{ written: string|null, record?: object, reason?: string }>}
 */
export async function runPostCommit(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const sha = runGit(["rev-parse", "--short", "HEAD"], cwd);
  if (!sha) return { written: null, reason: "no HEAD commit" };

  const message = runGit(["log", "-1", "--format=%B", "HEAD"], cwd) ?? "";
  const at = toIso(runGit(["log", "-1", "--format=%cI", "HEAD"], cwd)) ?? new Date().toISOString();

  const config = loadConfig();
  const author = resolveAuthor(gitIdentity(cwd), config.people);

  const record = {
    sha,
    author,
    repo: gitRepoSlug(cwd),
    branch: gitBranch(cwd) || "",
    message: message.replace(/\n+$/, ""),
    at,
    files: commitFileRanges(sha, cwd),
    co_authors: coAuthorsFromMessage(message),
  };

  const v = await validateRecord("commit", record);
  if (!v.valid) console.error("[sitdown] CommitRecord failed schema validation:", JSON.stringify(v.errors));

  const file = path.join(inboxCommits(), `${sha.replace(/[^A-Za-z0-9._-]/g, "_")}.json`);
  atomicWriteJson(file, record);
  return { written: file, record };
}

export async function postCommitMain(argv = []) {
  const guard = setTimeout(() => process.exit(0), 5000);
  guard.unref?.();
  const res = await runPostCommit({});
  if (res.written) console.error(`[sitdown] captured commit -> ${res.written}`);
  else console.error(`[sitdown] no commit captured: ${res.reason}`);
  clearTimeout(guard);
}
