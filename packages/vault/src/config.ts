// Load and resolve SitDOWN config. Fail-soft: a missing config falls back to the
// documented defaults so the package still runs on fixtures without any setup.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Config, EventStore } from "@sitdown/contracts";
import { appHome, resolvePath } from "./paths.js";

export interface ResolvedConfig {
  /** Absolute path to the Markdown vault C writes. */
  vaultPath: string;
  /** Which event backend to use. */
  eventStore: EventStore;
  /** Absolute path to the SQLite event file (sqlite backend only). */
  eventsDbPath: string;
  /** Absolute path to the processed/ dir C reads Digests from. */
  processedDir: string;
  /** Absolute path to the state dir for selective-regen bookkeeping. */
  stateDir: string;
  /** name -> contact handles, from config.people. */
  people: Record<string, string[]>;
}

const DEFAULTS = {
  vault_path: "~/vault",
  event_store: "sqlite" as EventStore,
};

function readConfigFile(): Partial<Config> {
  const configPath = process.env.SITDOWN_CONFIG
    ? resolvePath(process.env.SITDOWN_CONFIG)
    : path.join(appHome(), "config.json");
  try {
    return JSON.parse(readFileSync(configPath, "utf8")) as Partial<Config>;
  } catch {
    // Missing or unreadable config -> defaults. Never block.
    return {};
  }
}

/**
 * Resolve the effective config. Precedence: explicit env override > config.json > default.
 * Env overrides (useful for fixtures and tests):
 *   SITDOWN_VAULT, SITDOWN_EVENTS_DB, SITDOWN_PROCESSED, SITDOWN_EVENT_STORE, SITDOWN_CONFIG, SITDOWN_HOME
 */
export function loadConfig(): ResolvedConfig {
  const home = appHome();
  const file = readConfigFile();

  const vaultPath = resolvePath(
    process.env.SITDOWN_VAULT || file.vault_path || DEFAULTS.vault_path,
  );
  const eventStore = (process.env.SITDOWN_EVENT_STORE ||
    file.event_store ||
    DEFAULTS.event_store) as EventStore;

  // config has no explicit sqlite path; default under the app home (coordinate with D).
  const eventsDbPath = process.env.SITDOWN_EVENTS_DB
    ? resolvePath(process.env.SITDOWN_EVENTS_DB)
    : path.join(home, "events.sqlite");

  const processedDir = process.env.SITDOWN_PROCESSED
    ? resolvePath(process.env.SITDOWN_PROCESSED)
    : path.join(home, "processed");

  const stateDir = path.join(home, "state");

  return {
    vaultPath,
    eventStore,
    eventsDbPath,
    processedDir,
    stateDir,
    people: file.people ?? {},
  };
}
