// Local git helpers. All read-only, all local (no network: `remote get-url` only reads config).
// Every call is best-effort with a short timeout and returns null/empty on failure — capture and
// the hooks must never block or throw because of git.
import { execFileSync } from "node:child_process";
import path from "node:path";

const GIT_TIMEOUT_MS = 4000;

// Shared wall-clock deadline for the whole hook run. A `setTimeout` cannot preempt a chain of
// synchronous execFileSync calls, so each git call instead clamps its own timeout to the time
// remaining and bails out instantly once the budget is spent. This is what actually enforces the
// PRD's "hooks exit within 5 seconds, always" guarantee for the blocking git chain.
let deadlineAt = Infinity;

/** Start the hook budget: every runGit after this returns null once `ms` have elapsed. */
export function setGitDeadline(ms) {
  deadlineAt = Date.now() + ms;
}

/** Clear the budget (e.g. for long-running tooling that isn't a hook). */
export function clearGitDeadline() {
  deadlineAt = Infinity;
}

/** Run a git subcommand in `cwd`; return trimmed stdout, or null on any failure. */
export function runGit(args, cwd) {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) return null; // budget spent: skip rather than block past the deadline
  const timeout = Math.max(1, Math.min(GIT_TIMEOUT_MS, remaining));
  try {
    const out = execFileSync("git", args, {
      cwd: cwd || process.cwd(),
      timeout,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 16 * 1024 * 1024,
    });
    return out.replace(/\n$/, "");
  } catch {
    return null;
  }
}

/** { name, email } from `git config` in cwd (either may be null). */
export function gitIdentity(cwd) {
  return {
    name: runGit(["config", "user.name"], cwd),
    email: runGit(["config", "user.email"], cwd),
  };
}

/** Current branch name, or null (detached/empty repo). */
export function gitBranch(cwd) {
  const b = runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  return b && b !== "HEAD" ? b : b; // keep "HEAD" rather than inventing one
}

/** owner/name from the origin remote; else the repo's top-level folder name; else "". */
export function gitRepoSlug(cwd) {
  const url = runGit(["remote", "get-url", "origin"], cwd);
  const parsed = parseRepoSlug(url);
  if (parsed) return parsed;
  const top = runGit(["rev-parse", "--show-toplevel"], cwd);
  return top ? path.basename(top) : "";
}

/** Parse owner/name out of an https or ssh git remote URL. */
export function parseRepoSlug(url) {
  if (!url) return null;
  // git@github.com:owner/name.git  |  ssh://git@host/owner/name.git  |  https://host/owner/name(.git)
  const cleaned = url.replace(/\.git$/, "");
  const m =
    cleaned.match(/[:/]([^/:]+\/[^/]+)$/) /* owner/name at the end */ ||
    cleaned.match(/([^/]+\/[^/]+)$/);
  return m ? m[1] : null;
}

/**
 * Added/removed line ranges per file for a commit, from `git diff --unified=0 <parent> <sha>`.
 * Returns [{ file, added_lines: [[s,e]], removed_lines: [[s,e]] }]. Handles the root commit
 * (no parent) via the empty-tree hash.
 */
export function commitFileRanges(sha, cwd) {
  const parent = runGit(["rev-parse", `${sha}^`], cwd);
  const base = parent ?? "4b825dc642cb6eb9a060e54bf8d69288fbee4904"; // git empty tree
  const diff = runGit(["diff", "--unified=0", "--no-color", base, sha], cwd);
  return parseUnifiedDiff(diff ?? "");
}

/** Parse `git diff --unified=0` output into per-file added/removed ranges. */
export function parseUnifiedDiff(diff) {
  const files = [];
  let current = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      current = null;
      continue;
    }
    if (line.startsWith("+++ ")) {
      // +++ b/path  (or /dev/null for deletions)
      const p = line.slice(4).trim();
      if (p === "/dev/null") {
        current = null;
      } else {
        const file = p.replace(/^b\//, "");
        current = { file, added_lines: [], removed_lines: [] };
        files.push(current);
      }
      continue;
    }
    if (line.startsWith("@@")) {
      // @@ -oldStart[,oldLen] +newStart[,newLen] @@
      const m = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (m && current) {
        const oldStart = +m[1];
        const oldLen = m[2] === undefined ? 1 : +m[2];
        const newStart = +m[3];
        const newLen = m[4] === undefined ? 1 : +m[4];
        if (newLen > 0) current.added_lines.push([newStart, newStart + newLen - 1]);
        if (oldLen > 0) current.removed_lines.push([oldStart, oldStart + oldLen - 1]);
      }
    }
  }
  // A pure-deletion hunk at newStart 0 would be invalid (schema requires >=1); drop empties.
  return files.map((f) => ({
    file: f.file,
    added_lines: f.added_lines.filter(([s]) => s >= 1),
    removed_lines: f.removed_lines.filter(([s]) => s >= 1),
  }));
}

/** Names from `Co-authored-by: Name <email>` trailers in a commit message. */
export function coAuthorsFromMessage(message) {
  const out = [];
  for (const line of String(message || "").split("\n")) {
    const m = line.match(/^\s*Co-authored-by:\s*(.+?)\s*(?:<[^>]*>)?\s*$/i);
    if (m && m[1]) out.push(m[1].trim());
  }
  return out;
}
