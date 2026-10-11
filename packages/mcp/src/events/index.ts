// @sitdown/mcp — event store abstraction. SQLite is primary; Keewano is best-effort.
import type { SitdownEvent } from "@sitdown/contracts";
import type { ResolvedConfig } from "../config.js";
import { SqliteEventStore } from "./sqlite.js";
import { KeewanoEventStore } from "./keewano.js";

export interface RankedAuthor {
  author: string;
  entity: string;
  /** recency-weighted activity score for the feature */
  score: number;
  /** ISO ts of the author's most recent feature-relevant event */
  lastActive: string;
  featureTouches: number;
  commits: number;
}

export interface OpenThread {
  topic: string;
  ts: string;
}

export interface EventStore {
  readonly kind: string;
  /** People ranked by recent FeatureTouched + CommitMade activity on `feature`. */
  authorsRanked(feature: string, people: Record<string, string[]>): Promise<RankedAuthor[]>;
  /** Unanswered questions (QuestionAsked without a later AnswerFound=true). */
  openThreads(feature?: string): Promise<OpenThread[]>;
  /** Append events for an author (entity = UUIDv5(author)). Used by log_unanswered / record_decision. */
  append(author: string | undefined, events: SitdownEvent[]): Promise<void>;
}

/**
 * Build the configured event store. In keewano mode we dual-write to Keewano's
 * ingress but read from the local SQLite mirror (Keewano read APIs are not wired
 * in this build — see README "What's mocked"). Falls back to SQLite on any error.
 */
export function createEventStore(cfg: ResolvedConfig): EventStore {
  const sqlite = new SqliteEventStore(cfg.eventsDbPath);
  if (cfg.eventStore === "keewano" && process.env.KEEWANO_PAT) {
    try {
      return new KeewanoEventStore(sqlite);
    } catch (e) {
      console.error(`[sitdown-mcp] keewano unavailable, using sqlite: ${(e as Error).message}`);
    }
  }
  return sqlite;
}
