// HTTP entry point (voice assistant E, evals F). Port from MCP_HTTP_PORT, default 7331.
// Streamable HTTP in JSON-response mode with per-session transports (MCP spec handshake:
// `initialize` mints an mcp-session-id the client echoes on later requests).
import { createServer as createHttp, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer as createMcp, VERSION } from "./server.js";

const PORT = Number(process.env.MCP_HTTP_PORT ?? 7331);
// Bind to loopback by default: the tools write files (record_decision) and events
// (log_unanswered), so the server must not be reachable from the LAN. Set MCP_HTTP_HOST
// deliberately (e.g. 0.0.0.0) to expose it.
const HOST = process.env.MCP_HTTP_HOST ?? "127.0.0.1";
const MCP_PATH = "/mcp";

// Defense-in-depth against DNS rebinding: only accept Host headers that point at this
// loopback server. Skipped when the operator opted into a non-loopback bind.
const LOOPBACK_HOSTS = new Set([
  `127.0.0.1:${PORT}`,
  `localhost:${PORT}`,
  `[::1]:${PORT}`,
  "127.0.0.1",
  "localhost",
  "[::1]",
]);
function hostAllowed(req: IncomingMessage): boolean {
  if (HOST !== "127.0.0.1" && HOST !== "localhost" && HOST !== "::1") return true; // operator opted out
  const host = (req.headers.host ?? "").toLowerCase();
  return host === "" || LOOPBACK_HOSTS.has(host);
}

interface Session {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}
const sessions = new Map<string, Session>();

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function jsonError(res: ServerResponse, status: number, message: string) {
  if (!res.headersSent) res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }));
}

async function handlePost(req: IncomingMessage, res: ServerResponse) {
  const body = await readBody(req);
  const sid = req.headers["mcp-session-id"] as string | undefined;

  // Existing session: reuse its transport.
  const existing = sid ? sessions.get(sid) : undefined;
  if (existing) {
    await existing.transport.handleRequest(req, res, body);
    return;
  }

  // New session must begin with an `initialize` request.
  if (!sid && isInitializeRequest(body)) {
    const server = createMcp();
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (newId) => {
        sessions.set(newId, { server, transport });
      },
    });
    transport.onclose = () => {
      const id = transport.sessionId;
      if (id) sessions.delete(id);
    };
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
    return;
  }

  jsonError(res, 400, sid ? "Unknown or expired session ID" : "Expected an initialize request to open a session");
}

const http = createHttp((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, name: "sitdown-mcp", version: VERSION, sessions: sessions.size }));
    return;
  }
  if (url.pathname !== MCP_PATH) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found", try: MCP_PATH }));
    return;
  }

  if (!hostAllowed(req)) {
    jsonError(res, 403, "Forbidden host (loopback only)");
    return;
  }

  if (req.method === "POST") {
    handlePost(req, res).catch((e) => {
      console.error(e);
      jsonError(res, 500, String(e));
    });
    return;
  }

  if (req.method === "DELETE") {
    const sid = req.headers["mcp-session-id"] as string | undefined;
    const s = sid ? sessions.get(sid) : undefined;
    if (s) void s.transport.close();
    res.writeHead(s ? 204 : 404).end();
    return;
  }

  // GET (standalone SSE) is not supported in this build.
  res.writeHead(405, { allow: "POST, DELETE" }).end("Method Not Allowed");
});

http.listen(PORT, HOST, () => {
  console.error(`[sitdown-mcp] http server on http://${HOST}:${PORT}${MCP_PATH} (health at /health)`);
});
