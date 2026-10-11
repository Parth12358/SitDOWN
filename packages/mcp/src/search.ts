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

// Function/question words carry no topical signal. Dropping them (and matching whole tokens, not
// substrings) stops unanswerable queries like "How is billing calculated?" from matching the "is"
// inside "decision" and returning a spurious hit instead of an honest no-match.
const STOPWORDS = new Set([
  "what", "how", "why", "who", "whom", "whose", "when", "where", "which",
  "the", "a", "an", "is", "are", "was", "were", "am", "be", "been", "being",
  "do", "does", "did", "done", "we", "our", "ours", "us", "i", "you", "your",
  "they", "them", "their", "it", "its", "he", "she", "of", "to", "in", "on",
  "at", "for", "and", "or", "but", "with", "from", "by", "as", "this", "that",
  "these", "those", "there", "here", "about", "into", "have", "has", "had",
  "use", "used", "using", "uses", "do", "doing",
]);

function queryTerms(query: string): string[] {
  return [...new Set(tokenize(query))].filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Rank notes against a free-text query. Returns the top `limit` visible hits. */
export function searchNotes(vaultPath: string, query: string, requester?: string, limit = 5): SearchHit[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];

  const notes: Note[] = ALL_TYPES.flatMap((t) => readNotes(vaultPath, t)).filter(
    (n) => n.type !== "person" || personVisible(n, requester),
  );

  const maxTs = notes.reduce((m, n) => (n.updated && n.updated > m ? n.updated : m), "");
  const maxMs = maxTs ? Date.parse(maxTs) : Date.now();

  const hits: SearchHit[] = [];
  for (const note of notes) {
    const hayText = `${note.title}\n${JSON.stringify(note.frontmatter)}\n${note.body}`;
    const counts = new Map<string, number>();
    for (const tk of tokenize(hayText)) counts.set(tk, (counts.get(tk) ?? 0) + 1);
    const titleTokens = new Set(tokenize(note.title));
    let matchScore = 0;
    for (const term of terms) {
      const count = counts.get(term) ?? 0; // whole-token match, not substring
      if (count === 0) continue;
      const inTitle = titleTokens.has(term) ? 3 : 0; // title hits are worth more
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
