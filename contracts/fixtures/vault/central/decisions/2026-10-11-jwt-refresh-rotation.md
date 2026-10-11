---
type: decision
feature: "[[auth]]"
author: alex
sources: [session:claude:def456]
updated: 2026-10-11
---
# Rotate refresh tokens on every use

<!-- auto:start -->
**Chose:** Rotate the refresh token on each use and revoke the previous one; access tokens live 15 minutes.

**Rejected:** A single long-lived refresh token.

**Reason:** Rotation limits the damage if a refresh token is stolen.
<!-- auto:end -->
