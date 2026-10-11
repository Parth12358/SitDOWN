// @sitdown/mcp — D. Tool implementations shared by the stdio and http entry points.
// In: central vault (shared) + caller's personal vault (private); event store (Keewano or SQLite).
// Every response cites note paths and source session/commit IDs.
// Build order (PRD-D): get_brief, search_docs, get_summary first; then the rest.
import path from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ResolvedConfig } from "./config.js";
import type { EventStore } from "./events/index.js";
import { searchNotes } from "./search.js";
import { type Note, noteFeature, readNotes } from "./vault.js";

export interface Ctx {
  /** Central (team) vault — all shared queries read from here. */
  centralVault: string;
  /** Resolve a person's own vault (their private me.md + daily log). */
  personVaultFor: (author: string) => string;
  cfg: ResolvedConfig;
  events: EventStore;
  /** author slug of the caller; their own personal vault is the only private note we read */
  requester?: string;
}

const IDK = "I don't know — the docs don't cover this yet.";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Resolve a feature name from an explicit value or a branch like `feat/payments`. */
export function featureFromBranch(branch?: string): string | undefined {
  if (!branch) return undefined;
  const seg = branch.split("/").pop() ?? branch;
  return seg.replace(/^(feat|feature|fix|chore|bug|hotfix)[-_]?/i, "").trim() || undefined;
}

function kebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ParsedDecision {
  slug: string;
  title: string;
  chosen: string;
  rejected: string[];
  reason: string;
  feature?: string;
  author?: string;
  sources: string[];
  path: string;
}

