// Entity id = UUIDv5(author, namespace). Ported verbatim from
// contracts/make-events-sqlite.mjs so C's entities match the seeded fixture exactly.
import { createHash } from "node:crypto";

/** RFC 4122 DNS namespace — must match contracts/fixtures/events.seed.json. */
export const ENTITY_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/** RFC 4122 UUIDv5 (SHA-1). */
export function uuidv5(name: string, namespace: string): string {
  const nsBytes = namespace
    .replace(/-/g, "")
    .match(/.{2}/g)!
    .map((b) => parseInt(b, 16));
  const hash = createHash("sha1");
  hash.update(Buffer.from(nsBytes));
  hash.update(Buffer.from(name, "utf8"));
  const bytes = hash.digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** installId entity for an author. */
export function entityFor(author: string): string {
  return uuidv5(author, ENTITY_NAMESPACE);
}
