---
type: decision
feature: "[[payments]]"
author: sam
sources: [session:claude:abc123, commit:9f2e1d]
updated: 2026-10-11
---
# Use idempotency keys for refunds

<!-- auto:start -->
**Chose:** Require an `Idempotency-Key` header; store processed keys and return the stored result on retry.

**Rejected:** Client-side dedupe (the agent's first attempt).

**Reason:** A retried refund from a different device must not double-charge.
<!-- auto:end -->

Hand-written notes below are never touched.
