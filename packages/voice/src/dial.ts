// @sitdown/voice — E. Dial wrapper. Built against Dial's documented REST API so it does not
// depend on unverified SDK method names; see NOTES.md for the endpoints and open questions.
//   Auth:  Authorization: Bearer $DIAL_API_KEY
//   Base:  https://api.getdial.ai/api/v1   (override with DIAL_BASE_URL)
//   Calls: POST /calls, GET /calls/{id}    Messages: POST /messages    Numbers: GET /numbers
//   Mid-call tools are account-level Context MCP: POST /context-mcps { name, url }.
//
// MockDial runs the exact same interface fully offline (used by --dry-run and when DIAL_API_KEY
// is unset), so the whole flow is demoable without placing a real call.

export interface DialNumber {
  id: string;
  phoneNumber?: string;
}

export type CallState = "Queued" | "Ringing" | "In-Progress" | "Terminated" | "Unknown";

export interface TranscriptTurn {
  speaker: string; // "agent" | "user" | ...
  text: string;
  startMs?: number;
  endMs?: number;
}

export interface DialCall {
  id: string;
  status: { state: CallState; terminationType?: string; label?: string };
  duration?: number;
  transcript?: string;
  transcriptTurns?: TranscriptTurn[];
}

export interface MakeCallOptions {
  to: string;
  fromNumberId: string;
  /** System prompt governing the AI voice agent. */
  outboundInstruction: string;
  language?: string;
  maxDurationSeconds?: number;
  metadata?: Record<string, unknown>;
}

export interface SendMessageOptions {
  to: string;
  fromNumberId: string;
  body: string;
}

export interface Dialer {
  listNumbers(): Promise<DialNumber[]>;
  makeCall(opts: MakeCallOptions): Promise<DialCall>;
  getCall(id: string): Promise<DialCall>;
  waitForCallEnd(id: string, opts?: { timeoutMs?: number; pollMs?: number }): Promise<DialCall>;
  sendMessage(opts: SendMessageOptions): Promise<{ id: string }>;
  connectContextMcp(opts: { name: string; url: string }): Promise<{ id?: string }>;
}

const DEFAULT_BASE = "https://api.getdial.ai/api/v1";

export class DialClient implements Dialer {
  private readonly base: string;
  constructor(
    private readonly apiKey: string,
    base = process.env.DIAL_BASE_URL || DEFAULT_BASE,
  ) {
    if (!apiKey) throw new Error("DialClient requires an API key (DIAL_API_KEY).");
    this.base = base.replace(/\/+$/, "");
  }

