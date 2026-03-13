# Auth & Permission Service – Security Design Document

## 1. Overview

This document defines the security architecture for the Auth & Permission Service.

The system provides:

- User authentication (Login, Refresh, Logout)
- JWT-based authorization
- RBAC (Role-Based Access Control)
- Rate limiting & brute-force protection
- Session management (refresh token tracking)
- Security logging & auditing

Primary objective:

> Build a secure, production-grade authentication system with strong attack resistance and clear operational controls.

---

## 2. Threat Model

### 2.1 Assets to Protect

- User credentials
- JWT signing keys
- Refresh tokens
- Role & permission assignments
- Session integrity
- Audit logs

### 2.2 Potential Threats

- Credential stuffing
- Brute-force login
- JWT forgery
- Token replay attack
- Refresh token reuse
- Privilege escalation
- SQL injection
- CSRF (if cookie-based)
- XSS
- Rate limit bypass
- Service DoS

---

## 3. Authentication Design

### 3.1 Password Security

Algorithm: Argon2id

Properties:

- Memory hard
- Resistant to GPU cracking
- Automatic salt generation

Rules:

- Minimum length: 8–12 characters
- Optional complexity enforcement
- Password never logged
- Password never returned in API response

---

### 3.2 JWT Strategy

Algorithm: RS256 (asymmetric)

Why RS256:

- Separation of signing & verification
- Microservice-ready
- Supports key rotation

Access Token:

- Expiration: 10–15 minutes
- Contains:
  - userId
  - role (optional)
  - tokenVersion
  - iat
  - exp

Access token is stateless.

---

### 3.3 Refresh Token Strategy

Refresh token is stateful.

Properties:

- Random 64 bytes
- Hashed before storing in DB
- Stored with:
  - userId
  - deviceId
  - expiresAt
  - revoked flag

Rotation enforced:

- Old refresh token invalidated on use
- New refresh token issued

Prevents:

- Token replay
- Stolen refresh reuse

---

## 4. Session & Logout Design

### 4.1 Single Logout

- Refresh token marked revoked
- Cannot generate new access token

### 4.2 Global Logout

- Increment user.tokenVersion
- All existing access tokens invalidated
- All refresh tokens optionally revoked

---

## 5. Authorization (RBAC)

### 5.1 Data Model

User → UserRole → Role → RolePermission → Permission

Permission format:
resource.action
example: user.create

### 5.2 Authorization Flow

1. Verify JWT
2. Extract userId
3. Load permissions (cache in Redis)
4. Validate required permission

No hardcoded role checks.

---

## 6. Rate Limiting

### 6.1 Login Endpoint

- 5 attempts / minute / IP
- Lock account after X failed attempts

### 6.2 Refresh Endpoint

- 10 attempts / minute / user

### 6.3 Implementation

- Redis-based sliding window
- Keys:
  - rate:login:<ip>
  - rate:refresh:<userId>

---

## 7. Input Validation

All input validated using schema validation (e.g., Zod).

Rules:

- Email format validation
- Password length enforcement
- Reject unknown fields
- Body size limit (10kb)

Prevents:

- Injection attempts
- Payload flooding

---

## 8. Secure Headers

Using Helmet:

- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy
- Content-Security-Policy

HTTPS required in production.

---

## 9. Logging & Monitoring

### 9.1 Logging Strategy

Structured logs (Pino).

Log:

- Login attempts
- Failed login
- Token refresh
- Token reuse detection
- Permission denial
- Account lock

Never log:

- Password
- Raw token
- Secret keys

---

### 9.2 Metrics

Track:

- Login failure rate
- Token refresh frequency
- 401 / 403 rate
- Rate limit hits

---

## 10. Key Management

Private key:

- Stored in secure environment variable or secret manager
- Never committed to repo

Public key:

- Exposed for verification (if microservice architecture)

Key rotation:

- Versioned keys
- Grace period for old tokens

---

## 11. Failure & Abuse Handling

### 11.1 Brute Force Protection

- Increment failed login counter
- Temporary account lock
- Optional IP blacklist

### 11.2 Refresh Token Reuse Detection

If refresh token reused after rotation:

- Revoke all sessions
- Force re-login

---

## 12. Database Security

- Email stored lowercase
- Unique index on email
- Token hash indexed
- Cascade delete for sessions
- Optional audit table

---

## 13. Operational Security

### 13.1 Environment

- NODE_ENV=production
- Disable stack traces
- Limit error exposure

### 13.2 Graceful Shutdown

- Close HTTP server
- Close DB connection
- Flush logs

---

## 14. Future Hardening (Optional)

- MFA (TOTP)
- Device fingerprinting
- Geo-IP anomaly detection
- WebAuthn
- OAuth2 support
- OpenID Connect compliance
- Account recovery flow

---

## 15. Security Principles Applied

- Least privilege
- Defense in depth
- Fail fast
- Explicit authorization
- Stateless access, stateful refresh
- Short-lived tokens
- No sensitive data in JWT
- Auditability

---

# Conclusion

This security design ensures:

- Strong authentication guarantees
- Safe session lifecycle management
- Resilient token handling
- Production-ready RBAC
- Protection against common web attacks

System is designed to scale from monolith to microservice architecture without changing security core.
