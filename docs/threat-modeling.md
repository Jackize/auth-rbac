# Threat Modeling – Auth & Permission Service

Methodology: STRIDE  
Scope: Authentication, Authorization, Session, Token Lifecycle  
Architecture: Express + PostgreSQL + Redis + JWT (RS256)

---

# 1. System Context

## Components

- Client (Web/Mobile)
- Auth Service (Express)
- PostgreSQL (User, RBAC, RefreshToken)
- Redis (Rate Limit)
- JWT Signing Keys
- Logging System

---

# 2. STRIDE Threat Table

| ID | Category | Threat | Attack Scenario | Impact | Mitigation | Residual Risk |
|----|----------|--------|----------------|--------|------------|---------------|

| T1 | Spoofing | Credential stuffing | Attacker uses leaked password database | Account takeover | Rate limit login, account lock, strong hashing (Argon2), monitoring login anomalies | Medium |

| T2 | Spoofing | JWT forgery | Attacker crafts fake JWT | Privilege escalation | RS256 signature verification, secure key storage | Low |

| T3 | Spoofing | Refresh token theft | XSS steals refresh token | Long-term session hijack | HttpOnly cookie OR secure storage, rotation, reuse detection | Medium |

| T4 | Tampering | Token modification | Attacker modifies JWT payload | Bypass role check | Signature verification required | Low |

| T5 | Tampering | Role escalation in DB | Malicious insider modifies role | Admin privilege gain | DB access control, audit log, least privilege DB user | Medium |

| T6 | Tampering | Replay refresh token | Reuse stolen refresh token | Session hijack | Rotation + reuse detection + revoke all sessions | Low |

| T7 | Repudiation | User denies login action | User claims not logged in | Legal / audit issue | Audit logging with IP + timestamp | Low |

| T8 | Repudiation | Admin denies permission change | No tracking of RBAC changes | Compliance issue | Audit log for role/permission changes | Low |

| T9 | Information Disclosure | Password leak in logs | Logging request body | Credential exposure | Never log password, sanitize logs | Low |

| T10 | Information Disclosure | JWT leak via URL | Token passed in query param | Token exposure | Only accept Bearer header | Low |

| T11 | Information Disclosure | SQL Injection | Malicious input in email | DB compromise | Prisma ORM, input validation | Low |

| T12 | Denial of Service | Login brute force | Massive login attempts | CPU exhaustion | Rate limit + IP block + exponential delay | Medium |

| T13 | Denial of Service | Refresh spam | Automated refresh flood | DB overload | Rate limit refresh per user | Medium |

| T14 | Denial of Service | Argon2 abuse | Large number of registration attempts | CPU exhaustion | Rate limit register, queue control | Medium |

| T15 | Elevation of Privilege | Hardcoded role check bypass | Developer error | Unauthorized access | Permission-based middleware | Low |

| T16 | Elevation of Privilege | TokenVersion bypass | Access token still valid | Session persistence after logout | tokenVersion check on every request | Low |

| T17 | Elevation of Privilege | Cache poisoning | Redis manipulation | Permission bypass | Secure Redis network, auth required | Low |

---

# 3. High-Risk Areas

## 3.1 Refresh Token Reuse

Risk:
- Attacker uses old refresh token after rotation.

Mitigation:
- Store refresh hash
- On reuse:
  - Revoke all sessions
  - Force password reset (optional)

---

## 3.2 Key Leakage

Risk:
- Private signing key leaked.

Mitigation:
- Secret manager
- Key rotation policy
- Short access token lifetime
- Immediate key revoke process

---

## 3.3 Brute Force

Risk:
- Password guessing
- Argon2 CPU exhaustion

Mitigation:
- Rate limit
- Exponential backoff
- Account lock
- Captcha (optional)

---

# 4. Attack Surface Summary

| Surface | Exposure Level |
|---------|---------------|
| /login | High |
| /refresh | High |
| /register | Medium |
| /protected routes | Medium |
| RBAC management | High |
| Database | Critical |
| Signing keys | Critical |

---

# 5. Security Assumptions

- TLS enforced
- DB not publicly accessible
- Redis internal network only
- Private key never exposed
- Production logging secured

---

# 6. Residual Risk Analysis

Low Risk:
- JWT tampering
- SQL injection

Medium Risk:
- Credential stuffing
- Refresh token theft
- DoS attempts

Critical Risk (if misconfigured):
- Private key leak
- DB exposure

---

# 7. Recommended Security Enhancements

- MFA (TOTP)
- WebAuthn
- IP anomaly detection
- Geo-location login monitoring
- Device fingerprinting
- HSM for key storage
- WAF in front of API

---

# 8. Threat Modeling Conclusion

System is resilient against:

- Token tampering
- Replay attacks
- Privilege escalation via JWT
- Basic injection attacks

Main operational risks:

- Credential stuffing
- Token theft via XSS
- Infrastructure misconfiguration

Security posture: Strong if operational controls are properly enforced.