  private async req(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(this.base + path, {
      method,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? safeJson(text) : undefined;
    if (!res.ok) {
      const msg = json?.error?.message ?? json?.message ?? text ?? res.statusText;
      throw new Error(`Dial ${method} ${path} failed: ${res.status} ${msg}`);
    }
    return json;
  }

  async listNumbers(): Promise<DialNumber[]> {
    const data = await this.req("GET", "/numbers");
    const arr = Array.isArray(data) ? data : (data?.numbers ?? data?.data ?? []);
    return (arr as any[]).map((n) => ({ id: n.id, phoneNumber: n.phoneNumber ?? n.number }));
  }

  async makeCall(opts: MakeCallOptions): Promise<DialCall> {
    const data = await this.req("POST", "/calls", {
      to: opts.to,
      fromNumberId: opts.fromNumberId,
      outboundInstruction: opts.outboundInstruction,
      language: opts.language ?? "en-US",
      maxDurationSeconds: opts.maxDurationSeconds,
      metadata: opts.metadata,
    });
    return toCall(data);
  }

  async getCall(id: string): Promise<DialCall> {
    return toCall(await this.req("GET", `/calls/${encodeURIComponent(id)}`));
  }

  async waitForCallEnd(
    id: string,
    opts: { timeoutMs?: number; pollMs?: number } = {},
  ): Promise<DialCall> {
    const timeoutMs = opts.timeoutMs ?? 15 * 60_000;
    const pollMs = opts.pollMs ?? 3_000;
    const deadline = Date.now() + timeoutMs;
    let last = await this.getCall(id);
    while (last.status.state !== "Terminated" && Date.now() < deadline) {
      await sleep(pollMs);
      last = await this.getCall(id);
    }
    return last;
  }

  async sendMessage(opts: SendMessageOptions): Promise<{ id: string }> {
    const data = await this.req("POST", "/messages", {
      to: opts.to,
      fromNumberId: opts.fromNumberId,
      body: opts.body,
    });
    return { id: data?.id ?? data?.message?.id ?? "" };
  }

  async connectContextMcp(opts: { name: string; url: string }): Promise<{ id?: string }> {
    const data = await this.req("POST", "/context-mcps", opts);
    return { id: data?.id };
  }
}

/** Offline stand-in. Records what it would send and returns a canned, demoable transcript. */
export class MockDial implements Dialer {
  public readonly sent: SendMessageOptions[] = [];
  public lastInstruction = "";
  private counter = 0;

  async listNumbers(): Promise<DialNumber[]> {
    return [{ id: "mock-number", phoneNumber: "+10000000000" }];
  }

  async makeCall(opts: MakeCallOptions): Promise<DialCall> {
    this.lastInstruction = opts.outboundInstruction;
    const id = `mock-call-${++this.counter}`;
    return { id, status: { state: "Queued" } };
  }

  async getCall(id: string): Promise<DialCall> {
    const turns = cannedTranscript();
    return {
      id,
      status: { state: "Terminated", terminationType: "completed", label: "Completed" },
      duration: 72,
      transcript: turns.map((t) => `${t.speaker}: ${t.text}`).join("\n"),
      transcriptTurns: turns,
    };
  }

  async waitForCallEnd(id: string): Promise<DialCall> {
    return this.getCall(id);
  }

  async sendMessage(opts: SendMessageOptions): Promise<{ id: string }> {
    this.sent.push(opts);
    return { id: `mock-sms-${++this.counter}` };
  }

  async connectContextMcp(opts: { name: string; url: string }): Promise<{ id?: string }> {
    return { id: `mock-mcp-${opts.name}` };
  }
}

/** A realistic standup transcript over the fixture docs: two answered, one unanswered. */
function cannedTranscript(): TranscriptTurn[] {
  return [
    { speaker: "agent", text: "This is SitDOWN, an AI assistant. I'm here if anyone needs me." },
    { speaker: "sam", text: "SitDOWN, remind me why we used idempotency keys for refunds?" },
    {
      speaker: "agent",
      text: "You required an Idempotency-Key header so a retried refund can't double-charge; client-side dedupe was rejected. Source: session claude:abc123.",
    },
    { speaker: "alex", text: "And how do we handle refresh tokens on auth?" },
    {
      speaker: "agent",
      text: "Refresh tokens rotate on every use and the previous one is revoked; access tokens live 15 minutes. Source: session claude:def456.",
    },
    { speaker: "sam", text: "What's our production deploy process these days?" },
    {
      speaker: "agent",
      text: "I don't know — I don't see anything about the deploy process in the docs.",
    },
    { speaker: "alex", text: "Okay, thanks SitDOWN, that's all." },
    { speaker: "agent", text: "Sounds good. I'll go quiet now." },
  ];
}

/** Pick a dialer: real client when an API key is present and not forced to mock, else MockDial. */
export function makeDialer(opts: { apiKey?: string; mock?: boolean } = {}): Dialer {
  const apiKey = opts.apiKey ?? process.env.DIAL_API_KEY;
  if (opts.mock || !apiKey) return new MockDial();
  return new DialClient(apiKey);
}

function toCall(data: any): DialCall {
  const c = data?.call ?? data ?? {};
  const status = c.status ?? {};
  return {
    id: c.id ?? "",
    status: {
      state: (status.state as CallState) ?? "Unknown",
      terminationType: status.terminationType,
      label: status.label,
    },
    duration: c.duration,
    transcript: c.transcript ?? undefined,
    transcriptTurns: Array.isArray(c.transcriptTurns) ? c.transcriptTurns : undefined,
  };
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
