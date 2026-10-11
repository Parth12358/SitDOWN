# PRD E: Voice assistant (Dial)

Read `OVERALL_PLAN.md` and `contracts/` first.

## Goal

A secondary way to read the docs: the assistant joins a standup or demo day by phone, answers when called by name, and texts each person their follow-ups afterward. It adds no new data.

## Owns

`packages/voice/` only.

## Inputs and outputs

- **In:** MCP HTTP endpoint from D (`get_summary`, `get_brief`, `search_docs`, `log_unanswered`).
- **Out:** a phone call through Dial; SMS follow-ups.
- **Until D delivers:** mock `get_summary` with a JSON file built from `contracts/fixtures/vault/`.

## Dial

- Docs: https://docs.getdial.ai/documentation/get-started/introduction (Node SDK, CLI, REST)
- Credit: redeem coupon `DIAL_FOR_SPEEDHACKS` ($100) at https://getdial.ai/hackathon/speedhacks/quickstart
- Key from `DIAL_API_KEY`
- Voice calls run an AI agent from a system prompt you provide; SMS send and receive are supported.

## Requirements

- [ ] **First, ask Dial's rep (Gal Dayan) onsite** and record answers in `packages/voice/NOTES.md`: can a call send keypad tones after connecting (meeting PIN)? Can the voice agent call tools mid-call? Maximum call length?
- [ ] Briefing builder: call `get_summary` for each attendee (list from config or CLI args) and compose the system prompt within Dial's size limit. Most recent and most decision-heavy items first.
- [ ] Behavior written into the prompt:
  - Announce itself as an AI assistant on joining
  - Stay silent until addressed by name
  - Ask "who's asking?" if the speaker is unclear
  - Answer briefly; say "I don't know" rather than guess
- [ ] Place the call: `voice call --to <number> --attendees sam,alex`. For the demo, the "meeting" is a second phone.
- [ ] If Dial supports mid-call tools: wire `search_docs` and `get_brief` to D's HTTP endpoint. Otherwise answer from the briefing only.
- [ ] After the call: get the transcript or summary from Dial; for each unanswered question call `log_unanswered`; send each attendee an SMS with their answers and action items.
- [ ] Fallback: `voice standup --sms` runs the standup by text (asks each person, answers from MCP, posts a summary) if calls fail.

## Done when

- [ ] A live call answers two questions correctly from the docs.
- [ ] One follow-up SMS arrives.
- [ ] At least one unanswered question reaches `log_unanswered`.

## Out of scope

Anything that changes the docs; speaker identification by voice print.
