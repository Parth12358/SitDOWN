#!/usr/bin/env node
// Flood a demo home with an ORG's worth of data, then build it through the REAL pipeline
// (C: @sitdown/vault) into central + per-person vaults + a SQLite event store. Also emits the
// dashboard's canned fallback (so the shareable artifact looks just as full).
// Deterministic (seeded PRNG) so re-runs are stable. All content is original.
//
//   SITDOWN_HOME=demo/.sitdown-demo node demo/seed.mjs
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const HOME = process.env.SITDOWN_HOME ? path.resolve(process.env.SITDOWN_HOME) : path.join(repo, "demo", ".sitdown-demo");
const VAULTS = path.join(HOME, "vaults"), CENTRAL = path.join(VAULTS, "central");
const EVENTS = path.join(HOME, "events.sqlite"), PROCESSED = path.join(HOME, "processed");
const VAULT_BIN = path.join(repo, "packages", "vault", "dist", "bin", "process.js");

/* deterministic PRNG so the org is the same every run */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(20261011);
const pick = (a) => a[Math.floor(R() * a.length)];
const int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
const chance = (p) => R() < p;

/* business days across ~8 weeks */
const DATES = (() => {
  const out = []; const d = new Date(Date.UTC(2026, 7, 17)); // Aug 17
  while (d < new Date(Date.UTC(2026, 9, 10))) { const wd = d.getUTCDay(); if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
})();

const WARM = ["#f4ae52","#d4621a","#e8822f","#b5791a","#c9532a","#9a6b14","#e0973a","#c26a1f","#a8641c","#d98b2e","#bf7a24","#8f5e12"];

/* teams → people → features. 23 people, 6 teams, 16 features. */
const TEAMS = {
  payments: { who: ["sam","priya","devon","nadia"], feats: ["payments","billing","payouts","fraud"] },
  identity: { who: ["alex","jordan","mia","omar"], feats: ["auth","sso","permissions"] },
  search:   { who: ["lena","raj","tomas"], feats: ["search","recommendations"] },
  growth:   { who: ["ivy","marco","soo","hugo"], feats: ["onboarding","notifications"] },
  platform: { who: ["wes","bea","kian","otto"], feats: ["api","cache","webhooks"] },
  data:     { who: ["zoe","pablo","inga","finn"], feats: ["analytics","exports"] },
};
const PEOPLE = {}; let ci = 0;
for (const t of Object.values(TEAMS)) for (const n of t.who) PEOPLE[n] = WARM[ci++ % WARM.length];
const ownersOf = (f) => Object.values(TEAMS).find((t) => t.feats.includes(f)).who;

/* per-feature content: keywords, work headlines, decisions (original). */
const FEAT = {
  payments: { words:["refund","payment","charge","idempoten","capture","settlement"],
    actions:["Add refund endpoint","Support partial captures","Record settlement ledger entries","Handle currency rounding","Add payment method vaulting","Backfill missing charge metadata"],
    decisions:[{slug:"refund-idempotency",title:"Use idempotency keys for refunds",chosen:"Require an Idempotency-Key header and store processed keys.",rejected:["Client-side dedupe"],reason:"A retried refund from another device must not double-charge."},
      {slug:"settlement-double-entry",title:"Double-entry ledger for settlements",chosen:"Record every money movement as paired debit/credit rows.",rejected:["A single signed-amount column"],reason:"Double-entry makes reconciliation and audits tractable."}] },
  billing: { words:["invoice","proration","tax","plan","subscription","dunning"],
    actions:["Prorate plan changes","Generate invoice PDFs","Add sales-tax calculation","Retry failed subscription charges","Support annual plans","Email dunning reminders"],
    decisions:[{slug:"proration-daily",title:"Prorate plan changes daily",chosen:"Daily proration of the price delta for the remaining cycle.",rejected:["Charge full price next cycle"],reason:"Daily proration is fairest and expected mid-cycle."},
      {slug:"tax-external-provider",title:"Use an external tax provider",chosen:"Call a tax-calculation API at checkout.",rejected:["Hand-maintained rate tables"],reason:"Rates change constantly; a provider keeps us compliant."}] },
  payouts: { words:["payout","webhook","schedule","bank","transfer"],
    actions:["Add weekly payout schedule","Retry failed payout webhooks","Validate bank details on file","Split payouts across accounts","Add payout reversal flow"],
    decisions:[{slug:"webhook-backoff-jitter",title:"Exponential backoff with jitter",chosen:"Full-jitter exponential backoff, dead-letter after 6 tries.",rejected:["Fixed-interval retries"],reason:"Fixed intervals thundering-herd the provider after an outage."}] },
  fraud: { words:["fraud","risk","review","block","velocity"],
    actions:["Score transactions for risk","Add velocity checks","Queue high-risk charges for review","Block known-bad devices"],
    decisions:[{slug:"risk-rules-then-model",title:"Rules before the ML model",chosen:"Run cheap deterministic rules first, model only on the gray zone.",rejected:["Model-scores-everything"],reason:"Rules catch the obvious cases cheaply and are explainable."}] },
  auth: { words:["auth","login","jwt","token","refresh","password","session"],
    actions:["Add JWT refresh rotation","Rate-limit the login route","Build password reset flow","Add device session list","Hash passwords with argon2"],
    decisions:[{slug:"jwt-refresh-rotation",title:"Rotate refresh tokens on every use",chosen:"Rotate on each use and revoke the previous token.",rejected:["A single long-lived refresh token"],reason:"Rotation limits the damage if a token is stolen."},
      {slug:"reset-token-single-use",title:"Single-use, short-lived reset tokens",chosen:"One-time tokens expiring in 30 minutes.",rejected:["Reusable 24h tokens"],reason:"Long-lived links are the top account-takeover vector."}] },
  sso: { words:["sso","oidc","saml","idp","enterprise"],
    actions:["Add OIDC login","Map IdP groups to roles","Support SP-initiated flow","Add just-in-time provisioning"],
    decisions:[{slug:"sso-oidc-over-saml",title:"Use OIDC for SSO instead of SAML",chosen:"OpenID Connect with PKCE.",rejected:["SAML 2.0"],reason:"OIDC is simpler for modern IdPs and mobile."}] },
  permissions: { words:["permission","role","rbac","scope","access"],
    actions:["Add role-based access control","Scope API tokens","Add per-resource sharing","Audit permission changes"],
    decisions:[{slug:"rbac-over-acl",title:"Roles over per-row ACLs",chosen:"Role-based checks with a small set of roles.",rejected:["Per-row access lists"],reason:"ACLs sprawl; roles stay understandable as we grow."}] },
  search: { words:["search","index","ranking","typo","query","relevance"],
    actions:["Add full-text search","Add typo tolerance","Rank results by recency","Highlight matched terms","Add faceted filters"],
    decisions:[{slug:"typo-trigram",title:"Trigram fuzzy match for typos",chosen:"pg_trgm similarity at 0.3.",rejected:["Per-term Levenshtein scan"],reason:"Levenshtein over the corpus is too slow at our scale."},
      {slug:"search-recency-ranking",title:"Blend relevance with recency",chosen:"BM25 × exponential recency decay (14-day half-life).",rejected:["Pure BM25"],reason:"Pure relevance buried fresh, useful documents."}] },
  recommendations: { words:["recommend","suggest","related","ranking","embedding"],
    actions:["Add related-items rail","Rank by co-view signal","Cache recommendation sets","Add cold-start fallback"],
    decisions:[{slug:"recs-coview-first",title:"Co-view signal before embeddings",chosen:"Start with co-view counts; add embeddings later.",rejected:["Embedding model from day one"],reason:"Co-view is cheap, explainable, and good enough to ship."}] },
  onboarding: { words:["onboarding","signup","setup","welcome","checklist"],
    actions:["Add setup checklist","Guide first integration","Send welcome sequence","Track activation steps"],
    decisions:[{slug:"activation-checklist",title:"Checklist over a linear wizard",chosen:"A skippable checklist of activation steps.",rejected:["A forced linear wizard"],reason:"Teams arrive at different points; forcing a path drops people."}] },
  notifications: { words:["notification","notify","email","push","digest","quiet"],
    actions:["Add daily email digest","Add web push","Respect quiet hours","Add per-type preferences","Batch burst notifications"],
    decisions:[{slug:"push-web-push-vapid",title:"Self-host web push with VAPID",chosen:"Web Push protocol with our own VAPID keys.",rejected:["A third-party push SaaS"],reason:"Avoids per-message cost and keeps subscriber data in-house."},
      {slug:"quiet-hours-per-user",title:"Per-user quiet hours",chosen:"Each user sets a quiet window in their timezone.",rejected:["One global quiet window"],reason:"A global window is wrong for a distributed user base."}] },
  api: { words:["api","pagination","cursor","rate limit","versioning","throttle"],
    actions:["Add cursor pagination","Add scoped API keys","Version the public API","Add request rate limiting","Return consistent error envelopes"],
    decisions:[{slug:"cursor-pagination",title:"Opaque cursors over offset",chosen:"Keyset cursors encoding (created_at, id).",rejected:["LIMIT/OFFSET paging"],reason:"Offset paging skips or repeats rows under concurrent writes."},
      {slug:"api-version-header",title:"Version via a date header",chosen:"Pin behavior with an API-Version date header.",rejected:["Version in the URL path"],reason:"A header lets clients upgrade without rewriting every URL."}] },
  cache: { words:["cache","redis","invalidation","ttl","read-through"],
    actions:["Add read-through Redis cache","Invalidate on write","Add negative caching","Warm hot keys on deploy"],
    decisions:[{slug:"cache-write-through-invalidation",title:"Write-through invalidation",chosen:"Invalidate and repopulate the key on every write.",rejected:["TTL-only expiry"],reason:"TTL-only served stale data for the whole TTL after a write."}] },
  webhooks: { words:["webhook","delivery","signature","retry","event"],
    actions:["Sign outbound webhooks","Retry with backoff","Add a delivery log","Let customers replay events"],
    decisions:[{slug:"webhook-hmac-signing",title:"Sign webhooks with HMAC",chosen:"HMAC-SHA256 signature header with a per-endpoint secret.",rejected:["Mutual TLS"],reason:"HMAC is far easier for customers to verify than mTLS."}] },
  analytics: { words:["analytics","metrics","dashboard","chart","usage","funnel"],
    actions:["Add usage charts","Build a funnel report","Roll up daily metrics","Add CSV of any chart","Track feature adoption"],
    decisions:[{slug:"metrics-rollup-nightly",title:"Nightly pre-aggregation",chosen:"Roll metrics up nightly into summary tables.",rejected:["Query raw events live"],reason:"Live scans over raw events were too slow for dashboards."}] },
  exports: { words:["export","csv","download","report","backup"],
    actions:["Stream CSV exports","Schedule recurring exports","Add a data download request flow","Export to cloud storage"],
    decisions:[{slug:"export-streaming",title:"Stream exports, don't buffer",chosen:"Stream rows straight to the response.",rejected:["Build the whole file in memory"],reason:"Large exports blew memory when buffered."}] },
};
const FEATURE_WORDS = Object.fromEntries(Object.entries(FEAT).map(([f, v]) => [f, v.words]));
const FEATURES_LIST = Object.keys(FEAT);

const AGENT_NS = () => (chance(0.72) ? "claude" : "codex");
const SUMMARY_TAILS = ["with tests and a migration.","behind a feature flag.","and wired up metrics.","plus docs for the team.","with a backfill for existing rows.","and alerting on failures.",""];
let sid = 0;
const srcId = (ns) => `${ns === "claude" ? "cl" : "cx"}${String(++sid).padStart(4, "0")}`;
let shaN = 0;
const sha = () => (0x100000 + (shaN++ * 0x9e37 % 0xeffff)).toString(16).slice(0, 6);

const WORK = [];
for (const f of FEATURES_LIST) {
  const owners = ownersOf(f);
  // decision-introducing sessions
  for (const dec of FEAT[f].decisions) {
    const a = pick(owners); const ns = AGENT_NS();
    WORK.push({ f, a, d: pick(DATES), kind: "session", ns, id: srcId(ns), head: dec.title, sum: `${dec.chosen} ${pick(SUMMARY_TAILS)}`.trim(), add: [[int(1, 20), int(40, 160)]], iv: int(0, 3), dec });
  }
  // action sessions
  for (const act of FEAT[f].actions) {
    const a = chance(0.85) ? pick(owners) : pick(Object.keys(PEOPLE));
    const ns = AGENT_NS();
    WORK.push({ f, a, d: pick(DATES), kind: "session", ns, id: srcId(ns), head: act, sum: `${act} ${pick(SUMMARY_TAILS)}`.trim(), add: [[int(1, 30), int(40, 180)]], iv: int(0, 2) });
    const noun = act.replace(/^(Add|Support|Build|Generate|Handle|Record|Stream|Schedule|Score|Queue|Block|Map|Rank|Send|Track|Roll up|Validate|Split|Warm|Sign|Retry|Version|Return|Highlight|Guide|Respect|Backfill|Hash|Cache)\s+/i, "").toLowerCase();
    // some commit follow-ups
    if (chance(0.5)) WORK.push({ f, a: pick(owners), d: pick(DATES), kind: "commit", sha: sha(), head: `Fix ${noun}`, sum: `Follow-up fix for ${noun}.`, add: [[int(1, 20), int(8, 40)]], editsAgent: chance(0.6) });
    // iteration sessions (hardening / tests / refactors) — more history per feature
    if (chance(0.6)) { const v = pick(["Harden", "Add tests for", "Refactor", "Document", "Optimize", "Add metrics to"]); const ns2 = AGENT_NS(); WORK.push({ f, a: pick(owners), d: pick(DATES), kind: "session", ns: ns2, id: srcId(ns2), head: `${v} ${noun}`, sum: `${v} ${noun} ${pick(SUMMARY_TAILS)}`.trim(), add: [[int(1, 20), int(20, 90)]], iv: int(0, 2) }); }
  }
}
// sort chronologically for nicer histories
WORK.sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0));

