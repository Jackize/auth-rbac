# Auth & Permission Service – Security Audit Checklist

Version: 1.0  
Scope: Authentication, Authorization, Session Management, Token Handling

---

# 1. Infrastructure Security

## 1.1 Environment Configuration

[ ] NODE_ENV=production in production  
[ ] Secrets stored in environment variables or secret manager  
[ ] No secrets committed to Git repository  
[ ] TLS enforced (HTTPS only)  
[ ] HTTP disabled or redirected

---

## 1.2 Server Hardening

[✅] Helmet enabled  
[✅] CORS restricted to allowed origins  
[✅] Body size limit configured (≤ 10kb recommended)  
[✅] Error stack traces hidden in production  
[✅] Graceful shutdown implemented  
[✅] Process crash logging enabled

---

# 2. Authentication Security

## 2.1 Password Storage

[✅] Argon2id used for hashing  
[✅] No plain text password stored  
[✅] Password never logged  
[✅] Password policy enforced (min length ≥ 8)  
[ ] Account lock after repeated failed login

---

## 2.2 Login Protection

[ ] Rate limit per IP on login  
[ ] Brute-force detection implemented  
[ ] Failed login counter stored  
[ ] Account lock duration defined

---

# 3. JWT Security

## 3.1 Access Token

[✅] RS256 used (or justified alternative)  
[✅] Access token expiration ≤ 15 minutes  
[✅] No sensitive data inside JWT  
[✅] tokenVersion included in payload  
[✅] Signature verified on every request

---

## 3.2 Key Management

[ ] Private key securely stored  
[ ] Public key exposed only if required  
[ ] Key rotation strategy documented  
[ ] Old key grace period defined  
[ ] Key versioning implemented

---

# 4. Refresh Token Security

## 4.1 Storage

[ ] Refresh token random ≥ 64 bytes  
[ ] Refresh token hashed before storing  
[ ] Refresh token never logged  
[ ] Unique index on token hash

---

## 4.2 Rotation

[ ] Refresh token rotation enforced  
[ ] Old refresh invalidated after use  
[ ] Token reuse detection implemented  
[ ] Reuse triggers session revoke

---

## 4.3 Expiration

[ ] Refresh token expiration defined  
[ ] Expired tokens cleaned by scheduled job  
[ ] Revoked flag implemented

---

# 5. Session Management

[ ] Multiple device sessions supported  
[ ] Global logout increments tokenVersion  
[ ] Logout revokes refresh token  
[ ] Session table indexed by userId

---

# 6. Authorization (RBAC)

## 6.1 Design

[ ] No hardcoded role checks  
[ ] Permission-based access control  
[ ] Permissions follow naming convention (resource.action)  
[ ] Role-permission mapping stored in DB

---

## 6.2 Enforcement

[ ] JWT verified before permission check  
[ ] Permission middleware enforced  
[ ] 401 used for unauthenticated  
[ ] 403 used for unauthorized

---

# 7. Input Validation

[ ] All request bodies validated  
[ ] Email format validated  
[ ] Unknown fields rejected  
[ ] Query parameters validated  
[ ] Path parameters validated

---

# 8. Rate Limiting

[ ] Login endpoint rate-limited  
[ ] Refresh endpoint rate-limited  
[ ] Per-user and per-IP strategies defined  
[ ] Redis used for distributed rate limit  
[ ] Rate limit bypass tested

---

# 9. Database Security

[ ] Unique index on email  
[ ] Email stored lowercase  
[ ] Cascade delete for sessions  
[ ] Prisma query parameterized  
[ ] No raw SQL without sanitization

---

# 10. Logging & Monitoring

## 10.1 Logging

[ ] Structured logging (Pino)  
[ ] Login success logged  
[ ] Login failure logged  
[ ] Permission denial logged  
[ ] Token reuse logged  
[ ] No sensitive data logged

---

## 10.2 Monitoring

[ ] Alert on high login failure rate  
[ ] Alert on abnormal refresh frequency  
[ ] Alert on repeated rate limit hits  
[ ] 401/403 metrics tracked

---

# 11. Security Testing

[ ] Manual token tampering tested  
[ ] Expired token tested  
[ ] Refresh reuse tested  
[ ] SQL injection attempt tested  
[ ] XSS header protection tested  
[ ] Rate limit stress tested

---

# 12. Disaster Recovery

[ ] Database backup enabled  
[ ] Key backup stored securely  
[ ] Restore procedure documented  
[ ] RTO/RPO defined

---

# 13. Compliance & Governance

[ ] Security policy documented  
[ ] Password policy documented  
[ ] Token expiration policy documented  
[ ] Access review process defined  
[ ] Audit logs retained for defined period

---

# 14. Final Security Gate

Before Production Release:

[ ] All checklist items reviewed  
[ ] No high/critical vulnerabilities open  
[ ] Secrets rotated  
[ ] Test environment isolated  
[ ] Load test performed

---

# Security Approval

Reviewer: ********\_\_\_********  
Date: **********\_\_\_**********  
Status: APPROVED / REJECTED
