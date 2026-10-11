// @sitdown/mcp — keyword search over note text + frontmatter, ranked by match and recency.
import type { NoteType } from "@sitdown/contracts";
import { type Note, personVisible, readNotes } from "./vault.js";

export interface SearchHit {
  path: string;
  title: string;
  type: NoteType;
  snippet: string;
  sources: string[];
  score: number;
}

const ALL_TYPES: NoteType[] = ["decision", "feature", "daily", "person"];

function tokenize(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** Rank notes against a free-text query. Returns the top `limit` visible hits. */
export function searchNotes(vaultPath: string, query: string, requester?: string, limit = 5): SearchHit[] {
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0) return [];

  const notes: Note[] = ALL_TYPES.flatMap((t) => readNotes(vaultPath, t)).filter(
    (n) => n.type !== "person" || personVisible(n, requester),
  );

  const maxTs = notes.reduce((m, n) => (n.updated && n.updated > m ? n.updated : m), "");
  const maxMs = maxTs ? Date.parse(maxTs) : Date.now();

  const hits: SearchHit[] = [];
  for (const note of notes) {
    const haystack = `${note.title}\n${JSON.stringify(note.frontmatter)}\n${note.body}`.toLowerCase();
    let matchScore = 0;
    for (const term of terms) {
      const count = occurrences(haystack, term);
      if (count === 0) continue;
      // Title hits are worth more.
      const inTitle = note.title.toLowerCase().includes(term) ? 3 : 0;
      matchScore += count + inTitle;
    }
    if (matchScore === 0) continue;

    const ageDays = note.updated ? (maxMs - Date.parse(note.updated)) / 86_400_000 : 30;
    const recency = Math.pow(0.5, Math.max(0, ageDays) / 30);
    const score = matchScore * (0.5 + 0.5 * recency);
    hits.push({
      path: note.relPath,
      title: note.title,
      type: note.type,
      snippet: makeSnippet(note.autoBody || note.body, terms),
      sources: note.sources,
      score,
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

function occurrences(haystack: string, term: string): number {
  let i = 0;
  let n = 0;
  while ((i = haystack.indexOf(term, i)) !== -1) {
    n++;
    i += term.length;
  }
  return n;
}

function makeSnippet(text: string, terms: string[], width = 200): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx !== -1 && (at === -1 || idx < at)) at = idx;
  }
  if (at === -1) return flat.slice(0, width);
  const start = Math.max(0, at - 60);
  const end = Math.min(flat.length, start + width);
  return (start > 0 ? "…" : "") + flat.slice(start, end).trim() + (end < flat.length ? "…" : "");
}
