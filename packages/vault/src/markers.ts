// The safety core: compose a note so that ONLY the text between the auto markers is
// ever regenerated. Frontmatter is tool-managed (merged); everything else in the body —
// the title line and any hand-written prose outside the markers — is preserved byte for byte.
import {
  mergeFrontMatter,
  parseFrontMatter,
  serializeFrontMatter,
  type FrontMatter,
} from "./frontmatter.js";

export const AUTO_START = "<!-- auto:start -->";
export const AUTO_END = "<!-- auto:end -->";

export interface NoteSpec {
  /** Canonical, tool-owned frontmatter for this note. Merged over existing keys. */
  frontMatter: FrontMatter;
  /** The `# ` heading text (without the leading `# `). Used only when creating a note. */
  title: string;
  /** The content that lives between the auto markers (no surrounding newlines). */
  autoBody: string;
}

/**
 * Produce the full note text. `existing` is the current file content (or null for a new note).
 * - If the note already has markers: replace only the text between them; keep head and tail exactly.
 * - If it has none: create them after the title, pushing any existing body below as a human tail.
 */
export function composeNote(existing: string | null, spec: NoteSpec): string {
  const { fm, body } = existing
    ? parseFrontMatter(existing)
    : { fm: new Map() as FrontMatter, body: "" };

  const mergedFm = mergeFrontMatter(fm, spec.frontMatter);
  const fmBlock = serializeFrontMatter(mergedFm);

  const startIdx = body.indexOf(AUTO_START);
  const endIdx = body.indexOf(AUTO_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // Markers present: preserve head (through AUTO_START) and tail (from AUTO_END) exactly.
    const head = body.slice(0, startIdx);
    const tail = body.slice(endIdx + AUTO_END.length);
    const newBody = `${head}${AUTO_START}\n${spec.autoBody}\n${AUTO_END}${tail}`;
    return fmBlock + newBody;
  }

  // No markers. Build a fresh head with the title and insert the auto block.
  const autoBlock = `${AUTO_START}\n${spec.autoBody}\n${AUTO_END}\n`;
  const trimmedBody = body.replace(/^\s+/, "");

  if (!trimmedBody) {
    // Fresh note.
    return `${fmBlock}# ${spec.title}\n\n${autoBlock}`;
  }

  // Existing body with no markers: keep it as human tail. Drop a leading duplicate title line.
  let tail = trimmedBody;
  const firstNl = tail.indexOf("\n");
  const firstLine = (firstNl === -1 ? tail : tail.slice(0, firstNl)).trim();
  if (firstLine === `# ${spec.title}`) {
    tail = firstNl === -1 ? "" : tail.slice(firstNl + 1).replace(/^\s+/, "");
  }
  const tailBlock = tail ? `\n${tail}${tail.endsWith("\n") ? "" : "\n"}` : "";
  return `${fmBlock}# ${spec.title}\n\n${autoBlock}${tailBlock}`;
}
