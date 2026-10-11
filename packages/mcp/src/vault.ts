// @sitdown/mcp — read + parse the Obsidian-compatible Markdown vault C writes.
// Notes are YAML frontmatter + a body wrapped in <!-- auto:start --> / <!-- auto:end -->.
// We never write here (that's C). We respect `private: true` person notes.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { NoteType } from "@sitdown/contracts";

const AUTO_START = "<!-- auto:start -->";
const AUTO_END = "<!-- auto:end -->";

export type Frontmatter = Record<string, string | string[] | boolean>;

export interface Note {
  type: NoteType;
  /** absolute path */
  path: string;
  /** vault-relative path, used in citations (e.g. "decisions/2026-10-11-refund-idempotency.md") */
  relPath: string;
  /** filename without extension */
  name: string;
  /** decisions only: filename with the leading YYYY-MM-DD- stripped */
  slug?: string;
  frontmatter: Frontmatter;
  /** first `# ` heading, or the filename */
  title: string;
  /** text between the auto markers (the generated content) */
  autoBody: string;
  /** full body after frontmatter */
  body: string;
  /** frontmatter.updated or .date if present */
  updated?: string;
  /** parsed frontmatter.sources (session / commit ids) */
  sources: string[];
}

/** Minimal frontmatter parser: scalars, booleans, and `[a, b]` arrays. No nesting. */
export function parseFrontmatter(block: string): Frontmatter {
  const fm: Frontmatter = {};
  for (const line of block.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let rest = m[2].trim();
    if (rest === "") continue;
    if (rest === "true" || rest === "false") {
      fm[key] = rest === "true";
      continue;
    }
    if (rest.startsWith("[") && rest.endsWith("]")) {
      fm[key] = rest
        .slice(1, -1)
        .split(",")
        .map((s) => unquote(s.trim()))
        .filter((s) => s.length > 0);
      continue;
    }
    fm[key] = unquote(rest);
  }
  return fm;
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function splitFrontmatter(raw: string): { fm: string; body: string } {
  if (raw.startsWith("---")) {
    const end = raw.indexOf("\n---", 3);
    if (end !== -1) {
      const fm = raw.slice(raw.indexOf("\n") + 1, end);
      const afterEnd = raw.indexOf("\n", end + 1);
      const body = afterEnd === -1 ? "" : raw.slice(afterEnd + 1);
      return { fm, body };
    }
  }
  return { fm: "", body: raw };
}

function extractAuto(body: string): string {
  const start = body.indexOf(AUTO_START);
  const end = body.indexOf(AUTO_END);
  if (start !== -1 && end !== -1 && end > start) {
    return body.slice(start + AUTO_START.length, end).trim();
  }
  return body.trim();
}

const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})-/;

export function parseNote(absPath: string, type: NoteType, vaultPath: string): Note {
  const raw = readFileSync(absPath, "utf8");
  const { fm, body } = splitFrontmatter(raw);
  const frontmatter = parseFrontmatter(fm);
  const name = path.basename(absPath, ".md");
  const headingMatch = /^#\s+(.+)$/m.exec(body);
  const title = headingMatch ? headingMatch[1].trim() : name;
  const updated =
    (typeof frontmatter.updated === "string" && frontmatter.updated) ||
    (typeof frontmatter.date === "string" && frontmatter.date) ||
    undefined;
  const sources = Array.isArray(frontmatter.sources)
    ? (frontmatter.sources as string[])
    : typeof frontmatter.sources === "string"
      ? [frontmatter.sources]
      : [];
  const slug = type === "decision" ? name.replace(DATE_PREFIX, "") : undefined;
  return {
    type,
    path: absPath,
    relPath: path.relative(vaultPath, absPath).split(path.sep).join("/"),
    name,
    slug,
    frontmatter,
    title,
    autoBody: extractAuto(body),
    body,
    updated,
    sources,
  };
}

const DIR_FOR: Record<NoteType, string> = {
  daily: "daily",
  feature: "features",
  decision: "decisions",
  person: "people",
};

/** Read every note of a type. Missing directories yield []. */
export function readNotes(vaultPath: string, type: NoteType): Note[] {
  const dir = path.join(vaultPath, DIR_FOR[type]);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parseNote(path.join(dir, f), type, vaultPath))
    .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
}

/** A person note is visible only to its own author (private by default). */
export function personVisible(note: Note, requester?: string): boolean {
  const isPrivate = note.frontmatter.private === true;
  if (!isPrivate) return true;
  const author =
    typeof note.frontmatter.author === "string" ? note.frontmatter.author : note.name;
  return !!requester && requester === author;
}

/** The feature a note belongs to (frontmatter.feature, de-wikilinked). */
export function noteFeature(note: Note): string | undefined {
  const f = note.frontmatter.feature;
  if (typeof f !== "string") return note.type === "feature" ? note.name : undefined;
  return f.replace(/\[\[|\]\]/g, "").trim();
}
