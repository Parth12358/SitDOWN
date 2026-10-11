// Minimal YAML frontmatter read / merge / serialize.
// Dependency-light on purpose: SitDOWN frontmatter only uses plain scalars, dates,
// inline string arrays, and booleans. We own a fixed set of keys; any extra keys a
// human adds are preserved untouched.

export type FmValue = string | string[] | boolean;
/** Ordered key -> value. Insertion order is preserved on serialize (JS Map guarantees it). */
export type FrontMatter = Map<string, FmValue>;

function stripQuotes(s: string): string {
  const t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function parseScalar(raw: string): FmValue {
  const t = raw.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (t.startsWith("[") && t.endsWith("]")) {
    const inner = t.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((x) => stripQuotes(x));
  }
  return stripQuotes(t);
}

/**
 * Split a note into its frontmatter and the rest (body). If there is no `---` block,
 * returns an empty FrontMatter and the whole text as body.
 */
export function parseFrontMatter(text: string): { fm: FrontMatter; body: string } {
  const fm: FrontMatter = new Map();
  if (!text.startsWith("---")) return { fm, body: text };

  const lines = text.split("\n");
  // first line is `---`; find the closing `---`.
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return { fm, body: text }; // malformed; treat as no frontmatter

  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const rest = line.slice(idx + 1);
    fm.set(key, parseScalar(rest));
  }

  const body = lines.slice(end + 1).join("\n").replace(/^\n/, "");
  return { fm, body };
}

/**
 * A scalar needs quoting only if it would otherwise be misread as YAML. A bare `:` inside
 * a token (e.g. `session:claude:abc123`) is valid in flow context, so we do NOT quote on it
 * — only on a colon that ends a key (`: ` or trailing), flow indicators, embedded quotes,
 * a comment-starting ` #`, a leading indicator char, or surrounding/empty whitespace.
 */
function needsQuote(s: string): boolean {
  if (s === "" || s.trim() !== s) return true;
  if (/[[\]{},]/.test(s)) return true; // flow collection indicators
  if (/:(\s|$)/.test(s)) return true; // colon that would terminate a key
  if (/\s#/.test(s)) return true; // start of a comment
  if (/["']/.test(s)) return true; // embedded quotes
  if (/^[-?:!&*>|%@`]/.test(s)) return true; // leading YAML indicator
  return false;
}

function serializeScalar(v: string): string {
  return needsQuote(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

function serializeValue(v: FmValue): string {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return `[${v.map((x) => serializeScalar(x)).join(", ")}]`;
  return serializeScalar(v);
}

/** Render a FrontMatter back into a `---`-delimited block (with trailing newline). */
export function serializeFrontMatter(fm: FrontMatter): string {
  const lines = ["---"];
  for (const [k, v] of fm) lines.push(`${k}: ${serializeValue(v)}`);
  lines.push("---");
  return lines.join("\n") + "\n";
}

/**
 * Merge generated frontmatter into existing, in place, preserving:
 *  - existing key order (generated keys that already exist keep their position),
 *  - any human-added keys not in `generated`.
 * Tool-owned keys in `generated` always win on value.
 */
export function mergeFrontMatter(existing: FrontMatter, generated: FrontMatter): FrontMatter {
  const out: FrontMatter = new Map(existing);
  for (const [k, v] of generated) out.set(k, v);
  return out;
}
