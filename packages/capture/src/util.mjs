// Small shared helpers. Node builtins only (used at hook hot path).

/**
 * The later of two ISO timestamps. A transcript's end time is its NEWEST record, not its last
 * line — records are not always written in time order. An unparseable candidate never displaces
 * a parseable one. (Lifted from @alikeai/setup parser-codex.mjs, MIT.)
 */
export function newerTimestamp(current, candidate) {
  if (!candidate) return current;
  if (current === null || current === undefined) return candidate;
  const a = Date.parse(current);
  const b = Date.parse(candidate);
  if (Number.isNaN(b)) return current;
  return Number.isNaN(a) || b > a ? candidate : current;
}

/** Count lines in a string (1 for a single non-empty line; 0 for empty). */
export function countLines(text) {
  if (typeof text !== "string" || text.length === 0) return 0;
  // A trailing newline does not add a final empty line to the count.
  const n = text.split("\n").length;
  return text.endsWith("\n") ? n - 1 : n;
}

/** Normalize an ISO-ish timestamp to the Z-suffixed form the schemas expect; null-safe. */
export function toIso(ts) {
  if (!ts) return null;
  const ms = Date.parse(ts);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}
