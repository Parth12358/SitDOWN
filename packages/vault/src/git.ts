// The vault is a git repo so the developer owns a full, reviewable history.
// Commit after each batch, naming the sources. Fail-soft: note writing already succeeded,
// so a git hiccup is logged, never thrown.
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

function samePath(a: string, b: string): boolean {
  const norm = (p: string) => { try { return realpathSync(p); } catch { return path.resolve(p); } };
  return norm(a) === norm(b);
}

const COMMITTER = ["-c", "user.name=SitDOWN", "-c", "user.email=sitdown@localhost"];

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

/**
 * Make the vault its OWN git repo. If it merely sits inside an enclosing repo (e.g. a demo vault
 * under the project tree), `git init` a nested repo here — otherwise `git add`/`commit` would run
 * against the parent repo and pollute its history.
 */
export async function ensureRepo(vaultPath: string): Promise<void> {
  await mkdir(vaultPath, { recursive: true });
  let isOwnRepo = false;
  try {
    const top = (await git(vaultPath, ["rev-parse", "--show-toplevel"])).trim();
    isOwnRepo = !!top && samePath(top, vaultPath);
  } catch {
    isOwnRepo = false;
  }
  if (!isOwnRepo) await git(vaultPath, ["init", "-q"]);
}

/** Stage everything and commit. Returns false if there was nothing to commit. */
export async function commitAll(vaultPath: string, message: string): Promise<boolean> {
  try {
    await ensureRepo(vaultPath);
    await git(vaultPath, ["add", "-A"]);
    const status = await git(vaultPath, ["status", "--porcelain"]);
    if (!status.trim()) return false;
    await git(vaultPath, [...COMMITTER, "commit", "-q", "-m", message]);
    return true;
  } catch (err) {
    console.warn(`[vault] git commit skipped: ${(err as Error).message}`);
    return false;
  }
}

/** A commit message naming the sources in this batch. */
export function batchMessage(sources: string[]): string {
  const list = sources.join(", ");
  return `sitdown: update docs from ${sources.length} source${sources.length === 1 ? "" : "s"} (${list})`;
}
