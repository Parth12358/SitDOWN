// @sitdown/mcp — config loading and path resolution.
// Reads ~/.sitdown/config.json; falls back to contracts/fixtures so D runs standalone.
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Config, EventStore } from "@sitdown/contracts";

const here = path.dirname(fileURLToPath(import.meta.url));
// dist/config.js -> packages/mcp/dist -> mcp -> packages -> repo root
const repoRoot = path.resolve(here, "..", "..", "..");
const fixturesDir = path.join(repoRoot, "contracts", "fixtures");

/** Expand a leading `~` to the user's home directory. */
export function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export interface ResolvedConfig {
  vaultPath: string;
  eventStore: EventStore;
  /** Absolute path to the SQLite event store (sqlite backend only). */
  eventsDbPath: string;
  /** author slug -> identifiers (emails, phones). */
  people: Record<string, string[]>;
  /** true when falling back to contracts/fixtures (dev / standalone). */
  usingFixtures: boolean;
}

/** Path to ~/.sitdown/config.json (honoring SITDOWN_HOME). */
export function configPath(): string {
  const home = process.env.SITDOWN_HOME ?? path.join(os.homedir(), ".sitdown");
  return path.join(home, "config.json");
}

/**
 * Load and resolve configuration. Precedence: explicit env overrides >
 * ~/.sitdown/config.json > contracts/fixtures fallback. Never throws for a
 * missing config — a fresh machine should still answer from fixtures.
 */
export function loadConfig(): ResolvedConfig {
  let raw: Partial<Config> = {};
  const cfgPath = configPath();
  if (existsSync(cfgPath)) {
    try {
      raw = JSON.parse(readFileSync(cfgPath, "utf8")) as Config;
    } catch (e) {
      console.error(`[sitdown-mcp] ignoring unreadable ${cfgPath}: ${(e as Error).message}`);
    }
  }

  const home = process.env.SITDOWN_HOME ?? path.join(os.homedir(), ".sitdown");

  // Vault path: env > config > fixtures.
  let vaultPath = process.env.SITDOWN_VAULT_PATH
    ? expandHome(process.env.SITDOWN_VAULT_PATH)
    : raw.vault_path
      ? expandHome(raw.vault_path)
      : "";
  let usingFixtures = false;
  if (!vaultPath || !existsSync(vaultPath)) {
    vaultPath = path.join(fixturesDir, "vault");
    usingFixtures = true;
  }

  const eventStore: EventStore = raw.event_store ?? "sqlite";

  // SQLite event store path: env > ~/.sitdown/events.sqlite > fixtures.
  let eventsDbPath = process.env.SITDOWN_EVENTS_DB
    ? expandHome(process.env.SITDOWN_EVENTS_DB)
    : path.join(home, "events.sqlite");
  if (!process.env.SITDOWN_EVENTS_DB && !existsSync(eventsDbPath)) {
    eventsDbPath = path.join(fixturesDir, "events.sqlite");
  }

  return {
    vaultPath,
    eventStore,
    eventsDbPath,
    people: raw.people ?? { sam: ["sam@example.com"], alex: ["alex@example.com"] },
    usingFixtures,
  };
}
