// Event adapter: one interface, two backends (Keewano REST / SQLite via sql.js).
import type { SitdownEvent } from "@sitdown/contracts";
import { loadConfig } from "./config.js";
import { KeewanoSink } from "./events/keewano.js";
import { SqliteSink } from "./events/sqlite.js";

export interface EventSink {
  emit(author: string, event: SitdownEvent, ts: string): Promise<void>;
  flush?(): Promise<void>;
}

export interface EventSinkOptions {
  /** SQLite db path (sqlite backend). Defaults to the configured events db. */
  dbPath?: string;
}

/**
 * Create an event sink for the given backend.
 * - "sqlite": writes to a local sql.js database (default db path from config).
 * - "keewano": posts to Keewano's REST ingress (needs KEEWANO_API_KEY/PAT).
 */
export function makeEventSink(
  backend: "keewano" | "sqlite",
  opts: EventSinkOptions = {},
): EventSink {
  if (backend === "sqlite") {
    // sql.js (WASM) is only loaded lazily inside SqliteSink.init(), not on construction.
    return new SqliteSink(opts.dbPath ?? loadConfig().eventsDbPath);
  }
  return new KeewanoSink();
}

/** installId entity = UUIDv5(author, namespace). Namespace matches the fixtures. */
export { ENTITY_NAMESPACE, entityFor, uuidv5 } from "./events/entity.js";
export { eventsForDigest } from "./events/map.js";
export type { TimedEvent } from "./events/map.js";
