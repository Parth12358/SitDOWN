// @sitdown/mcp — functional tests against a temp copy of contracts/fixtures.
// We copy fixtures into a temp dir so write tools never touch contracts/.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const fixtures = path.join(repoRoot, "contracts", "fixtures");

// Point config at a disposable copy INSIDE the repo (never touch $HOME or system /tmp).
const tmp = mkdtempSync(path.join(here, ".tmp-"));
cpSync(path.join(fixtures, "vault"), path.join(tmp, "vault"), { recursive: true });
cpSync(path.join(fixtures, "events.sqlite"), path.join(tmp, "events.sqlite"));
process.env.SITDOWN_VAULT_PATH = path.join(tmp, "vault");
process.env.SITDOWN_EVENTS_DB = path.join(tmp, "events.sqlite");

after(() => rmSync(tmp, { recursive: true, force: true }));

let tools, ctx;
before(async () => {
  const { loadConfig } = await import("../dist/config.js");
  const { createEventStore } = await import("../dist/events/index.js");
  tools = await import("../dist/tools.js");
  const cfg = loadConfig();
  ctx = { vaultPath: cfg.vaultPath, cfg, events: createEventStore(cfg) };
});

test("get_brief resolves feature from branch and cites the session", async () => {
  const r = await tools.get_brief({ branch: "feat/payments" }, ctx);
  assert.equal(r.feature, "payments");
  assert.ok(r.decisions.some((d) => d.slug === "refund-idempotency"));
  const refund = r.decisions.find((d) => d.slug === "refund-idempotency");
  assert.match(refund.chosen, /Idempotency-Key/i);
  assert.ok(r.citations.includes("session:claude:abc123"));
  assert.equal(r.who_else[0].author, "sam");
});

test("who_knows ranks the right person per feature", async () => {
  const pay = await tools.who_knows({ feature: "payments" }, ctx);
  assert.equal(pay.people[0].author, "sam");
  const auth = await tools.who_knows({ feature: "auth" }, ctx);
  assert.equal(auth.people[0].author, "alex");
});

test("get_decision by slug and by topic", async () => {
  const bySlug = await tools.get_decision({ slug: "jwt-refresh-rotation" }, ctx);
  assert.equal(bySlug.found, true);
  assert.equal(bySlug.decision.author, "alex");
  const byTopic = await tools.get_decision({ topic: "refund double charge" }, ctx);
  assert.equal(byTopic.decision.slug, "refund-idempotency");
});

test("search_docs finds notes and ranks by match", async () => {
  const r = await tools.search_docs({ query: "idempotency refund" }, ctx);
  assert.equal(r.found, true);
  assert.ok(r.results[0].path.includes("refund-idempotency"));
});

test("private person note gated by requester", async () => {
  const anon = await tools.get_summary({ author: "alex" }, ctx);
  const anonSources = anon.summaries.flatMap((s) => s.sources);
  assert.ok(!anonSources.includes("people/alex.md"), "anon must not see alex's private note");
  const self = await tools.get_summary({ author: "alex", requester: "alex" }, ctx);
  const selfSources = self.summaries.flatMap((s) => s.sources);
  assert.ok(selfSources.includes("people/alex.md"), "alex sees own private note");
});

test("get_summary produces per-person spoken text from daily notes", async () => {
  const r = await tools.get_summary({}, ctx);
  const sam = r.summaries.find((s) => s.author === "sam");
  assert.ok(sam && /sam/.test(sam.text) && sam.items.length >= 1);
});

test("docs can't answer unknown topics -> I don't know", async () => {
  const s = await tools.search_docs({ query: "rate-limiting billing deploys" }, ctx);
  // billing/deploys absent; may match 'rate-limited' loosely — assert the known-absent case:
  const d = await tools.get_decision({ topic: "kubernetes autoscaling" }, ctx);
  assert.equal(d.found, false);
  const w = await tools.who_knows({ feature: "billing" }, ctx);
  assert.equal(w.found, false);
});

test("log_unanswered writes events and returns a person to ping", async () => {
  const r = await tools.log_unanswered({ topic: "payments", asked_by: "alex" }, ctx);
  assert.equal(r.logged, true);
  assert.equal(r.ping.author, "sam");
  // The question now shows up as an open thread.
  const threads = await ctx.events.openThreads("payments");
  assert.ok(threads.some((t) => t.topic === "payments"));
});

test("record_decision writes a note (fallback until C ships writeDecision)", async () => {
  const r = await tools.record_decision(
    {
      title: "Cache refund lookups",
      chosen: "Use an LRU keyed by idempotency key",
      rejected: ["No cache"],
      reason: "Hot path on retries",
      feature: "payments",
      requester: "sam",
    },
    ctx,
  );
  assert.equal(r.recorded, true);
  assert.match(r.path, /decisions\/.*cache-refund-lookups\.md$/);
  // It is now retrievable.
  const got = await tools.get_decision({ slug: "cache-refund-lookups" }, ctx);
  assert.equal(got.found, true);
  assert.match(got.decision.chosen, /LRU/);
});
