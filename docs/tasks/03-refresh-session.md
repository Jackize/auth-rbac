# Milestone 3 – Refresh & Session

## Goal
Secure session lifecycle with rotation.

---

## Tasks

### DB
[✅] RefreshToken table
[✅] Hash refresh token before storing
[✅] Add index userId

---

### Refresh Flow
[✅] POST /refresh
[✅] Rotate token
[✅] Revoke old refresh

---

### Reuse Detection
[✅] Detect reused refresh
[✅] Revoke all sessions
[✅] Force re-login

---

### Logout
[✅] Logout single device
[✅] Logout all devices (tokenVersion++)

---

## Test Cases

[✅] Old refresh cannot be reused (covered by `tests/refresh.test.js`)
[✅] Reuse triggers revoke (same test confirms global revocation)
[✅] Logout invalidates session (another test verifies logout flow)