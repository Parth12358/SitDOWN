// @sitdown/vault — C.
// In:  ~/.sitdown/processed/*.json (Digest)
// Out: Markdown notes in vault_path; events in Keewano or SQLite.
// Exported so D can import writeDecision/writeDigest for record_decision.

export { AUTO_START, AUTO_END } from "./markers.js";
export { writeDigest, writeDecision, writeBatch, collectAffected } from "./writer.js";
export type { AffectedKeys } from "./writer.js";
export { loadConfig } from "./config.js";
export type { ResolvedConfig } from "./config.js";
export { loadDigests } from "./reads.js";

export * from "./events.js";
