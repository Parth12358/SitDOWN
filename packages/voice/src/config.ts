// @sitdown/voice — E. Load ~/.sitdown/config.json and resolve attendees to phone numbers.
// Config shape mirrors contracts/schemas/config.schema.json (contracts are read-only).
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type EventStore = "keewano" | "sqlite";
export type LlmBackend = "cloud" | "ollama";

/** ~/.sitdown/config.json — mirror of @sitdown/contracts Config. */
export interface Config {
  vault_path: string;
  event_store: EventStore;
  llm: LlmBackend;
  /** author slug -> list of identifiers (emails, phone numbers). */
  people?: Record<string, string[]>;
}

/** Expand a leading `~` to the user's home directory, cross-platform. */
export function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

/** Default config path: ~/.sitdown/config.json (override with SITDOWN_CONFIG). */
export function configPath(): string {
  return process.env.SITDOWN_CONFIG
    ? expandHome(process.env.SITDOWN_CONFIG)
    : path.join(os.homedir(), ".sitdown", "config.json");
}

/**
 * Load config from disk. Returns a minimal default if the file is missing so the
 * voice tool still runs (mock mode) without a configured machine.
 */
export async function loadConfig(): Promise<Config> {
  const file = configPath();
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Config;
    return parsed;
  } catch {
    return { vault_path: "~/vault", event_store: "sqlite", llm: "cloud", people: {} };
  }
}

/** True if a string looks like an E.164-ish phone number (not an email). */
export function looksLikePhone(id: string): boolean {
  return /^\+?[0-9][0-9\s().-]{5,}$/.test(id) && !id.includes("@");
}

/** First phone-like identifier for an attendee slug, or undefined. */
export function resolveAttendeePhone(config: Config, slug: string): string | undefined {
  const ids = config.people?.[slug] ?? [];
  return ids.find(looksLikePhone);
}

/** Resolve every attendee to a phone number; reports which slugs are missing one. */
export function resolveAttendees(
  config: Config,
  slugs: string[],
): { resolved: Array<{ slug: string; phone: string }>; missing: string[] } {
  const resolved: Array<{ slug: string; phone: string }> = [];
  const missing: string[] = [];
  for (const slug of slugs) {
    const phone = resolveAttendeePhone(config, slug);
    if (phone) resolved.push({ slug, phone });
    else missing.push(slug);
  }
  return { resolved, missing };
}
