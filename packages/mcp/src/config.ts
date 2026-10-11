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
  /** Central (team) vault: features, decisions, team daily, shareable people index. */
  centralVault: string;
  /** Base dir holding per-person vaults; a person's vault is <vaultsRoot>/<author>. */
  vaultsRoot: string;
  /** Resolve a person's own vault (their daily log + private me.md). */
  personVault: (author: string) => string;
  eventStore: EventStore;
  /** Absolute path to the SQLite event store (sqlite backend only). */
  eventsDbPath: string;
  /** author slug -> identifiers (emails, phones). */
  people: Record<string, string[]>;
  /** true when falling back to contracts/fixtures (dev / standalone). */
  usingFixtures: boolean;
}

function personSlug(author: string): string {
  return author.replace(/[^A-Za-z0-9._-]/g, "_") || "unknown";
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

  // Per-person + central vault resolution. Precedence: env > config > fixtures.
  const vaultsRoot = process.env.SITDOWN_VAULTS_ROOT
    ? expandHome(process.env.SITDOWN_VAULTS_ROOT)
    : raw.vaults_root
      ? expandHome(raw.vaults_root)
      : path.join(home, "vaults");
  let centralVault = process.env.SITDOWN_CENTRAL_VAULT
    ? expandHome(process.env.SITDOWN_CENTRAL_VAULT)
    : process.env.SITDOWN_VAULT_PATH // legacy alias
      ? expandHome(process.env.SITDOWN_VAULT_PATH)
      : raw.central_vault
        ? expandHome(raw.central_vault)
        : path.join(vaultsRoot, "central");
  let personRoot = vaultsRoot;
  let usingFixtures = false;
  if (!existsSync(centralVault)) {
    centralVault = path.join(fixturesDir, "vault", "central");
    personRoot = path.join(fixturesDir, "vault");
    usingFixtures = true;
  }
  const personVault = (author: string): string => path.join(personRoot, personSlug(author));

  const eventStore: EventStore = raw.event_store ?? "sqlite";

  // SQLite event store path: env > ~/.sitdown/events.sqlite > fixtures.
  let eventsDbPath = process.env.SITDOWN_EVENTS_DB
    ? expandHome(process.env.SITDOWN_EVENTS_DB)
    : path.join(home, "events.sqlite");
  if (!process.env.SITDOWN_EVENTS_DB && !existsSync(eventsDbPath)) {
    eventsDbPath = path.join(fixturesDir, "events.sqlite");
  }

  return {
    centralVault,
    vaultsRoot,
    personVault,
    eventStore,
    eventsDbPath,
    people: raw.people ?? { sam: ["sam@example.com"], alex: ["alex@example.com"] },
    usingFixtures,
  };
}
