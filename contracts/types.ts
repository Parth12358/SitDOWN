// SitDOWN shared contract types. Mirror of contracts/schemas/*.json.
// Owned by the human. Agents read only — import via relative path, do not edit.

/** Inclusive [start, end] line range, 1-based. */
export type LineRange = [number, number];

export type AgentKind =
  | "claude_code"
  | "codex"
  | "cursor"
  | "windsurf"
  | "zed"
  | "other";

export interface SessionEdit {
  file: string;
  added_lines: LineRange[];
}

/** Written by A (capture) to ~/.sitdown/inbox/sessions/<id>.json */
export interface SessionRecord {
  id: string; // e.g. "claude:abc123"
  agent: AgentKind;
  author: string;
  repo: string;
  branch: string;
  cwd: string;
  started_at: string; // ISO 8601
  ended_at: string; // ISO 8601
  prompts: string[];
  edits: SessionEdit[];
  transcript_path: string;
}

export interface CommitFile {
  file: string;
  added_lines: LineRange[];
  removed_lines: LineRange[];
}

/** Written by A (capture) to ~/.sitdown/inbox/commits/<sha>.json */
export interface CommitRecord {
  sha: string;
  author: string;
  repo: string;
  branch: string;
  message: string;
  at: string; // ISO 8601
  files: CommitFile[];
  co_authors?: string[];
}

export type AttributionLabel =
  | "human"
  | "autocomplete"
  | "agent"
  | "agent_edited"
  | "human_refactored_by_agent"
  | "pasted";

export interface Decision {
  slug: string; // kebab-case, stable
  title: string;
  chosen: string;
  rejected?: string[];
  reason: string;
}

export interface Attribution {
  file: string;
  lines: LineRange;
  label: AttributionLabel;
}

/** Written by B (summarizer) to ~/.sitdown/processed/<source>.json */
export interface Digest {
  source: string; // "session:claude:abc123" | "commit:9f2e1d"
  author: string;
  feature: string;
  date: string; // YYYY-MM-DD
  headline: string;
  summary: string;
  decisions?: Decision[];
  attribution?: Attribution[];
  human_interventions?: number;
}

export type EventStore = "keewano" | "sqlite";
export type LlmBackend = "claude_cli" | "cloud" | "ollama";

/** ~/.sitdown/config.json */
export interface Config {
  vault_path: string;
  event_store: EventStore;
  llm: LlmBackend;
  people?: Record<string, string[]>;
}

export type NoteType = "daily" | "feature" | "decision" | "person";

/** Typed events written by C and read by D. Categories and numbers only. */
export type SitdownEvent =
  | { name: "FeatureTouched"; value: string }
  | { name: "AgentSession"; value: string }
  | { name: "CommitMade"; value: number }
  | { name: "AuthorType"; value: AttributionLabel }
  | { name: "DecisionRecorded"; value: string }
  | { name: "HumanIntervened" }
  | { name: "QuestionAsked"; value: string }
  | { name: "AnswerFound"; value: boolean }
  | { name: "AnswerLatencyMs"; value: number }
  | { name: "StandupMinutes"; value: number };
