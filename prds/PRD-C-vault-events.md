# PRD C: Vault writer and events

Read `OVERALL_PLAN.md` and `contracts/` first.

## Goal

Turn Digests into an Obsidian-compatible Markdown vault people own, plus a stream of typed events the product queries to decide what to do.

## Owns

`packages/vault/` only.

## Inputs and outputs

- **In:** `~/.sitdown/processed/*.json` (Digest).
- **Out:** Markdown notes split across a shared **central** vault and one **personal** vault per person (both under `vaults_root`); events in Keewano or SQLite (per `event_store` in config). Formats in `OVERALL_PLAN.md`.
  - **Central** (`<vaults_root>/central/`): `features/`, `decisions/`, team `daily/` (all people), and a shareable `people/<author>.md` index (`private: false`).
  - **Personal** (`<vaults_root>/<author>/`): that author's own `daily/<date>.md` + a private `me.md` (`private: true`). Only their own activity — never anyone else's. Cross-references into central use `obsidian://` links.
- **Until B delivers:** use `contracts/fixtures/processed/`.

## Requirements

### Vault

- [ ] Four note types: `daily/<date>.md`, `features/<feature>.md`, `decisions/<date>-<slug>.md`, `people/<author>.md`, each with the frontmatter in the contract and `[[wikilinks]]` between them.
- [ ] Write only between `<!-- auto:start -->` and `<!-- auto:end -->`. Never change text outside the markers. Create the markers at the top of a note that has none.
- [ ] Feature notes: history newest first; each entry links its decision records and cites its source.
- [ ] Daily notes: one section per person with headlines and links.
- [ ] Person notes: contributions and decisions; marked `private: true` in frontmatter by default.
- [ ] Only regenerate notes whose features had new Digests (selective updates).
- [ ] The vault is a git repo; commit after each batch, message naming the sources.
- [ ] Atomic writes: temp file then rename.
- [ ] Export the writer as a module (`writeDecision`, `writeDigest`) so D can import it for `record_decision`.

### Events

- [ ] One adapter interface, two backends:
  - **Keewano:** REST ingress (`https://api.keewano.com/event/ingress/v1/json`), register custom events once (IDs 2000 and up), entity `installId` = UUIDv5 of author, timestamps from the Digest. Docs: https://docs.keewano.com/getting-started/speedhacks-quickstart
  - **SQLite:** with `sql.js` (pure JavaScript, works on Windows), one `events` table: entity, name, value, ts.
- [ ] Emit the events in the contract; send `FeatureTouched` before the event it applies to. Categories and numbers only, never raw text.
- [ ] `scripts`-style backfill command in this package: replay the repo's git history as `FeatureTouched` + `CommitMade` + `AuthorType` events with original timestamps, so Keewano has history from the start. Keewano needs about 5 minutes before new events are queryable; run backfill early.

## Done when

- [ ] Fixture Digests produce a vault that opens in Obsidian with working links and graph view.
- [ ] A hand-written line added outside the markers survives a second run.
- [ ] Events appear in both Keewano (check with a query in the Keewano app) and SQLite.
- [ ] Backfill has run against this repo.

## Out of scope

Summarizing (B), serving queries (D).
