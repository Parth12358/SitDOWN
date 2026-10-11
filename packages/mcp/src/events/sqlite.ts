// @sitdown/mcp — SQLite event store via sql.js (pure JS; works on Windows).
// Table: events(entity TEXT, name TEXT, value TEXT, ts TEXT). value is always TEXT.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { Database, SqlJsStatic } from "sql.js";
import type { SitdownEvent } from "@sitdown/contracts";
import { uuidv5 } from "../uuid.js";
import type { EventStore, OpenThread, RankedAuthor } from "./index.js";

const require = createRequire(import.meta.url);

let SQLP: Promise<SqlJsStatic> | null = null;
function getSql(): Promise<SqlJsStatic> {
  if (!SQLP) {
    const initSqlJs = require("sql.js") as (opts?: { locateFile?: (f: string) => string }) => Promise<SqlJsStatic>;
    SQLP = initSqlJs({ locateFile: (f: string) => require.resolve(`sql.js/dist/${f}`) });
  }
  return SQLP;
}

interface Row {
  entity: string;
  name: string;
  value: string | null;
  ts: string;
}

const DDL = `CREATE TABLE IF NOT EXISTS events (
  entity TEXT NOT NULL,
  name   TEXT NOT NULL,
  value  TEXT,
  ts     TEXT NOT NULL
);`;

export class SqliteEventStore implements EventStore {
  readonly kind = "sqlite";
  constructor(private readonly dbPath: string) {}

  private async open(): Promise<Database> {
    const SQL = await getSql();
    const db = existsSync(this.dbPath) ? new SQL.Database(readFileSync(this.dbPath)) : new SQL.Database();
    db.run(DDL);
    return db;
  }

  private async rows(): Promise<Row[]> {
    const db = await this.open();
    try {
      const res = db.exec("SELECT entity, name, value, ts FROM events ORDER BY ts ASC");
      if (res.length === 0) return [];
      return res[0].values.map((v) => ({
        entity: String(v[0]),
        name: String(v[1]),
        value: v[2] === null ? null : String(v[2]),
        ts: String(v[3]),
      }));
    } finally {
      db.close();
    }
  }

  async authorsRanked(feature: string, people: Record<string, string[]>): Promise<RankedAuthor[]> {
    const rows = await this.rows();
    if (rows.length === 0) return [];

    // entity -> author, for every known author.
    const entityToAuthor = new Map<string, string>();
    for (const author of Object.keys(people)) entityToAuthor.set(uuidv5(author), author);

    // Recency is measured relative to the newest event in the store (deterministic).
    const maxTs = rows.reduce((m, r) => (r.ts > m ? r.ts : m), rows[0].ts);
    const maxMs = Date.parse(maxTs);
    const HALF_LIFE_DAYS = 14;
    const recency = (ts: string): number => {
      const ageDays = (maxMs - Date.parse(ts)) / 86_400_000;
      return Math.pow(0.5, Math.max(0, ageDays) / HALF_LIFE_DAYS);
    };

    // Per entity, walk events in ts order; attribute CommitMade to the current feature.
    const byEntity = new Map<string, Row[]>();
    for (const r of rows) {
      const arr = byEntity.get(r.entity) ?? [];
      arr.push(r);
      byEntity.set(r.entity, arr);
    }

    const ranked: RankedAuthor[] = [];
    for (const [entity, evts] of byEntity) {
      const author = entityToAuthor.get(entity) ?? entity;
      let current: string | null = null;
      let score = 0;
      let touches = 0;
      let commits = 0;
      let lastActive = "";
      for (const e of evts) {
        if (e.name === "FeatureTouched") {
          current = e.value;
          if (e.value === feature) {
            touches++;
            score += 1 * recency(e.ts);
            if (e.ts > lastActive) lastActive = e.ts;
          }
        } else if (e.name === "CommitMade" && current === feature) {
          commits++;
          const lines = Number(e.value ?? 0) || 0;
          score += (2 + Math.min(lines, 200) / 200) * recency(e.ts);
          if (e.ts > lastActive) lastActive = e.ts;
        } else if (current === feature && (e.name === "DecisionRecorded" || e.name === "AgentSession")) {
          score += 0.5 * recency(e.ts);
          if (e.ts > lastActive) lastActive = e.ts;
        }
      }
      if (score > 0) ranked.push({ author, entity, score, lastActive, featureTouches: touches, commits });
    }

    ranked.sort((a, b) => b.score - a.score || b.lastActive.localeCompare(a.lastActive));
    return ranked;
  }

  async openThreads(feature?: string): Promise<OpenThread[]> {
    const rows = await this.rows();
    const asked = rows.filter((r) => r.name === "QuestionAsked" && r.value);
    if (asked.length === 0) return [];
    // A topic is resolved if an AnswerFound=true exists at/after its latest QuestionAsked.
    const latestAsk = new Map<string, string>();
    for (const r of asked) {
      const prev = latestAsk.get(r.value as string);
      if (!prev || r.ts > prev) latestAsk.set(r.value as string, r.ts);
    }
    const trueAnswers = rows.filter((r) => r.name === "AnswerFound" && r.value === "true").map((r) => r.ts);
    const open: OpenThread[] = [];
    for (const [topic, ts] of latestAsk) {
      const resolved = trueAnswers.some((a) => a >= ts);
      if (resolved) continue;
      if (feature) {
        const f = feature.toLowerCase();
        const t = topic.toLowerCase();
        if (!t.includes(f) && !f.includes(t)) continue;
      }
      open.push({ topic, ts });
    }
    open.sort((a, b) => b.ts.localeCompare(a.ts));
    return open;
  }

  async append(author: string | undefined, events: SitdownEvent[]): Promise<void> {
    const entity = uuidv5(author ?? "unknown");
    const nowIso = new Date().toISOString();
    const db = await this.open();
    try {
      const stmt = db.prepare("INSERT INTO events (entity, name, value, ts) VALUES (?, ?, ?, ?)");
      for (const ev of events) {
        const value = "value" in ev && ev.value !== undefined ? String((ev as { value: unknown }).value) : null;
        stmt.run([entity, ev.name, value, nowIso]);
      }
      stmt.free();
      mkdirSync(path.dirname(this.dbPath), { recursive: true });
      writeFileSync(this.dbPath, Buffer.from(db.export()));
    } finally {
      db.close();
    }
  }
}
