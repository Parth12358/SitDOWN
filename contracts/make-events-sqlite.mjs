#!/usr/bin/env node
// Build contracts/fixtures/events.sqlite (and events.seed.sql) from events.seed.json.
// Entity = UUIDv5(author, namespace). Dependency-light: UUIDv5 via node:crypto.
// Uses sql.js if installed; otherwise writes only the .sql seed and explains how to get the binary.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(here, "fixtures", "events.seed.json");
const sqlPath = path.join(here, "fixtures", "events.seed.sql");
const dbPath = path.join(here, "fixtures", "events.sqlite");

/** RFC 4122 UUIDv5 (SHA-1). */
function uuidv5(name, namespace) {
  const nsBytes = namespace.replace(/-/g, "").match(/.{2}/g).map((b) => parseInt(b, 16));
  const hash = createHash("sha1");
  hash.update(Buffer.from(nsBytes));
  hash.update(Buffer.from(name, "utf8"));
  const bytes = hash.digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const seed = JSON.parse(readFileSync(seedPath, "utf8"));
const rows = seed.events.map((e) => ({
  entity: uuidv5(e.author, seed.namespace),
  name: e.name,
  value: e.value ?? null,
  ts: e.ts,
}));

const esc = (v) => (v === null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const ddl = `CREATE TABLE IF NOT EXISTS events (
  entity TEXT NOT NULL,
  name   TEXT NOT NULL,
  value  TEXT,
  ts     TEXT NOT NULL
);`;
const inserts = rows
  .map((r) => `INSERT INTO events (entity, name, value, ts) VALUES (${esc(r.entity)}, ${esc(r.name)}, ${esc(r.value)}, ${esc(r.ts)});`)
  .join("\n");
const sql = `${ddl}\n${inserts}\n`;
writeFileSync(sqlPath, sql);
console.log(`wrote ${path.relative(here, sqlPath)} (${rows.length} rows)`);

let sqljs;
try {
  sqljs = (await import("sql.js")).default;
} catch {
  console.log("sql.js not installed — skipping events.sqlite. Run `pnpm add -w sql.js` then `pnpm fixtures:events`,");
  console.log("or load events.seed.sql into any SQLite tool: `sqlite3 events.sqlite < fixtures/events.seed.sql`.");
  process.exit(0);
}
const SQL = await sqljs();
const db = new SQL.Database();
db.run(sql);
const data = Buffer.from(db.export());
writeFileSync(dbPath, data);
console.log(`wrote ${path.relative(here, dbPath)}`);
