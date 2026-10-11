// @sitdown/summarizer — B.
// In:  ~/.sitdown/inbox/sessions/*.json, inbox/commits/*.json, transcript_path
// Out: ~/.sitdown/processed/<source>.json (Digest)
//
// Code owns the recorded, deterministic fields (source, author, feature, date, attribution).
// The LLM owns prose + judgment (headline, summary, decisions, human_interventions).
import type {
  SessionRecord,
  CommitRecord,
  Digest,
  Decision,
  Attribution,
} from "@sitdown/contracts";
import { redactSecrets } from "./secrets.js";
import { loadTranscript, trimTranscript } from "./transcript.js";
import { attributeSession, attributeCommit } from "./attribution.js";
import { deriveFeature } from "./feature.js";
import { validateDigest } from "./schema.js";
import { makeLlm, type Llm } from "./llm.js";

export { redactSecrets } from "./secrets.js";

export type AnyRecord = SessionRecord | CommitRecord;

export interface SummarizeOptions {
  /** Injected LLM (tests pass a mock). Defaults to the cloud backend. */
  llm?: Llm;
  /** All known SessionRecords — used for commit attribution cross-referencing. */
  sessions?: SessionRecord[];
}

function isCommit(r: AnyRecord): r is CommitRecord {
  return "sha" in r;
}

function toKebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "untitled";
}

interface LlmShape {
  headline?: unknown;
  summary?: unknown;
  feature?: unknown;
  decisions?: unknown;
  human_interventions?: unknown;
}

function cleanDecisions(raw: unknown): Decision[] {
  if (!Array.isArray(raw)) return [];
  const out: Decision[] = [];
  for (const d of raw) {
    if (!d || typeof d !== "object") continue;
    const o = d as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title : undefined;
    const chosen = typeof o.chosen === "string" ? o.chosen : undefined;
    const reason = typeof o.reason === "string" ? o.reason : undefined;
    if (!title || !chosen || !reason) continue;
    const slugSrc = typeof o.slug === "string" && o.slug ? o.slug : title;
    const decision: Decision = { slug: toKebab(slugSrc), title, chosen, reason };
    if (Array.isArray(o.rejected)) {
      const rejected = o.rejected.filter((x): x is string => typeof x === "string");
      if (rejected.length) decision.rejected = rejected;
    }
    out.push(decision);
  }
  return out;
}

function coerceInterventions(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function buildContext(record: AnyRecord): string {
  if (isCommit(record)) {
    const files = record.files
      .map(
        (f) =>
          `  - ${f.file} (added ${JSON.stringify(f.added_lines)}, removed ${JSON.stringify(
            f.removed_lines,
          )})`,
      )
      .join("\n");
    return [
      "Kind: git commit",
      `Repo: ${record.repo}`,
      `Branch: ${record.branch}`,
      `Author: ${record.author}`,
      `Message: ${redactSecrets(record.message)}`,
      `Co-authors: ${(record.co_authors ?? []).join(", ") || "(none)"}`,
      "Files changed:",
      files,
    ].join("\n");
  }
  const prompts = record.prompts.map((p, i) => `  ${i + 1}. ${redactSecrets(p)}`).join("\n");
  const edits = record.edits
    .map((e) => `  - ${e.file} (added ${JSON.stringify(e.added_lines)})`)
    .join("\n");
  const transcript = redactSecrets(trimTranscript(loadTranscript(record.transcript_path)));
  return [
    `Kind: ${record.agent} session`,
    `Repo: ${record.repo}`,
    `Branch: ${record.branch}`,
    `Author: ${record.author}`,
    "User prompts (in order):",
    prompts,
    "File edits:",
    edits,
    "Transcript (trimmed):",
    transcript,
  ].join("\n");
}

function buildPrompt(record: AnyRecord): string {
  return [
    `Summarize this coding ${isCommit(record) ? "commit" : "session"} into a documentation digest.`,
    "",
    "Return ONLY a JSON object with exactly these keys:",
    '  "headline": string, <= 80 chars — what was accomplished.',
    '  "summary": string, 1-3 sentences. Include approaches the agent tried that the user rejected, and why.',
    '  "feature": string — short lowercase feature-area slug.',
    '  "decisions": array of { "slug": kebab-case, "title", "chosen", "rejected": string[], "reason" }. Use [] if none. Include a decision when the user steered a choice or an alternative was rejected.',
    '  "human_interventions": integer — count of user messages that corrected, rejected, or redirected the agent mid-session.',
    "",
    "Context:",
    buildContext(record),
  ].join("\n");
}

function identity(record: AnyRecord): {
  source: string;
  author: string;
  date: string;
  branch: string;
  files: string[];
} {
  if (isCommit(record)) {
    return {
      source: `commit:${record.sha}`,
      author: record.author,
      date: record.at.slice(0, 10),
      branch: record.branch,
      files: record.files.map((f) => f.file),
    };
  }
  return {
    source: `session:${record.id}`,
    author: record.author,
    date: record.started_at.slice(0, 10),
    branch: record.branch,
    files: record.edits.map((e) => e.file),
  };
}

function fallbackText(record: AnyRecord): { headline: string; summary: string } {
  if (isCommit(record)) {
    const h = record.message.split("\n")[0].slice(0, 80) || "Commit";
    return { headline: h, summary: redactSecrets(record.message) };
  }
  const first = record.prompts[0] ?? "Coding session";
  return { headline: first.slice(0, 80), summary: redactSecrets(first) };
}

/** Summarize one record into a Digest. Exported so others can call it directly (PRD-B). */
export async function summarize(record: AnyRecord, opts: SummarizeOptions = {}): Promise<Digest> {
  const llm = opts.llm ?? makeLlm("cloud");
  const id = identity(record);
  const attribution: Attribution[] = isCommit(record)
    ? attributeCommit(record, opts.sessions ?? [])
    : attributeSession(record);
  const codeFeature = deriveFeature(id.branch, id.files);

  const prompt = buildPrompt(record);

  // Ask the LLM for strict JSON; validate the merged digest; retry once; then fall back.
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = (await llm.completeJson(prompt)) as LlmShape;
      const headline = typeof raw.headline === "string" ? raw.headline : "";
      const summary = typeof raw.summary === "string" ? raw.summary : "";
      const llmFeature = typeof raw.feature === "string" ? raw.feature : undefined;
      if (!headline || !summary) {
        lastError = "LLM omitted headline/summary";
        continue;
      }
      const digest: Digest = {
        source: id.source,
        author: id.author,
        feature: codeFeature ?? llmFeature ?? "unknown",
        date: id.date,
        headline,
        summary,
        decisions: cleanDecisions(raw.decisions),
        attribution,
        human_interventions: coerceInterventions(raw.human_interventions),
      };
      const { valid, errors } = validateDigest(digest);
      if (valid) return digest;
      lastError = errors.join("; ");
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  // Second failure: minimal Digest (headline + summary synthesized), plus recorded attribution.
  const { headline, summary } = fallbackText(record);
  const digest: Digest = {
    source: id.source,
    author: id.author,
    feature: codeFeature ?? "unknown",
    date: id.date,
    headline,
    summary: `${summary} (auto-summary; LLM unavailable: ${lastError})`.slice(0, 500),
    attribution,
  };
  return digest;
}
