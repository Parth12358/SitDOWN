// Install end-of-session capture hooks into each supported agent's config.
//
// ADDITIVE ONLY: we merge a single `Stop` command into the agent's existing hooks and preserve
// every other setting, with a timestamped backup first. We never clobber a config we can't parse,
// and we write NO context-injection / CLAUDE.md / AGENTS.md guidance (SitDOWN is read via MCP, PRD D).
// The ~/.sitdown home + `sitdown` command keep this disjoint from the real Alike's entries.
import { existsSync, readFileSync, copyFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWriteFile } from "../fs-atomic.mjs";
import {
  claudeConfigDir,
  claudeSettingsPath,
  codexHome,
  codexHooksPath,
} from "../paths.mjs";

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "bin", "sitdown.mjs");

/** The command an agent runs at session end. Quoted for paths with spaces. */
export function hookCommand(agent) {
  return `"${process.execPath}" "${BIN}" session-end --agent ${agent}`;
}

/** Is this one of our commands? (idempotency + uninstall both key on the bin path.) */
function isOurs(cmd) {
  return typeof cmd === "string" && cmd.includes(BIN);
}

function readJson(file) {
  if (!existsSync(file)) return { exists: false, value: {} };
  try {
    return { exists: true, value: JSON.parse(readFileSync(file, "utf8")) };
  } catch {
    return { exists: true, value: null }; // unparseable -> never clobber
  }
}

function backup(file) {
  if (!existsSync(file)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = `${file}.sitdown-bak-${stamp}`;
  copyFileSync(file, dest);
  return dest;
}

/**
 * Merge our command into `settings.hooks[event]` (Claude-shaped matcher-group array).
 * Returns the new settings object and whether anything changed.
 */
function mergeHook(settings, event, command) {
  const next = settings && typeof settings === "object" ? { ...settings } : {};
  const hooks = { ...(next.hooks ?? {}) };
  const groups = Array.isArray(hooks[event]) ? hooks[event].map((g) => ({ ...g })) : [];

  for (const g of groups) {
    if (Array.isArray(g.hooks) && g.hooks.some((h) => isOurs(h?.command))) {
      return { settings: next, changed: false }; // already installed
    }
  }
  groups.push({ hooks: [{ type: "command", command }] });
  hooks[event] = groups;
  next.hooks = hooks;
  return { settings: next, changed: true };
}

function removeHook(settings, event) {
  if (!settings?.hooks?.[event]) return { settings, changed: false };
  let changed = false;
  const groups = [];
  for (const g of settings.hooks[event]) {
    const kept = (g.hooks ?? []).filter((h) => !isOurs(h?.command));
    if (kept.length !== (g.hooks ?? []).length) changed = true;
    if (kept.length) groups.push({ ...g, hooks: kept });
  }
  const hooks = { ...settings.hooks };
  if (groups.length) hooks[event] = groups;
  else delete hooks[event];
  return { settings: { ...settings, hooks }, changed };
}

/** One agent's install descriptor. `event` is that agent's session-end event name. */
function agentTargets(home, env) {
  return [
    {
      id: "claude_code",
      label: "Claude Code",
      present: () => existsSync(claudeConfigDir(home, env)),
      file: claudeSettingsPath(home, env),
      event: "Stop",
    },
    {
      id: "codex",
      label: "Codex CLI",
      present: () => existsSync(codexHome(home, env)),
      file: codexHooksPath(home, env),
      event: "Stop",
      // UNVERIFIED: Codex CLI's hook-config format and session-end event name are not
      // vendor-confirmed. We write a best-effort Claude-shaped config; it may not fire. The
      // Codex *transcript parser* is tested and works — only the auto-trigger wiring is unproven.
      experimental: true,
      note: "Codex hook format is unverified; if sessions aren't captured, run `sitdown session-end` manually or capture via the git post-commit hook.",
    },
  ];
}

/** Detected agents and whether our hook is already present. */
export function detectAgents({ home, env } = {}) {
  return agentTargets(home, env).map((t) => {
    const present = t.present();
    const { value } = readJson(t.file);
    const installed = Boolean(
      value?.hooks?.[t.event]?.some((g) => (g.hooks ?? []).some((h) => isOurs(h?.command)))
    );
    return { id: t.id, label: t.label, present, file: t.file, installed, experimental: !!t.experimental };
  });
}

/**
 * Install hooks for every present agent (Claude Code first).
 * @param {{ home?, env?, dryRun?: boolean, agents?: string[] }} [opts]
 */
export function installHooks({ home, env, dryRun = false, agents = null } = {}) {
  const report = [];
  for (const t of agentTargets(home, env)) {
    if (agents && !agents.includes(t.id)) continue;
    if (!t.present()) {
      report.push({ agent: t.id, status: "not-detected", file: t.file });
      continue;
    }
    const { value } = readJson(t.file);
    if (value === null) {
      report.push({ agent: t.id, status: "skipped-unparseable", file: t.file });
      continue;
    }
    const { settings, changed } = mergeHook(value, t.event, hookCommand(t.id));
    if (!changed) {
      report.push({ agent: t.id, status: "already-installed", file: t.file });
      continue;
    }
    if (dryRun) {
      report.push({ agent: t.id, status: t.experimental ? "would-install-experimental" : "would-install", file: t.file, note: t.note });
      continue;
    }
    mkdirSync(path.dirname(t.file), { recursive: true });
    const bak = backup(t.file);
    atomicWriteFile(t.file, `${JSON.stringify(settings, null, 2)}\n`);
    report.push({ agent: t.id, status: t.experimental ? "installed-experimental" : "installed", file: t.file, backup: bak, note: t.note });
  }
  return report;
}

/** Remove our hook entries from every agent config. Leaves all other settings intact. */
export function uninstallHooks({ home, env, dryRun = false } = {}) {
  const report = [];
  for (const t of agentTargets(home, env)) {
    const { exists, value } = readJson(t.file);
    if (!exists || value === null) {
      report.push({ agent: t.id, status: exists ? "skipped-unparseable" : "absent", file: t.file });
      continue;
    }
    const { settings, changed } = removeHook(value, t.event);
    if (!changed) {
      report.push({ agent: t.id, status: "nothing-to-remove", file: t.file });
      continue;
    }
    if (dryRun) {
      report.push({ agent: t.id, status: "would-remove", file: t.file });
      continue;
    }
    const bak = backup(t.file);
    atomicWriteFile(t.file, `${JSON.stringify(settings, null, 2)}\n`);
    report.push({ agent: t.id, status: "removed", file: t.file, backup: bak });
  }
  return report;
}

export { BIN };
