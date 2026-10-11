// @sitdown/voice — E. Embedded mock of D's tool outputs, derived from contracts/fixtures/vault/.
// Compiled into dist so the offline mock needs no file IO. A JSON override can still be passed to
// MockMcpClient (see src/fixtures/summary.mock.json for the same data in file form).
import type { Brief, PersonSummary, SearchResult } from "./mcp.js";

export interface MockData {
  summaries: PersonSummary[];
  briefs: Record<string, Brief>;
  search: SearchResult[];
}

export const MOCK_DATA: MockData = {
  summaries: [
    {
      author: "sam",
      date: "2026-10-11",
      headline: "Shipped refund endpoint with idempotency keys; fixed refund rounding.",
      items: [
        {
          text: "Added refund endpoint with idempotency keys",
          feature: "payments",
          decision: "refund-idempotency",
          source: "session:claude:abc123",
          date: "2026-10-11",
        },
        {
          text: "Fixed refund rounding",
          feature: "payments",
          source: "commit:9f2e1d",
          date: "2026-10-11",
        },
      ],
      decisions: [
        {
          slug: "refund-idempotency",
          title: "Use idempotency keys for refunds",
          chosen:
            "Require an Idempotency-Key header; store processed keys and return the stored result on retry.",
          rejected: ["Client-side dedupe (the agent's first attempt)."],
          reason: "A retried refund from a different device must not double-charge.",
          feature: "payments",
          source: "session:claude:abc123",
        },
      ],
    },
    {
      author: "alex",
      date: "2026-10-11",
      headline: "Added JWT refresh tokens with rotation; rate-limited the login route.",
      items: [
        {
          text: "Added JWT refresh tokens with rotation",
          feature: "auth",
          decision: "jwt-refresh-rotation",
          source: "session:claude:def456",
          date: "2026-10-11",
        },
        {
          text: "Rate-limited the login route (5/min per IP)",
          feature: "auth",
          source: "session:codex:ghi789",
          date: "2026-10-11",
        },
      ],
      decisions: [
        {
          slug: "jwt-refresh-rotation",
          title: "Rotate refresh tokens on every use",
          chosen:
            "Rotate the refresh token on each use and revoke the previous one; access tokens live 15 minutes.",
          rejected: ["A single long-lived refresh token."],
          reason: "Rotation limits the damage if a refresh token is stolen.",
          feature: "auth",
          source: "session:claude:def456",
        },
      ],
    },
  ],
  briefs: {
    payments: {
      feature: "payments",
      decisions: [
        {
          slug: "refund-idempotency",
          title: "Use idempotency keys for refunds",
          chosen:
            "Require an Idempotency-Key header; store processed keys and return the stored result on retry.",
          rejected: ["Client-side dedupe (the agent's first attempt)."],
          reason: "A retried refund from a different device must not double-charge.",
          feature: "payments",
          source: "session:claude:abc123",
        },
      ],
      openThreads: [],
      alsoWorkingOnIt: ["sam"],
    },
    auth: {
      feature: "auth",
      decisions: [
        {
          slug: "jwt-refresh-rotation",
          title: "Rotate refresh tokens on every use",
          chosen:
            "Rotate the refresh token on each use and revoke the previous one; access tokens live 15 minutes.",
          rejected: ["A single long-lived refresh token."],
          reason: "Rotation limits the damage if a refresh token is stolen.",
          feature: "auth",
          source: "session:claude:def456",
        },
      ],
      openThreads: [],
      alsoWorkingOnIt: ["alex"],
    },
  },
  search: [
    {
      path: "decisions/2026-10-11-refund-idempotency.md",
      snippet:
        "Require an Idempotency-Key header; store processed keys and return the stored result on retry. A retried refund must not double-charge.",
      sources: ["session:claude:abc123", "commit:9f2e1d"],
    },
    {
      path: "decisions/2026-10-11-jwt-refresh-rotation.md",
      snippet:
        "Rotate the refresh token on each use and revoke the previous one; access tokens live 15 minutes.",
      sources: ["session:claude:def456"],
    },
    {
      path: "features/payments.md",
      snippet: "Fixed refund rounding. Added refund endpoint with idempotency keys.",
      sources: ["commit:9f2e1d", "session:claude:abc123"],
    },
    {
      path: "features/auth.md",
      snippet: "Rate-limited the login route (5/min per IP). Added JWT refresh tokens with rotation.",
      sources: ["session:codex:ghi789", "session:claude:def456"],
    },
  ],
};
