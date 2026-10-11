// Install a Node-backed `post-commit` hook into the current repo. Additive: an existing hook is
// backed up and preserved (our line is appended). Idempotent. Fails open at runtime.
import { existsSync, readFileSync, copyFileSync, chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWriteFile } from "../fs-atomic.mjs";
import { runGit } from "../git.mjs";

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "bin", "sitdown.mjs");
const MARKER = "sitdown-capture";

/** The line our hook adds. Fail-open: a capture error never fails the commit. */
function hookLine() {
  return `"${process.execPath}" "${BIN}" post-commit >/dev/null 2>&1 || true  # ${MARKER}`;
}

function freshHook() {
  return `#!/bin/sh\n# ${MARKER}: record this commit into ~/.sitdown/inbox (fail-open)\n${hookLine()}\n`;
}

/** Resolve the repo's hooks dir (honors worktrees / core.hooksPath). */
export function hooksDir(cwd) {
  const p = runGit(["rev-parse", "--git-path", "hooks"], cwd);
  if (!p) return null;
  return path.isAbsolute(p) ? p : path.join(cwd, p);
}

/**
 * @param {{ cwd?: string, dryRun?: boolean }} [opts]
 * @returns {{ status: string, file?: string, backup?: string }}
 */
export function installGitHook({ cwd = process.cwd(), dryRun = false } = {}) {
  const dir = hooksDir(cwd);
  if (!dir) return { status: "not-a-git-repo" };
  const file = path.join(dir, "post-commit");

  if (existsSync(file)) {
    const content = readFileSync(file, "utf8");
    if (content.includes(MARKER)) return { status: "already-installed", file };
    if (dryRun) return { status: "would-append", file };
    const bak = `${file}.sitdown-bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    copyFileSync(file, bak);
    const needsNl = content.endsWith("\n") ? "" : "\n";
    atomicWriteFile(file, `${content}${needsNl}${hookLine()}\n`, 0o755);
    chmodSync(file, 0o755);
    return { status: "appended", file, backup: bak };
  }

  if (dryRun) return { status: "would-install", file };
  mkdirSync(dir, { recursive: true });
  atomicWriteFile(file, freshHook(), 0o755);
  chmodSync(file, 0o755);
  return { status: "installed", file };
}

/** Remove our hook line (or the whole fresh hook if it's only ours). */
export function uninstallGitHook({ cwd = process.cwd(), dryRun = false } = {}) {
  const dir = hooksDir(cwd);
  if (!dir) return { status: "not-a-git-repo" };
  const file = path.join(dir, "post-commit");
  if (!existsSync(file)) return { status: "absent", file };
  const content = readFileSync(file, "utf8");
  if (!content.includes(MARKER)) return { status: "not-ours", file };
  if (dryRun) return { status: "would-remove", file };
  const kept = content
    .split("\n")
    .filter((l) => !l.includes(MARKER))
    .join("\n")
    .replace(/\n{2,}$/, "\n");
  // If nothing but the shebang/comment is left, remove the file entirely.
  const meaningful = kept.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#") && l.trim() !== "#!/bin/sh");
  const bak = `${file}.sitdown-bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  copyFileSync(file, bak);
  if (meaningful.length === 0) {
    atomicWriteFile(file, ""); // emptied; harmless
    return { status: "removed", file, backup: bak, emptied: true };
  }
  atomicWriteFile(file, kept.endsWith("\n") ? kept : `${kept}\n`, 0o755);
  chmodSync(file, 0o755);
  return { status: "removed", file, backup: bak };
}

export { BIN as GIT_HOOK_BIN, MARKER };
