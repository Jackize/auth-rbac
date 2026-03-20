# Milestone 8 – Incident Response Plan

## Goal

Define clear response procedures when a security incident occurs.

This document describes:

- Detection
- Containment
- Eradication
- Recovery
- Post-Incident Review

Scope:

- JWT compromise
- Refresh token reuse attack
- Credential stuffing attack
- Database breach
- Signing key leak
- Privilege escalation

---

# 1. Incident Severity Classification

## Severity Levels

### SEV-1 (Critical)

- Private signing key leaked
- Database compromised
- Admin privilege escalation
- Active token forgery detected

Immediate action required.

---

### SEV-2 (High)

- Refresh token reuse detected
- Credential stuffing attack ongoing
- Suspicious login spike

Action required within hours.

---

### SEV-3 (Medium)

- Elevated login failure rate
- Minor permission misconfiguration

Investigate within 24h.

---

# 2. Detection Strategy

## Monitoring Signals

- Login failure rate spike
- Refresh reuse detection triggered
- 401/403 anomaly spike
- Token verification failure spike
- Unexpected role changes
- DB access anomaly

---

# 3. Incident Playbooks

---

## 3.1 JWT Signing Key Compromise (SEV-1)

### Detection

- Unauthorized tokens validated successfully
- Key leak confirmed

### Immediate Actions

[ ] Disable compromised key — manual: remove JWT_PRIVATE_KEY/JWT_PUBLIC_KEY from env + redeploy
[x] Rotate signing key — supported: set JWT_OLD_PUBLIC_KEY/JWT_OLD_KEY_ID/JWT_OLD_KEY_EXPIRES env vars; verifyAccessToken validates both keys during grace period
[ ] Invalidate all active access tokens — partial: incrementTokenVersion is per-user only; no bulk endpoint exists
[ ] Increment tokenVersion for all users — not implemented: would need a DB migration or admin endpoint
[ ] Force global logout — not implemented: revokeAllRefreshTokens is per-user only (POST /auth/logout-all)

### Recovery

[x] Deploy new key pair — supported: env-based key rotation; old key honored for oldKeyExpiry grace period, then discarded
[x] Reissue tokens — automatic: users re-authenticate with new key pair after grace period
[ ] Audit logs for misuse — partial: pino logs login/logout events but no dedicated security audit log query

### Post-Incident

[ ] Root cause analysis — manual process
[ ] Patch secret storage — manual process
[ ] Update key rotation frequency — manual process (policy change)

---

## 3.2 Refresh Token Reuse Attack

### Detection

- Same refresh token used twice after rotation

### Immediate Actions

[x] Revoke all sessions of affected user — automatic: generateRefreshToken calls revokeTokensByUserId when a revoked token is reused (theft detection in refresh.controller.js)
[x] Invalidate all refresh tokens for that user — automatic: same revokeTokensByUserId call covers all refresh tokens for the user
[ ] Force password reset (optional) — not implemented: no password reset endpoint exists

### Investigation

[ ] Check IP addresses — not implemented: IP not stored per token; only available in pino request logs
[ ] Check deviceId mismatch — partial: deviceId stored on RefreshToken record but no comparison logic implemented
[ ] Check suspicious login history — not implemented: no login history query endpoint

---

## 3.3 Credential Stuffing Attack

### Detection

- High login failure rate from multiple IPs

### Immediate Actions

[x] Enable strict rate limiting — implemented: 5 attempts/min per IP on POST /auth/login via Redis sliding window (rate.limit.login.js)
[x] Temporarily lock affected accounts — implemented: LOCKED status set automatically after MAX_FAILED_LOGIN_ATTEMPTS failures; auto-unlocks after LOCK_DURATION_MINUTES
[ ] Enable IP blocklist — not implemented: no IP blocklist mechanism
[ ] Consider CAPTCHA — not implemented

### Recovery

