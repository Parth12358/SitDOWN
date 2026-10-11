// @sitdown/mcp — build the MCP server and register all seven tools.
// Shared by the stdio (coding agents) and HTTP (voice E, evals F) entry points.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { loadConfig, type ResolvedConfig } from "./config.js";
import { createEventStore, type EventStore } from "./events/index.js";
import * as tools from "./tools.js";
import type { Ctx } from "./tools.js";

export const VERSION = "0.1.0";

function makeCtx(): { cfg: ResolvedConfig; events: EventStore; base: Omit<Ctx, "requester"> } {
  const cfg = loadConfig();
  const events = createEventStore(cfg);
  return {
    cfg,
    events,
    base: { centralVault: cfg.centralVault, personVaultFor: cfg.personVault, cfg, events },
  };
}

/** Wrap a tool's structured result as an MCP CallToolResult (text + structuredContent). */
function reply(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}

export function createServer(): McpServer {
  const { cfg, events, base } = makeCtx();
  const defaultRequester = process.env.SITDOWN_REQUESTER || undefined;
  const ctx: Ctx = { ...base, requester: defaultRequester };

  if (cfg.usingFixtures) {
    console.error(`[sitdown-mcp] using fixtures vault: ${cfg.centralVault}`);
  }
  console.error(`[sitdown-mcp] central=${cfg.centralVault} vaults_root=${cfg.vaultsRoot} events=${events.kind}`);

  const server = new McpServer(
    { name: "sitdown", version: VERSION },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "get_brief",
    {
      title: "Get brief",
      description:
        "Resume context for a feature or branch: the 5 most recent decisions (chosen, rejected, reason), open threads, and who else is working on it. Call this at the start of a session.",
      inputSchema: {
        branch: z.string().optional().describe("e.g. feat/payments"),
        feature: z.string().optional().describe("feature name; resolved from branch if omitted"),
        requester: z.string().optional().describe("author slug of the caller (gates private notes)"),
      },
    },
    async (input) => reply(await tools.get_brief(input, ctx)),
  );

  server.registerTool(
    "search_docs",
    {
      title: "Search docs",
      description: "Keyword search over note text and frontmatter; returns the top 5 notes with path, snippet, and sources.",
      inputSchema: {
        query: z.string(),
        requester: z.string().optional(),
      },
    },
    async (input) => reply(await tools.search_docs(input, ctx)),
  );

  server.registerTool(
    "get_summary",
    {
      title: "Get summary",
      description: "Short spoken-friendly summary per person over daily notes in a date range. For standups and demo day.",
      inputSchema: {
        author: z.string().optional(),
        from: z.string().optional().describe("YYYY-MM-DD"),
        to: z.string().optional().describe("YYYY-MM-DD"),
        requester: z.string().optional(),
      },
    },
    async (input) => reply(await tools.get_summary(input, ctx)),
  );

  server.registerTool(
    "get_decision",
    {
      title: "Get decision",
      description: "A decision record by exact slug, else best keyword match on topic: chosen, rejected, reason.",
      inputSchema: {
        slug: z.string().optional(),
        topic: z.string().optional(),
      },
    },
    async (input) => reply(await tools.get_decision(input, ctx)),
  );

  server.registerTool(
    "who_knows",
    {
      title: "Who knows",
      description: "People ranked by recent activity on a feature (FeatureTouched + CommitMade), from the event store.",
      inputSchema: { feature: z.string() },
    },
    async (input) => reply(await tools.who_knows(input, ctx)),
  );

  server.registerTool(
    "log_unanswered",
    {
      title: "Log unanswered question",
      description: "Record a documentation gap (QuestionAsked + AnswerFound=false) and return the best person to ping.",
      inputSchema: {
        topic: z.string(),
        asked_by: z.string().optional(),
      },
    },
    async (input) => reply(await tools.log_unanswered(input, ctx)),
  );

  server.registerTool(
    "record_decision",
    {
      title: "Record decision",
      description: "Write a new decision note to the vault and emit a DecisionRecorded event. Returns the note path.",
      inputSchema: {
        title: z.string(),
        chosen: z.string(),
        rejected: z.array(z.string()).optional(),
        reason: z.string(),
        feature: z.string(),
        requester: z.string().optional(),
      },
    },
    async (input) => reply(await tools.record_decision(input, ctx)),
  );

  return server;
}
