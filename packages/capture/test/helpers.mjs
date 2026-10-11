// Test helpers. Every temp dir is created INSIDE this package (test/.tmp/) and removed after use,
// so tests never touch the user's real $HOME or agent configs.
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TMP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), ".tmp");

/** Create a fresh temp dir under test/.tmp/ and return its absolute path. */
export function makeTempDir(prefix = "t-") {
  mkdirSync(TMP_ROOT, { recursive: true });
  return mkdtempSync(path.join(TMP_ROOT, prefix));
}

export function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

/** Point the SitDOWN home at an in-repo temp dir for the duration of a test. */
export function withSitdownHome(dir) {
  const prev = process.env.SITDOWN_HOME;
  process.env.SITDOWN_HOME = dir;
  return () => {
    if (prev === undefined) delete process.env.SITDOWN_HOME;
    else process.env.SITDOWN_HOME = prev;
  };
}

/** Init a git repo in `dir` with a deterministic identity + branch. */
export function initRepo(dir, { name = "sam", email = "sam@example.com", branch = "feat/payments" } = {}) {
  const git = (args) => execFileSync("git", args, { cwd: dir, stdio: ["ignore", "pipe", "ignore"] });
  git(["init", "-q"]);
  git(["config", "user.name", name]);
  git(["config", "user.email", email]);
  git(["config", "commit.gpgsign", "false"]);
  git(["checkout", "-q", "-b", branch]);
  return (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

export function writeFile(dir, rel, content) {
  const full = path.join(dir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

export const CONTRACTS_FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "contracts",
  "fixtures"
);