[ ] Monitor for successful compromise — partial: metrics track login_failures_1h and login_success_1h via GET /metrics but no alerting
[ ] Notify affected users — not implemented: no email/notification system

---

## 3.4 Privilege Escalation

### Detection

- Role change without admin audit log
- Unauthorized permission usage

### Immediate Actions

[ ] Revoke admin sessions — partial: POST /auth/logout-all revokes per-user but no bulk admin session revoke
[x] Lock affected accounts — implemented: status field supports LOCKED; recordFailedLogin sets it; can be set directly in DB
[ ] Audit role-permission mapping — not implemented: no audit log for RBAC changes

### Investigation

[ ] Review RBAC change logs — not implemented: no RBAC change audit trail
[ ] Inspect DB integrity — manual: no automated integrity check
[x] Verify API logs — implemented: pino logs all auth events (login_success, login_failure, account_locked, logout) with userId and IP

---

## 3.5 Database Compromise

### Detection

- Unauthorized DB access
- Data leak detected

### Immediate Actions

[ ] Rotate DB credentials — manual: update DATABASE_URL env var + redeploy
[x] Rotate signing keys — implemented: env-based key rotation with grace period (JWT_OLD_PUBLIC_KEY + JWT_OLD_KEY_EXPIRES)
[ ] Invalidate all sessions — partial: per-user via logout-all; no bulk revocation across all users
[ ] Enable read-only mode if needed — not implemented

### Recovery

[ ] Restore from backup (if corrupted) — manual: infrastructure-level operation
[ ] Audit data integrity — manual: no automated integrity check
[ ] Notify stakeholders — manual: no automated notification

---

# 4. Containment Strategy

For any incident:

[ ] Isolate affected component — manual: infrastructure-level (reverse proxy, firewall rules)
[ ] Stop further damage — partial: rate limiting + account lockout limit blast radius automatically
[x] Preserve logs — implemented: pino structured logging (stdout); Redis metrics with 1h TTL window
[ ] Do not delete evidence — policy, not code

---

# 5. Communication Plan

## Internal

- Notify engineering lead
- Notify security team
- Document timeline

## External (if needed)

- Notify users (if account compromised)
- Follow compliance requirements
- Provide incident summary

---

# 6. Recovery Checklist

[ ] Vulnerability patched — manual: code fix + PR review
[x] Keys rotated — implemented: env-based rotation with backward-compatible grace period
[ ] Sessions revoked — partial: per-user only; no global bulk revocation
[ ] System redeployed — manual: CI/CD pipeline
[x] Monitoring active — implemented: GET /metrics (requires metrics:read permission) exposes login_failures_1h, http_401_1h, http_403_1h

---

# 7. Post-Incident Review (PIR)

Within 48 hours:

- What happened?
- How was it detected?
- How long until containment?
- Root cause?
- What controls failed?
- What improvements required?

Produce:

- Written incident report
- Security improvement plan

---

# 8. Key Rotation Policy

- Rotate signing key every 90 days
- Immediate rotation on compromise
- Maintain key versioning
- Keep old key for max 24h grace period

---

# 9. Backup & Recovery

- Daily DB backup
- Backup encryption
- Tested restore procedure
- RTO defined
- RPO defined

---

# 10. Incident Readiness Checklist

Before Production:

[x] Monitoring configured — implemented: metricsMiddleware tracks 401/403 counts; login success/failure tracked in Redis with 1h TTL
[ ] Alerts tested — not implemented: no alerting system (no thresholds, no notifications)
[x] Key rotation documented — implemented: JWT_OLD_PUBLIC_KEY, JWT_OLD_KEY_ID, JWT_OLD_KEY_EXPIRES documented in CLAUDE.md
[ ] Backup restore tested — manual: infrastructure-level
[ ] On-call escalation defined — manual: organizational process

---

# Conclusion

Security is not only about prevention.
It is about controlled response under pressure.

A secure system is one that:

- Detects fast
- Contains quickly
- Recovers safely
- Learns continuously
