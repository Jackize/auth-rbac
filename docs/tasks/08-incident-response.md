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

[ ] Disable compromised key
[ ] Rotate signing key
[ ] Invalidate all active access tokens
[ ] Increment tokenVersion for all users
[ ] Force global logout

### Recovery

[ ] Deploy new key pair
[ ] Reissue tokens
[ ] Audit logs for misuse

### Post-Incident

[ ] Root cause analysis
[ ] Patch secret storage
[ ] Update key rotation frequency

---

## 3.2 Refresh Token Reuse Attack

### Detection

- Same refresh token used twice after rotation

### Immediate Actions

[ ] Revoke all sessions of affected user
[ ] Invalidate all refresh tokens for that user
[ ] Force password reset (optional)

### Investigation

[ ] Check IP addresses
[ ] Check deviceId mismatch
[ ] Check suspicious login history

---

## 3.3 Credential Stuffing Attack

### Detection

- High login failure rate from multiple IPs

### Immediate Actions

[ ] Enable strict rate limiting
[ ] Temporarily lock affected accounts
[ ] Enable IP blocklist
[ ] Consider CAPTCHA

### Recovery

[ ] Monitor for successful compromise
[ ] Notify affected users

---

## 3.4 Privilege Escalation

### Detection

- Role change without admin audit log
- Unauthorized permission usage

### Immediate Actions

[ ] Revoke admin sessions
[ ] Lock affected accounts
[ ] Audit role-permission mapping

### Investigation

[ ] Review RBAC change logs
[ ] Inspect DB integrity
[ ] Verify API logs

---

## 3.5 Database Compromise

### Detection

- Unauthorized DB access
- Data leak detected

### Immediate Actions

[ ] Rotate DB credentials
[ ] Rotate signing keys
[ ] Invalidate all sessions
[ ] Enable read-only mode if needed

### Recovery

[ ] Restore from backup (if corrupted)
[ ] Audit data integrity
[ ] Notify stakeholders

---

# 4. Containment Strategy

For any incident:

[ ] Isolate affected component
[ ] Stop further damage
[ ] Preserve logs
[ ] Do not delete evidence

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

[ ] Vulnerability patched
[ ] Keys rotated
[ ] Sessions revoked
[ ] System redeployed
[ ] Monitoring active

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

[ ] Monitoring configured
[ ] Alerts tested
[ ] Key rotation documented
[ ] Backup restore tested
[ ] On-call escalation defined

---

# Conclusion

Security is not only about prevention.
It is about controlled response under pressure.

A secure system is one that:

- Detects fast
- Contains quickly
- Recovers safely
- Learns continuously
