// Feature slug derivation (PRD-B): branch name -> most-edited top-level folder -> (LLM fallback).
// Returns undefined when neither heuristic yields anything; the caller then asks the LLM.

const BRANCH_PREFIX = /^(?:feat|feature|fix|bugfix|chore|hotfix|refactor)\/(.+)$/i;

/** `feat/payments` -> `payments`, `feature/auth/login` -> `auth`. */
function fromBranch(branch: string): string | undefined {
  const m = BRANCH_PREFIX.exec(branch.trim());
  if (!m) return undefined;
  const first = m[1].split("/")[0]?.trim();
  return first || undefined;
}

/** Most common top-level directory across edited files, e.g. `src/auth/login.ts` -> `src`. */
function fromFiles(files: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const f of files) {
    const seg = f.split("/").filter(Boolean)[0];
    if (!seg || seg.includes(".")) continue; // skip bare top-level files
    counts.set(seg, (counts.get(seg) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestN = 0;
  for (const [seg, n] of counts) {
    if (n > bestN) {
      best = seg;
      bestN = n;
    }
  }
  return best;
}

/** Best-effort feature slug, or undefined if the LLM should decide. */
export function deriveFeature(branch: string, files: string[]): string | undefined {
  return fromBranch(branch) ?? fromFiles(files);
}
