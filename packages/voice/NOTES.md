# Dial — notes & open questions (Agent E)

## Questions for Gal Dayan (onsite) — STILL OPEN
I (the build agent) can't ask onsite. The human should confirm these; I coded defensively so
nothing below blocks the demo.

- [ ] Can a call send keypad (DTMF) tones after connecting, for a meeting PIN?
- [ ] Can the voice agent call tools mid-call?
- [ ] Maximum call length?

## What I found in the docs (https://docs.getdial.ai)
- Node SDK `@getdial/sdk` exists, but I build against the **REST API** so I don't depend on
  unverified SDK method names. Base `https://api.getdial.ai/api/v1`, auth `Authorization: Bearer $DIAL_API_KEY`.
- **Place call:** `POST /calls { to, fromNumberId, outboundInstruction (= system prompt), language, maxDurationSeconds }`.
- **Transcript:** `GET /calls/{id}` → `{ call: { status:{state,terminationType}, duration, transcript, transcriptTurns[] } }`.
  `status.state` reaches `Terminated` when the call ends. We poll until then.
- **SMS:** `POST /messages { to, fromNumberId, body }`. Inbound replies arrive on the account event stream.
- **Numbers:** `GET /numbers` → use `[0].id` as `fromNumberId` (or pass `--from`).
- **Mid-call tools = account-level Context MCP**, not per-call: `POST /context-mcps { name, url }`.
  Once connected, the server's tools become callable by the agent on *all* future calls. Dial sends
  per-call headers (`X-Dial-Direction`, `X-Dial-User-Number`, `X-Dial-Agent-Number`).

## Assumptions I coded against (revisit after asking Gal)
1. **DTMF / meeting PIN:** NOT relied upon. The demo "meeting" is a second phone that answers
   directly, so no PIN entry is needed. If a real meeting needs a PIN, that's a follow-up.
2. **Mid-call tools:** default is **answer-from-briefing-only** (behavior rule 5 + the full briefing
   in `outboundInstruction`). Wiring D's tools mid-call needs the Context MCP to reach a **public**
   URL, but D serves HTTP locally — so it needs a tunnel. `voice connect-mcp --url <publicUrl>` wires
   it when a tunnel exists. Not on the default demo path.
3. **Max call length:** `maxDurationSeconds` defaults to 900 (15 min); override with `--max-seconds`.
   `waitForCallEnd` polls `GET /calls/{id}` every 3s with a 15-min timeout.

## Contract note for Agent D (confirm at Checkpoint 2)
The OVERALL_PLAN tool table names `get_summary / get_brief / search_docs / log_unanswered` and
their inputs but does not pin the **HTTP response JSON**. `src/mcp.ts` is tolerant (accepts a plain
string, a JSON object, or MCP text-content), and defaults to MCP Streamable-HTTP JSON-RPC
`tools/call`; set `MCP_HTTP_MODE=rest` if D exposes plain `POST /<tool>` endpoints. Let's confirm
the envelope so I can tighten parsing.

## Setup
- Docs: https://docs.getdial.ai/documentation/get-started/introduction
- Redeem coupon `DIAL_FOR_SPEEDHACKS` ($100): https://getdial.ai/hackathon/speedhacks/quickstart
- Key from `DIAL_API_KEY`
