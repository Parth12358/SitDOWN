// Load ~/.sitdown/config.json and resolve a git identity to an author slug.
// Runtime hot path: node builtins only, best-effort, never throws (capture fails open).
import { readFileSync } from "node:fs";
import { configPath } from "./paths.mjs";

const DEFAULT_CONFIG = { vault_path: "~/vault", event_store: "sqlite", llm: "cloud", people: {} };

/** Read config; on any error return defaults so capture still runs. */
export function loadConfig(file = configPath()) {
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    if (raw && typeof raw === "object") return { ...DEFAULT_CONFIG, ...raw, people: raw.people ?? {} };
  } catch {
    /* missing or malformed config -> defaults */
  }
  return { ...DEFAULT_CONFIG };
}

function slugify(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

/**
 * Resolve an author slug from a git identity via config.people (slug -> [identifiers]).
 * Tries, in order: name/email already equal to a slug; name or email listed under a slug;
 * else a slugified name. Case-insensitive.
 * @param {{ name?: string|null, email?: string|null }} identity
 * @param {Record<string,string[]>} people
 */
export function resolveAuthor(identity, people = {}) {
  const name = identity?.name ?? null;
  const email = identity?.email ?? null;
  const slugs = Object.keys(people);

  // 1. name/email is itself a known slug.
  for (const cand of [name, email].filter(Boolean)) {
    const hit = slugs.find((s) => s.toLowerCase() === String(cand).toLowerCase());
    if (hit) return hit;
  }
  // 2. name/email appears among a slug's identifiers.
  for (const [slug, ids] of Object.entries(people)) {
    const set = new Set((ids ?? []).map((x) => String(x).toLowerCase()));
    if ((name && set.has(name.toLowerCase())) || (email && set.has(email.toLowerCase()))) return slug;
  }
  // 3. fall back to a slug derived from the name (or email local-part).
  if (name) return slugify(name);
  if (email) return slugify(email.split("@")[0]);
  return "unknown";
}
