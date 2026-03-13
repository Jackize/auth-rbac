# Milestone 5 – Rate Limiting

## Goal
Protect against brute force & DoS.

---

## Tasks

### Login Rate Limit
[✅] 5 attempts/minute per IP
[✅] Lock account after X fails

---

### Refresh Rate Limit
[✅] 10 attempts/minute per user

---

### Redis Keys
[✅] rate:login:<ip>
[✅] rate:refresh:<userId>

---

## Test Cases

[✅] Spam login blocked
[✅] Account locked after threshold
[✅] Spam refresh blocked