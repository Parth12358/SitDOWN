// stdio entry point (coding agents). Register tools and serve over stdio.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[sitdown-mcp] stdio server ready");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
