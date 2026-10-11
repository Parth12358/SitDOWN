# @sitdown/voice (Agent E)

A secondary way to read the docs: an assistant that joins a standup/demo by phone (via **Dial**),
answers when addressed by name, and texts each person their follow-ups afterward. **Adds no new
data** — it only reads Agent D's MCP tools.

**PRD:** [`../../prds/PRD-E-voice.md`](../../prds/PRD-E-voice.md) · **Owns:** this package only.

## I/O (contract)
- **In:** D's MCP endpoint — `get_summary`, `get_brief`, `search_docs`, `log_unanswered`.
- **Out:** a phone call + SMS follow-ups via Dial.
- **Until D is live:** the tools are mocked offline from `contracts/fixtures/vault/`
  (embedded in `src/mock-data.ts`). No keys or network needed.

## Build & test
```bash
pnpm --filter @sitdown/voice build
pnpm --filter @sitdown/voice test     # tsc + node:test (briefing + follow-up)
```

## Commands
```bash
# Join a meeting by phone. The demo "meeting" is a second phone that answers.
voice call --to <number> --attendees sam,alex [--from <numberId>] [--max-seconds 900] [--wake-name SitDOWN]

# Text-only fallback standup if calls fail.
voice standup --sms --attendees sam,alex

# Optional: wire D's tools into the voice agent mid-call (needs a PUBLIC url; see NOTES.md).
voice connect-mcp --url https://<public-host>/mcp
```

### Offline vs live
- **Offline (default demo):** add `--dry-run`, or just leave `DIAL_API_KEY` unset and `--mcp` off.
  Everything runs against the mock docs and a `MockDial` that prints the prompt, a sample
  transcript, and the SMS it would send.
- **Live:** set `DIAL_API_KEY` (coupon `DIAL_FOR_SPEEDHACKS`) and point at D with `--mcp http://localhost:7331`
  (or `MCP_HTTP_URL`). At integration, switch mock → live by adding that one flag.

```bash
DIAL_API_KEY=... voice call --to +1555... --attendees sam,alex --mcp http://localhost:7331
```

## Behavior (written into the call's system prompt)
Announce itself as an AI on joining · stay silent until addressed by name · ask "who's asking?" when
unclear · answer briefly · say **"I don't know"** rather than guess · cite the source of each fact.
See `src/prompt.ts`.

## How it works
1. `buildBriefing` calls `get_summary` per attendee and composes the system prompt — decisions and
   the most recent work first, capped to Dial's prompt size (`src/briefing.ts`).
2. `DialClient.makeCall` places the call with that prompt; `waitForCallEnd` polls for the transcript
   (`src/dial.ts`).
3. `runFollowup` pairs questions with answers, sends each unanswered one to `log_unanswered`, and
   texts every attendee their answers + follow-ups (`src/followup.ts`).

## Notes / open questions
Dial specifics (DTMF for meeting PINs, mid-call tools, max call length) and the assumptions coded
against are in [`NOTES.md`](./NOTES.md). The Dial Node SDK `@getdial/sdk` is an alternative to the
REST calls used here.
