// Home + inbox paths, and where each supported agent keeps its config and transcripts.
// Build every path with path.join + os.homedir() so it works on Linux, Mac, Windows.
//
// The ~/.sitdown home is OURS and is intentionally distinct from ~/.alike, so SitDOWN runs
// beside the real Alike without touching its config entries.
//
// Agent config/transcript locations and the CLAUDE_CONFIG_DIR / CODEX_HOME env overrides are
// lifted (facts only) from @alikeai/setup paths.mjs (MIT) — the agents relocate their ENTIRE
// config home on those env vars, so honoring them is what keeps install from silently no-op'ing
// (and is what lets the tests point an install at a scratch dir).
import os from "node:os";
import path from "node:path";
import { readdirSync } from "node:fs";

export const APP = "sitdown";

// ── SitDOWN home ──────────────────────────────────────────────────────────────
// SITDOWN_HOME overrides the home location (absolute path only). This keeps tests and sandboxed
// runs fully self-contained — they never have to touch the user's real $HOME.
export const homeDir = () => {
  const override = process.env.SITDOWN_HOME;
  if (typeof override === "string" && override.length > 0 && path.isAbsolute(override)) return override;
  return path.join(os.homedir(), ".sitdown");
};
export const inboxSessions = () => path.join(homeDir(), "inbox", "sessions");
export const inboxCommits = () => path.join(homeDir(), "inbox", "commits");
export const archiveDir = () => path.join(homeDir(), "archive");
export const stateDir = () => path.join(homeDir(), "state");
export const configPath = () => path.join(homeDir(), "config.json");

// ── helpers ─────────────────────────────────────────────────────────────────
/** Expand a leading `~` to the user's home dir. Returns absolute, OS-native paths. */
export function expandHome(p, home = os.homedir()) {
  if (typeof p !== "string" || p.length === 0) return p;
  if (p === "~") return home;
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(home, p.slice(2));
  return p;
}

/** Render an absolute path back with a leading `~` when it is under home (stable across machines). */
export function tildify(p, home = os.homedir()) {
  if (typeof p !== "string") return p;
  const rel = path.relative(home, p);
  if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
    return `~/${rel.split(path.sep).join("/")}`;
  }
  return p;
}

/** Only an absolute env value is honored — the agents refuse relative config dirs. */
function resolveConfigDir(envValue, fallback) {
  if (typeof envValue === "string" && envValue.length > 0 && path.isAbsolute(envValue)) {
    return envValue;
  }
  return fallback;
}

/** Recursively collect every file ending in `suffix` under `dir`. Missing dir -> []. */
export function walkFilesBySuffix(dir, suffix, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFilesBySuffix(full, suffix, out);
    else if (entry.isFile() && entry.name.endsWith(suffix)) out.push(full);
  }
  return out;
}

// ── Claude Code ───────────────────────────────────────────────────────────────
export function claudeConfigDir(home = os.homedir(), env = process.env) {
  return resolveConfigDir(env?.CLAUDE_CONFIG_DIR, path.join(home, ".claude"));
}
/** Claude Code reads USER-LEVEL hooks from the `hooks` key of settings.json. */
export function claudeSettingsPath(home = os.homedir(), env = process.env) {
  return path.join(claudeConfigDir(home, env), "settings.json");
}
export function claudeProjectsRoot(home = os.homedir(), env = process.env) {
  return path.join(claudeConfigDir(home, env), "projects");
}

// ── Codex CLI ───────────────────────────────────────────────────────────────
export function codexHome(home = os.homedir(), env = process.env) {
  return resolveConfigDir(env?.CODEX_HOME, path.join(home, ".codex"));
}
/** Codex auto-discovers hooks at the fixed path ~/.codex/hooks.json. */
export function codexHooksPath(home = os.homedir(), env = process.env) {
  return path.join(codexHome(home, env), "hooks.json");
}
export function codexSessionsRoot(home = os.homedir(), env = process.env) {
  return path.join(codexHome(home, env), "sessions");
}

// ── Cursor (stretch) ──────────────────────────────────────────────────────────
export function cursorHooksPath(home = os.homedir()) {
  return path.join(home, ".cursor", "hooks.json");
}
export function cursorProjectsRoot(home = os.homedir()) {
  return path.join(home, ".cursor", "projects");
}

/** Archived transcript path for a session, e.g. ~/.sitdown/archive/claude/abc123.jsonl */
export function archiveTranscriptPath(agentDir, sessionKey) {
  return path.join(archiveDir(), agentDir, `${sessionKey}.jsonl`);
}
