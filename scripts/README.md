# scripts/ (Agent F)

Node-only operational scripts. Must run on Linux, Mac, and Windows (`path.join` + `os.homedir()`).

- `demo-reset.mjs` — reset vault + event store to a known demo state, then replay today's sessions through B and C.

Backfill of git history into events lives in `@sitdown/vault` (C owns the event adapter).
