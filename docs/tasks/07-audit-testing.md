# Milestone 7 – Audit & Threat Testing

## Goal

Validate system against attack scenarios.

---

## Manual Tests

[x] JWT tampering — rejects tampered signatures, unknown kid, malformed tokens (401)
[x] Expired token — rejects expired JWTs and stale tokenVersion after logout-all (401)
[x] Refresh reuse — detects theft: revokes ALL user sessions when revoked token reused (401)
[x] SQL injection attempt — validation layer rejects all SQL payloads before reaching DB (400)
[x] XSS header check — helmet sets CSP, X-Frame-Options, X-Content-Type-Options, HSTS; no X-Powered-By
[x] Rate limit stress test — 429 after 6th login attempt, 503 on Redis failure, headers correct

---

## Security Review

[x] Security checklist reviewed — 36 integration tests in tests/security.audit.test.js
[x] Threat model validated — all 6 attack vectors covered with automated tests
[x] No high-risk vulnerability open — validation, rate limiting, token theft detection all verified

---

## Final Approval

Reviewer: automated integration tests
Date: 2026-03-18
Status: APPROVED
