// @sitdown/voice — E. Client for D's MCP tools (get_summary, get_brief, search_docs, log_unanswered).
//
// D serves these over HTTP (and stdio). The OVERALL_PLAN contract names the tools and their
// inputs but does NOT pin the exact HTTP request/response JSON, so this client is deliberately
// tolerant: it normalizes whatever D returns (a plain string, a JSON object, or MCP text content)
// into the small internal shapes below. Confirm the wire envelope with D at integration.
//
// Two implementations:
//   HttpMcpClient — talks to D's live endpoint. Default transport is MCP Streamable-HTTP
//     JSON-RPC `tools/call`; set MCP_HTTP_MODE=rest to POST `${base}/<tool>` with the args body.
//   MockMcpClient — reads the shipped fixture payload (derived from contracts/fixtures/vault/)
//     so the whole tool runs offline before D is live.

import { readFile } from "node:fs/promises";
import { MOCK_DATA, type MockData } from "./mock-data.js";

// ---- Normalized shapes this package consumes ------------------------------------------------

export interface DecisionItem {
  slug?: string;
  title: string;
  chosen?: string;
  rejected?: string[];
  reason?: string;
  feature?: string;
  source?: string;
}

export interface SummaryItem {
  text: string;
  feature?: string;
  decision?: string;
  source?: string;
  date?: string;
}

export interface PersonSummary {
  author: string;
  date?: string;
  headline?: string;
  items: SummaryItem[];
  decisions: DecisionItem[];
}

export interface SearchResult {
  path: string;
  snippet: string;
  sources?: string[];
}

export interface Brief {
  feature?: string;
  decisions: DecisionItem[];
  openThreads?: string[];
  alsoWorkingOnIt?: string[];
}

export interface LogUnansweredResult {
  /** developer slug to ping */
  ping?: string;
  topic: string;
}

export interface McpClient {
  get_summary(args: { author?: string; from?: string; to?: string }): Promise<PersonSummary[]>;
  get_brief(args: { branch?: string; feature?: string }): Promise<Brief>;
  search_docs(args: { query: string }): Promise<SearchResult[]>;
  log_unanswered(args: { topic: string; asked_by?: string }): Promise<LogUnansweredResult>;
}

// ---- HTTP client ----------------------------------------------------------------------------

type HttpMode = "jsonrpc" | "rest";

export class HttpMcpClient implements McpClient {
  private rpcId = 0;
  constructor(
    private readonly base: string,
    private readonly mode: HttpMode = (process.env.MCP_HTTP_MODE as HttpMode) || "jsonrpc",
  ) {}

  private async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (this.mode === "rest") {
      const res = await fetch(join(this.base, name), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      });
      if (!res.ok) throw new Error(`MCP ${name} failed: ${res.status} ${res.statusText}`);
      return parseMaybeJson(await res.text());
    }

    // MCP Streamable-HTTP JSON-RPC tools/call.
    const res = await fetch(this.base, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++this.rpcId,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
    if (!res.ok) throw new Error(`MCP ${name} failed: ${res.status} ${res.statusText}`);
    const payload = extractRpcPayload(await res.text());
    if (payload?.error) throw new Error(`MCP ${name} error: ${JSON.stringify(payload.error)}`);
    // Standard MCP tool result: { result: { content: [{ type: "text", text }], structuredContent? } }
    const result = payload?.result ?? payload;
    if (result && typeof result === "object" && "structuredContent" in result) {
      return (result as Record<string, unknown>).structuredContent;
    }
    const content = (result as { content?: Array<{ type?: string; text?: string }> })?.content;
    if (Array.isArray(content)) {
      const text = content
        .filter((c) => c?.type === "text" && typeof c.text === "string")
        .map((c) => c.text)
        .join("\n");
      return parseMaybeJson(text);
    }
    return result;
  }

  async get_summary(args: { author?: string; from?: string; to?: string }): Promise<PersonSummary[]> {
    return normalizeSummaries(await this.callTool("get_summary", args), args.author);
  }

  async get_brief(args: { branch?: string; feature?: string }): Promise<Brief> {
    return normalizeBrief(await this.callTool("get_brief", args));
  }

  async search_docs(args: { query: string }): Promise<SearchResult[]> {
    return normalizeSearch(await this.callTool("search_docs", args));
  }

  async log_unanswered(args: { topic: string; asked_by?: string }): Promise<LogUnansweredResult> {
    const raw = (await this.callTool("log_unanswered", args)) as Record<string, unknown> | string;
    const ping =
      typeof raw === "object" && raw
        ? (raw.ping as string) ?? (raw.developer as string) ?? (raw.who as string)
        : typeof raw === "string"
          ? raw
          : undefined;
    return { topic: args.topic, ping };
  }
}

// ---- Mock client ----------------------------------------------------------------------------

export class MockMcpClient implements McpClient {
  private data: MockData | undefined;

  /** Defaults to the embedded MOCK_DATA; pass a JSON file path to override. */
  constructor(private readonly fixturePath?: string) {}

  private async load(): Promise<MockData> {
    if (this.data) return this.data;
    this.data = this.fixturePath
      ? (JSON.parse(await readFile(this.fixturePath, "utf8")) as MockData)
      : MOCK_DATA;
    return this.data;
  }