function digestFor(w) {
  const source = w.kind === "commit" ? `commit:${w.sha}` : `session:${w.ns}:${w.id}`;
  const attribution = (w.add || []).map((lines) => ({ file: `src/${w.f}.ts`, lines, label: w.kind === "commit" ? (w.editsAgent ? "agent_edited" : "human") : "agent" }));
  const dig = { source, author: w.a, feature: w.f, date: w.d, headline: w.head, summary: w.sum, attribution, human_interventions: w.iv || 0 };
  if (w.dec) dig.decisions = [{ slug: w.dec.slug, title: w.dec.title, chosen: w.dec.chosen, rejected: w.dec.rejected, reason: w.dec.reason }];
  return dig;
}
const digests = WORK.map(digestFor);

for (const p of [VAULTS, PROCESSED, path.join(HOME, "state")]) rmSync(p, { recursive: true, force: true });
rmSync(EVENTS, { force: true });
mkdirSync(PROCESSED, { recursive: true });
mkdirSync(VAULTS, { recursive: true });
writeFileSync(path.join(HOME, "config.json"), JSON.stringify({ vaults_root: VAULTS, central_vault: CENTRAL, event_store: "sqlite", llm: "claude_cli", people: Object.fromEntries(Object.keys(PEOPLE).map((n) => [n, [`${n}@example.com`]])) }, null, 2));
for (const d of digests) writeFileSync(path.join(PROCESSED, d.source.replace(/[^a-z0-9]+/gi, "-") + ".json"), JSON.stringify(d));
console.log(`[seed] ${digests.length} digests · ${Object.keys(PEOPLE).length} people · ${FEATURES_LIST.length} features`);

