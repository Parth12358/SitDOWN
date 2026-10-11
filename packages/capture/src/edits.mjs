// Turn parser editOps into SessionRecord `edits`: [{ file, added_lines: [[start,end],...] }].
//
// Line-range strategy (ranges are best-effort — they are the signal B uses for attribution,
// not a guarantee):
//   • Write      -> [[1, lineCount(content)]]
//   • Edit       -> locate new_string in the on-disk file, emit its 1-based inclusive range;
//                   fall back to [[1, lineCount(new_string)]] when not found/unreadable.
//   • MultiEdit  -> one range per sub-edit, same rule.
//   • apply_patch-> [[1, addedLineCount]] (Codex positions are not reliably recoverable).
//
// File paths are stored RELATIVE to the session cwd when possible, so they line up with the
// repo-relative paths a CommitRecord carries (B joins the two on file + line range).
import { readFileSync } from "node:fs";
import path from "node:path";
import { countLines } from "./util.mjs";

/** 1-based inclusive line range of `needle` within `text`, or null if absent. */
function locateRange(text, needle) {
  if (typeof text !== "string" || typeof needle !== "string" || needle.length === 0) return null;
  const idx = text.indexOf(needle);
  if (idx < 0) return null;
  const startLine = text.slice(0, idx).split("\n").length; // 1-based
  const span = Math.max(1, countLines(needle));
  return [startLine, startLine + span - 1];
}

function rangeFromCount(n) {
  const end = Math.max(1, n);
  return [1, end];
}

/**
 * @param {Array} editOps  from the parsers
 * @param {{ cwd?: string|null, locate?: boolean }} [opts]
 *   cwd: session working dir, used to resolve+relativize paths; locate: read on-disk files for
 *   exact Edit ranges (true at hook time; pass false for pure offline parsing).
 * @returns {Array<{ file: string, added_lines: number[][] }>}
 */
export function buildEdits(editOps, { cwd = null, locate = true } = {}) {
  const byFile = new Map(); // recordFile -> number[][]

  const add = (recordFile, range) => {
    if (!range) return;
    const list = byFile.get(recordFile) ?? [];
    // Dedupe identical ranges (MultiEdit of the same hunk, repeated Writes).
    if (!list.some((r) => r[0] === range[0] && r[1] === range[1])) list.push(range);
    byFile.set(recordFile, list);
  };

  for (const op of editOps) {
    if (!op?.file) continue;
    const abs = path.isAbsolute(op.file) ? op.file : cwd ? path.join(cwd, op.file) : null;
    const recordFile = relativize(op.file, cwd);

    let diskText = null;
    const readDisk = () => {
      if (diskText !== null) return diskText;
      if (locate && abs) {
        try {
          diskText = readFileSync(abs, "utf8");
        } catch {
          diskText = "";
        }
      } else {
        diskText = "";
      }
      return diskText;
    };

    if (op.tool === "Write") {
      add(recordFile, rangeFromCount(countLines(op.content ?? "")));
    } else if (op.tool === "Edit") {
      add(recordFile, locateRange(readDisk(), op.new_string) ?? rangeFromCount(countLines(op.new_string ?? "")));
    } else if (op.tool === "MultiEdit") {
      for (const e of op.multi ?? []) {
        add(recordFile, locateRange(readDisk(), e.new_string) ?? rangeFromCount(countLines(e.new_string ?? "")));
      }
    } else if (op.tool === "apply_patch") {
      add(recordFile, rangeFromCount(op.addedLineCount ?? 0));
    }
  }

  return [...byFile.entries()].map(([file, added_lines]) => ({
    file,
    added_lines: added_lines.sort((a, b) => a[0] - b[0]),
  }));
}

/** Path relative to cwd (forward-slashed) when under it; otherwise the original string. */
export function relativize(file, cwd) {
  if (!cwd) return file;
  const abs = path.isAbsolute(file) ? file : path.join(cwd, file);
  const rel = path.relative(cwd, abs);
  if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
    return rel.split(path.sep).join("/");
  }
  return file;
}