  async get_summary(args: { author?: string }): Promise<PersonSummary[]> {
    const { summaries } = await this.load();
    return args.author ? summaries.filter((s) => s.author === args.author) : summaries;
  }

  async get_brief(args: { branch?: string; feature?: string }): Promise<Brief> {
    const { briefs } = await this.load();
    const key = (args.feature ?? featureFromBranch(args.branch) ?? "").toLowerCase();
    return briefs[key] ?? { feature: key || undefined, decisions: [], openThreads: [] };
  }

  async search_docs(args: { query: string }): Promise<SearchResult[]> {
    const { search } = await this.load();
    const q = args.query.toLowerCase();
    const hits = search.filter(
      (r) => r.snippet.toLowerCase().includes(q) || r.path.toLowerCase().includes(q),
    );
    return (hits.length ? hits : search).slice(0, 5);
  }

  async log_unanswered(args: { topic: string; asked_by?: string }): Promise<LogUnansweredResult> {
    // Mock: pick a plausible owner from the fixture summaries by feature/topic overlap.
    const { summaries } = await this.load();
    const t = args.topic.toLowerCase();
    const owner = summaries.find((s) =>
      s.items.some((i) => (i.feature ?? "").toLowerCase() && t.includes((i.feature ?? "").toLowerCase())),
    );
    return { topic: args.topic, ping: owner?.author };
  }
}

/** Pick a client from flags/env: an explicit base URL -> HTTP, otherwise the offline mock. */
export function makeMcpClient(opts: { mcpUrl?: string } = {}): McpClient {
  const base = opts.mcpUrl ?? process.env.MCP_HTTP_URL;
  return base ? new HttpMcpClient(base) : new MockMcpClient();
}

// ---- Normalization helpers ------------------------------------------------------------------

export function featureFromBranch(branch?: string): string | undefined {
  if (!branch) return undefined;
  // feat/payments -> payments ; alex/auth-rate-limit -> auth
  const tail = branch.split("/").pop() ?? branch;
  return tail.split("-")[0] || undefined;
}

function join(base: string, suffix: string): string {
  return base.replace(/\/+$/, "") + "/" + suffix.replace(/^\/+/, "");
}

function parseMaybeJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed; // plain string answer
  }
}

/** Extract the JSON-RPC payload from a plain-JSON or SSE (`data:`) HTTP response body. */
function extractRpcPayload(body: string): { result?: unknown; error?: unknown } | undefined {
  const trimmed = body.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  // SSE: concatenate `data:` lines (last event wins for a single call).
  const dataLines = trimmed
    .split(/\r?\n/)
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim());
  for (let i = dataLines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(dataLines[i]);
    } catch {
      // keep looking
    }
  }
  return undefined;
}

function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    for (const k of ["summaries", "results", "items", "data"]) {
      if (Array.isArray(obj[k])) return obj[k] as T[];
    }
  }
  return v == null ? [] : [v as T];
}

function normalizeDecisions(v: unknown): DecisionItem[] {
  return asArray<Record<string, unknown>>(v).map((d) => ({
    slug: str(d.slug),
    title: str(d.title) ?? str(d.headline) ?? "(untitled decision)",
    chosen: str(d.chosen),
    rejected: Array.isArray(d.rejected) ? (d.rejected as string[]) : undefined,
    reason: str(d.reason),
    feature: str(d.feature),
    source: str(d.source) ?? firstSource(d.sources),
  }));
}

function normalizeSummaries(v: unknown, fallbackAuthor?: string): PersonSummary[] {
  return asArray<Record<string, unknown>>(v).map((s) => ({
    author: str(s.author) ?? fallbackAuthor ?? "unknown",
    date: str(s.date),
    headline: str(s.headline) ?? str(s.summary),
    items: asArray<Record<string, unknown>>(s.items ?? s.bullets ?? s.contributions).map((i) =>
      typeof i === "string"
        ? { text: i as unknown as string }
        : {
            text: str(i.text) ?? str(i.headline) ?? str(i.summary) ?? "",
            feature: str(i.feature),
            decision: str(i.decision),
            source: str(i.source) ?? firstSource(i.sources),
            date: str(i.date),
          },
    ),
    decisions: normalizeDecisions(s.decisions),
  }));
}

function normalizeBrief(v: unknown): Brief {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    feature: str(o.feature),
    decisions: normalizeDecisions(o.decisions),
    openThreads: Array.isArray(o.openThreads) ? (o.openThreads as string[]) : [],
    alsoWorkingOnIt: Array.isArray(o.alsoWorkingOnIt)
      ? (o.alsoWorkingOnIt as string[])
      : Array.isArray(o.who)
        ? (o.who as string[])
        : [],
  };
}

function normalizeSearch(v: unknown): SearchResult[] {
  return asArray<Record<string, unknown>>(v).map((r) => ({
    path: str(r.path) ?? "",
    snippet: str(r.snippet) ?? str(r.text) ?? "",
    sources: Array.isArray(r.sources) ? (r.sources as string[]) : undefined,
  }));
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

function firstSource(v: unknown): string | undefined {
  return Array.isArray(v) && typeof v[0] === "string" ? (v[0] as string) : undefined;
}