const r = spawnSync(process.execPath, [VAULT_BIN, "--all"], { env: { ...process.env, SITDOWN_HOME: HOME, SITDOWN_PROCESSED: PROCESSED, SITDOWN_VAULTS_ROOT: VAULTS, SITDOWN_CENTRAL_VAULT: CENTRAL, SITDOWN_EVENTS_DB: EVENTS, SITDOWN_EVENT_STORE: "sqlite" }, stdio: "inherit" });
if (r.status !== 0) process.exit(r.status || 1);

/* ---- canned fallback for the artifact (same data) ---- */
const byFeat = {}, byAuthor = {}, decs = {}, events = [];
const NOTE_TAILS = ["still needs an alert wired up.","has a flaky test to chase.","should move off the in-memory store before launch.","needs a runbook entry.","is behind a flag until QA signs off.","wants a load test before GA."];
const priv = {}; let pi = 0;
for (const n of Object.keys(PEOPLE)) priv[n] = `Personal note — my ${pick(FEATURES_LIST)} work ${NOTE_TAILS[pi++ % NOTE_TAILS.length]}`;
for (const w of WORK) {
  (byFeat[w.f] ||= []).push(w); (byAuthor[w.a] ||= []).push(w);
  const src = w.kind === "commit" ? `commit:${w.sha}` : `session:${w.ns}:${w.id}`;
  if (w.dec && !decs[w.dec.slug]) decs[w.dec.slug] = { title: w.dec.title, feature: w.f, author: w.a, date: w.d, chosen: w.dec.chosen, rejected: w.dec.rejected, reason: w.dec.reason, sources: [src], path: `central/decisions/${w.d}-${w.dec.slug}.md` };
  events.push(["FeatureTouched", w.f]);
  if (w.kind === "commit") { events.push(["CommitMade", String((w.add || []).reduce((s, [a, b]) => s + (b - a + 1), 0))]); events.push(["AuthorType", w.editsAgent ? "agent_edited" : "human"]); }
  else { for (let i = 0; i < (w.iv || 0); i++) events.push(["HumanIntervened", ""]); events.push(["AgentSession", w.ns === "codex" ? "codex" : "claude_code"]); if (w.dec) events.push(["DecisionRecorded", w.dec.slug]); }
}
const FEATURES = {};
for (const [f, items] of Object.entries(byFeat)) {
  const hist = [...items].sort((a, b) => (a.d < b.d ? 1 : -1)).slice(0, 6).map((w) => ({ date: w.d, headline: w.head, who: w.a, decision: w.dec?.slug, source: w.kind === "commit" ? `commit:${w.sha}` : `session:${w.ns}:${w.id}` }));
  const agent = items.reduce((s, w) => s + ((w.kind === "commit" && !w.editsAgent) ? 0 : (w.add || []).reduce((t, [a, b]) => t + (b - a + 1), 0)), 0);
  const human = items.reduce((s, w) => s + ((w.kind === "commit" && !w.editsAgent) ? (w.add || []).reduce((t, [a, b]) => t + (b - a + 1), 0) : 0), 0);
  FEATURES[f] = { path: `central/features/${f}.md`, attribution: { agent, human }, history: hist };
}
const DAILY = {};
for (const [a, items] of Object.entries(byAuthor)) DAILY[a] = [...items].sort((p, q) => (p.d < q.d ? 1 : -1)).slice(0, 3).map((x) => x.head);
const WHO = {};
for (const f of FEATURES_LIST) {
  const score = {};
  for (const w of byFeat[f]) score[w.a] = (score[w.a] || 0) + (w.kind === "commit" ? 2.2 : 1.4) + (w.dec ? 0.6 : 0);
  WHO[f] = Object.entries(score).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([who, s]) => ({ who, score: +s.toFixed(2), touches: byFeat[f].filter((w) => w.a === who).length, commits: byFeat[f].filter((w) => w.a === who && w.kind === "commit").length }));
}
const PEOPLE_JS = Object.fromEntries(Object.entries(PEOPLE).map(([n, c]) => [n, { color: c, contact: `${n}@example.com` }]));
const STARTERS = [["why","Why rotate refresh tokens?"],["who","Who knows the billing feature?"],["recap","What has priya been working on?"],["brief","What's the recent context on search?"],["gap","What's our blockchain strategy?"]];
const UNKNOWN = ["blockchain","voice assistant","ar","vr","crypto wallet","on-call rotation"];

const block = [
  ["PEOPLE", PEOPLE_JS], ["DECISIONS", decs], ["FEATURES", FEATURES], ["DAILY", DAILY], ["WHO", WHO],
  ["PRIVATE_ME", priv], ["EVENTS", events], ["FEATURE_WORDS", FEATURE_WORDS], ["UNKNOWN", UNKNOWN], ["STARTERS", STARTERS],
].map(([k, v]) => `const ${k} = ${JSON.stringify(v)};`).join("\n");
writeFileSync(process.env.CANNED_OUT || path.join(here, ".canned.js"), block);
console.log(`[seed] vault: ${CENTRAL}\n[seed] decisions: ${Object.keys(decs).length} · canned block written`);