/** Pull **Chose:** / **Rejected:** / **Reason:** fields out of a decision note's auto body. */
function parseDecision(note: Note): ParsedDecision {
  const body = note.autoBody;
  const field = (label: string): string => {
    const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\s*\\n\\*\\*|$)`, "i");
    const m = re.exec(body);
    return m ? m[1].replace(/\s+/g, " ").trim() : "";
  };
  const rejectedRaw = field("Rejected");
  return {
    slug: note.slug ?? note.name,
    title: note.title,
    chosen: field("Chose") || field("Chosen"),
    rejected: rejectedRaw ? [rejectedRaw] : [],
    reason: field("Reason"),
    feature: noteFeature(note),
    author: typeof note.frontmatter.author === "string" ? note.frontmatter.author : undefined,
    sources: note.sources,
    path: note.relPath,
  };
}

/** Split a daily note's auto body into per-person bullet lists (keys are author slugs). */
function parseDailyByPerson(note: Note): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of note.autoBody.split(/\r?\n/)) {
    const h = /^##\s+\[\[([^\]]+)\]\]/.exec(line) ?? /^##\s+(.+)$/.exec(line);
    if (h) {
      current = h[1].trim();
      out[current] = [];
      continue;
    }
    const b = /^[-*]\s+(.*)$/.exec(line.trim());
    if (b && current) out[current].push(b[1].trim());
  }
  return out;
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr.filter(Boolean))];
}

/**
 * The authors the event store should be able to name: config.people plus everyone who has a
 * person note in the central vault. Without this, a contributor absent from config shows up in
 * who_knows as a raw entity UUID instead of their name.
 */
function knownPeople(ctx: Ctx): Record<string, string[]> {
  const map: Record<string, string[]> = { ...(ctx.cfg.people ?? {}) };
  for (const note of readNotes(ctx.centralVault, "person")) {
    const author = typeof note.frontmatter.author === "string" ? note.frontmatter.author : note.name;
    if (author && !(author in map)) map[author] = [];
  }
  return map;
}

// ---------------------------------------------------------------------------
// Phase 1 tools
// ---------------------------------------------------------------------------

export async function get_brief(
  input: { branch?: string; feature?: string; requester?: string },
  ctx: Ctx,
) {
  const feature = input.feature ?? featureFromBranch(input.branch);
  if (!feature) {
    return { found: false, answer: "Pass a feature or a branch to brief on.", feature: null };
  }

  const decisions = readNotes(ctx.centralVault, "decision")
    .filter((n) => noteFeature(n) === feature)
    .slice(0, 5)
    .map(parseDecision);

  const [openThreads, ranked] = await Promise.all([
    ctx.events.openThreads(feature),
    ctx.events.authorsRanked(feature, knownPeople(ctx)),
  ]);

  const featureNote = readNotes(ctx.centralVault, "feature").find((n) => n.name === feature);
  const citations = dedupe([
    featureNote?.relPath ?? "",
    ...decisions.map((d) => d.path),
    ...decisions.flatMap((d) => d.sources),
  ]);

  return {
    found: decisions.length > 0 || ranked.length > 0,
    feature,
    decisions,
    open_threads: openThreads,
    who_else: ranked.map((r) => ({
      author: r.author,
      score: Number(r.score.toFixed(3)),
      last_active: r.lastActive,
    })),
    citations,
  };
}

export async function search_docs(input: { query: string; requester?: string }, ctx: Ctx) {
  const requester = input.requester ?? ctx.requester;
  const results = searchNotes(ctx.centralVault, input.query, requester);
  return {
    found: results.length > 0,
    answer: results.length > 0 ? undefined : IDK,
    results: results.map((r) => ({
      path: r.path,
      title: r.title,
      type: r.type,
      snippet: r.snippet,
      sources: r.sources,
    })),
    citations: dedupe([...results.map((r) => r.path), ...results.flatMap((r) => r.sources)]),
  };
}

export async function get_summary(
  input: { author?: string; from?: string; to?: string; requester?: string },
  ctx: Ctx,
) {
  const requester = input.requester ?? ctx.requester;
  const from = input.from ?? "0000-00-00";
  const to = input.to ?? "9999-99-99";

  const dailies = readNotes(ctx.centralVault, "daily").filter((n) => {
    const d = (typeof n.frontmatter.date === "string" && n.frontmatter.date) || n.name;
    return d >= from && d <= to;
  });

  // author slug -> { items, sources }
  const acc = new Map<string, { items: string[]; sources: string[] }>();
  for (const daily of dailies) {
    const byPerson = parseDailyByPerson(daily);
    for (const [author, items] of Object.entries(byPerson)) {
      if (input.author && author !== input.author) continue;
      const entry = acc.get(author) ?? { items: [], sources: [] };
      entry.items.push(...items.map((i) => i.replace(/\s*[·•]\s*/g, " — ").replace(/\[\[|\]\]/g, "")));
      entry.sources.push(daily.relPath);
      // Cite the source session/commit IDs referenced inline in the bullets (contract: every
      // answer cites its source session or commit), not just the note path.
      for (const i of items) {
        for (const m of i.matchAll(/\b(session:[^\s)\]]+|commit:[^\s)\]]+)/g)) entry.sources.push(m[1]);
      }
      acc.set(author, entry);
    }
  }

  // Private enrichment: only the CALLER's own personal vault (me.md) is ever read. Other people's
  // private notes live in vaults we never touch, so privacy is structural, not a filter.
  if (requester && (!input.author || input.author === requester)) {
    const meAbs = path.join(ctx.personVaultFor(requester), "me.md");
    if (existsSync(meAbs)) {
      const entry = acc.get(requester);
      if (entry) entry.sources.push(`${requester}/me.md`);
    }
  }

  const summaries = [...acc.entries()].map(([author, { items, sources }]) => ({
    author,
    text: spokenSummary(author, items),
    items,
    sources: dedupe(sources),
  }));

  return {
    found: summaries.length > 0,
    answer: summaries.length > 0 ? undefined : IDK,
    range: { from: input.from ?? null, to: input.to ?? null },
    summaries,
    citations: dedupe(summaries.flatMap((s) => s.sources)),
  };
}

function spokenSummary(author: string, items: string[]): string {
  if (items.length === 0) return `${author} has no recorded activity in this range.`;
  const clauses = items.map((i) => i.split(" — ")[0].replace(/\.$/, ""));
  const list =
    clauses.length === 1
      ? clauses[0]
      : `${clauses.slice(0, -1).join(", ")} and ${clauses[clauses.length - 1]}`;
  return `${author} ${clauses.length === 1 ? "worked on" : "worked on"} ${list}.`;
}

// ---------------------------------------------------------------------------
// Phase 2 tools
// ---------------------------------------------------------------------------

export async function get_decision(input: { slug?: string; topic?: string }, ctx: Ctx) {
  const notes = readNotes(ctx.centralVault, "decision");

  let match: Note | undefined;
  if (input.slug) {
    match = notes.find((n) => n.slug === input.slug || n.name === input.slug);
  }
  if (!match && (input.topic || input.slug)) {
    const query = (input.topic ?? input.slug ?? "").toLowerCase();
    const terms = query.match(/[a-z0-9]+/g) ?? [];
    let best = 0;
    for (const n of notes) {
      const hay = `${n.title}\n${n.body}`.toLowerCase();
      const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
      if (score > best) {
        best = score;
        match = n;
      }
    }
  }

  if (!match) return { found: false, answer: IDK };
  const d = parseDecision(match);
  return {
    found: true,
    decision: d,
    citations: dedupe([d.path, ...d.sources]),
  };
}

export async function who_knows(input: { feature: string }, ctx: Ctx) {
  const ranked = await ctx.events.authorsRanked(input.feature, knownPeople(ctx));
  const featureNote = readNotes(ctx.centralVault, "feature").find((n) => n.name === input.feature);
  return {
    found: ranked.length > 0,
    answer: ranked.length > 0 ? undefined : IDK,
    feature: input.feature,
    people: ranked.map((r) => ({
      author: r.author,
      score: Number(r.score.toFixed(3)),
      feature_touches: r.featureTouches,
      commits: r.commits,
      last_active: r.lastActive,
    })),
    citations: dedupe([featureNote?.relPath ?? "", `event_store:${ctx.events.kind}`]),
  };
}

export async function log_unanswered(input: { topic: string; asked_by?: string }, ctx: Ctx) {
  await ctx.events.append(input.asked_by, [
    { name: "QuestionAsked", value: input.topic },
    { name: "AnswerFound", value: false },
  ]);

  // Ranking matches features by exact name, but a free-text topic ("auth token expiry") rarely
  // equals a feature. Resolve it to a known feature mentioned in the topic before ranking so a
  // clear owner still gets pinged.
  const features = readNotes(ctx.centralVault, "feature").map((n) => n.name);
  const topicLc = input.topic.toLowerCase();
  const resolvedFeature =
    features.find((f) => topicLc.includes(f.toLowerCase())) ??
    features.find((f) => f.toLowerCase().includes(topicLc)) ??
    input.topic;

  const ranked = await ctx.events.authorsRanked(resolvedFeature, knownPeople(ctx));
  const ping = ranked[0];
  return {
    logged: true,
    topic: input.topic,
    ping: ping
      ? { author: ping.author, contacts: ctx.cfg.people[ping.author] ?? [], score: Number(ping.score.toFixed(3)) }
      : null,
    message: ping ? `Ask ${ping.author} about "${input.topic}".` : `No one has touched "${input.topic}" yet.`,
    citations: [`event_store:${ctx.events.kind}`],
  };
}

export async function record_decision(
  input: { title: string; chosen: string; rejected?: string[]; reason: string; feature: string; requester?: string },
  ctx: Ctx,
) {
  const author = input.requester ?? ctx.requester ?? "unknown";
  const date = today();
  const slug = kebab(input.title);
  const decision = {
    slug,
    title: input.title,
    chosen: input.chosen,
    rejected: input.rejected ?? [],
    reason: input.reason,
  };

  let notePath: string;
  let usedFallback = false;
  try {
    // PRD-D: import C's writeDecision — do not duplicate the writer.
    const vault = (await import("@sitdown/vault")) as {
      writeDecision: (
        d: typeof decision,
        o: { author: string; date: string; feature: string; sources?: string[]; vaultPath: string },
      ) => Promise<string>;
    };
    notePath = await vault.writeDecision(decision, {
      author,
      date,
      feature: input.feature,
      vaultPath: ctx.centralVault,
    });
  } catch {
    // Fallback until C ships writeDecision. Writes the exact contract note format.
    notePath = writeDecisionFallback(ctx.centralVault, decision, { author, date, feature: input.feature });
    usedFallback = true;
  }

  // Keep events consistent with the vault (FeatureTouched precedes the event it applies to).
  await ctx.events.append(author, [
    { name: "FeatureTouched", value: input.feature },
    { name: "DecisionRecorded", value: slug },
  ]);

  const relPath = path.relative(ctx.centralVault, notePath).split(path.sep).join("/");
  return { recorded: true, path: relPath, slug, used_fallback: usedFallback, citations: [relPath] };
}

/** Minimal local decision writer used only until C's @sitdown/vault.writeDecision lands. */
function writeDecisionFallback(
  vaultPath: string,
  d: { slug: string; title: string; chosen: string; rejected: string[]; reason: string },
  opts: { author: string; date: string; feature: string },
): string {
  const dir = path.join(vaultPath, "decisions");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${opts.date}-${d.slug}.md`);
  const rejected = d.rejected.length ? d.rejected.join("; ") : "none recorded";
  const content = `---
type: decision
feature: "[[${opts.feature}]]"
author: ${opts.author}
sources: []
updated: ${opts.date}
---
# ${d.title}

<!-- auto:start -->
**Chose:** ${d.chosen}

**Rejected:** ${rejected}

**Reason:** ${d.reason}
<!-- auto:end -->
`;
  // Preserve any hand-written text below the markers if the note already exists.
  if (!existsSync(file)) writeFileSync(file, content);
  else {
    // Only rewrite the auto block; leave everything after <!-- auto:end --> untouched.
    const prev = readFileSync(file, "utf8");
    const tail = prev.split("<!-- auto:end -->")[1] ?? "\n";
    writeFileSync(file, content.replace(/<!-- auto:end -->\n$/, `<!-- auto:end -->${tail}`));
  }
  return file;
}
