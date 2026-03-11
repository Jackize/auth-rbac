# Milestone 2 – JWT Access Control

## Goal
Protect route using RS256 access token.

---

## Tasks

### Key Management
[✅] Generate RSA key pair
[✅] Store private key securely
[✅] Export public key

---

### JWT
[✅] signAccessToken()
[✅] verifyAccessToken()
[✅] tokenVersion included
[✅] Access expiry ≤ 15 minutes

---

### Middleware
[✅] verifyJWT middleware
[✅] Protect /protected route

---

## Test Cases

[✅] Expired token rejected
[✅] Modified token rejected
[✅] Missing token returns 401