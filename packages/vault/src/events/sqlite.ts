// SQLite event backend via sql.js (pure JS/WASM — works on Windows, no native bindings).
// Schema matches contracts/make-events-sqlite.mjs exactly: events(entity, name, value, ts),
// value stored as TEXT (numbers/bools stringified; HumanIntervened -> NULL).
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { SitdownEvent } from "@sitdown/contracts";
import { atomicWrite } from "../atomic.js";
import type { EventSink } from "../events.js";
import { entityFor } from "./entity.js";

const require = createRequire(import.meta.url);

const DDL = `CREATE TABLE IF NOT EXISTS events (
  entity TEXT NOT NULL,
  name   TEXT NOT NULL,
  value  TEXT,
  ts     TEXT NOT NULL
);`;

/** Stringify an event value for the TEXT column; HumanIntervened (no value) -> null. */
function valueText(event: SitdownEvent): string | null {
  if (!("value" in event)) return null;
  const v = (event as { value: unknown }).value;
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

export class SqliteSink implements EventSink {
  private readonly dbPath: string;
  private ready: Promise<void> | null = null;
  // sql.js types are loose; keep these as any to avoid a hard type dep.
  private db: any;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  private init(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const initSqlJs = require("sql.js");
      const SQL = await initSqlJs({
        locateFile: (f: string) => require.resolve(`sql.js/dist/${f}`),
      });
      let existing: Buffer | null = null;
      try {
        existing = await readFile(this.dbPath);
      } catch {
        existing = null;
      }
      this.db = existing ? new SQL.Database(new Uint8Array(existing)) : new SQL.Database();
      this.db.run(DDL);
    })();
    return this.ready;
  }

  async emit(author: string, event: SitdownEvent, ts: string): Promise<void> {
    await this.init();
    this.db.run("INSERT INTO events (entity, name, value, ts) VALUES (?, ?, ?, ?);", [
      entityFor(author),
      event.name,
      valueText(event),
      ts,
    ]);
  }

  async flush(): Promise<void> {
    await this.init();
    const data: Uint8Array = this.db.export();
    await atomicWrite(this.dbPath, data);
  }
}
