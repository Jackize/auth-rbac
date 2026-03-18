# Milestone 6 – Security Hardening

Implementation notes for the four hardening areas added in this milestone.

---

## 1. Helmet – Explicit Security Headers

**File:** `src/app.js`

### What changed

Replaced bare `helmet()` with explicit options:

```js
app.use(
  helmet({
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    contentSecurityPolicy: true,
    crossOriginResourcePolicy: { policy: "same-origin" },
  }),
);
```

### Why

The default `helmet()` call does not set HSTS. Without HSTS, a browser that initially connects over HTTP can be intercepted before the server redirects to HTTPS (SSL stripping attack). Setting `maxAge: 31536000` (1 year) tells the browser to **never** contact this origin over plain HTTP again.

`preload: true` + `includeSubDomains: true` allows the domain to be submitted to browser preload lists — meaning even a first-ever visit is forced to HTTPS.

### HTTPS redirect (production only)

```js
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    if (req.secure || req.headers["x-forwarded-proto"] === "https") {
      return next();
    }
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  });
}
```

Why production-only: local development doesn't run TLS, so the redirect would break `npm run dev`. The `x-forwarded-proto` check handles the common case where the service sits behind a load balancer or reverse proxy (e.g. AWS ALB, Nginx) that terminates TLS and forwards plain HTTP internally.

---

## 2. Logging – Redact Sensitive Fields + Login Events

### 2a. Sensitive field redaction

**File:** `src/config/logger.js`

```js
export const redactConfig = {
  paths: [
    "password",
    "body.password",
    "req.body.password",
    "refreshToken",
    "accessToken",
    "token",
  ],
  censor: "[REDACTED]",
};
```

This config is passed to both the base `pino` logger and `pino-http`, so it applies to all log output including HTTP request logs.

**Why:** Pino serialises the entire request/response object when logging. Without redaction, a `POST /auth/login` log line would contain the plaintext password submitted by the user. The same applies to tokens in response bodies. If logs are shipped to a third-party collector (Datadog, Loki, CloudWatch), a credential leak in logs is a critical incident.

### 2b. Login event logging

**File:** `src/modules/auth/auth.controller.js`

| Event | Level | Key fields |
|---|---|---|
| Successful login | `info` | `userId`, `event: "login_success"` |
| Wrong password | `warn` | `event: "login_failure"`, `reason`, `ip` |
| Account locked | `warn` | `userId`, `event: "account_locked"`, `lockedUntil` |

**File:** `src/modules/refresh/refresh.controller.js`

| Event | Level | Key fields |
|---|---|---|
| Global logout | `info` | `userId`, `event: "logout"` |

`req.log?.warn(...)` uses optional chaining because `req.log` is attached by the `pino-http` middleware. In unit tests the middleware is not present, so the optional chaining silently skips the log call without throwing.

**Why structured events (not plain strings):** Log aggregators can filter and alert on `event = "login_failure"` directly. A plain string like `"Login failed for user@example.com"` requires regex parsing. Structured fields make it trivial to build dashboards or alert rules in Grafana, Datadog, etc.

---

## 3. JWT Key Rotation

**Files:** `src/utils/env.js`, `src/utils/jwt.js`

### Why key rotation matters

If a private key is ever leaked — from a compromised CI secret, a misconfigured secret manager, or a disgruntled team member — every access token ever signed with it is potentially forged. Rotating to a new key pair limits the blast radius to the period before detection. Without rotation support, you would need to deploy a new key and immediately invalidate **all active sessions**, forcing every user to log in again.

With the dual-key approach here, you can rotate smoothly: existing tokens signed with the old key remain valid for up to 15 minutes (their TTL), then naturally expire. No forced logout.

### How it works

#### Signing

Every new access token now carries a `kid` (key ID) in its JWT header:

```
Header: { "alg": "RS256", "kid": "v1" }
```

The `kid` value comes from `JWT_KEY_ID` env var (defaults to `"v1"`).

#### Verification

`verifyAccessToken` reads the `kid` from the token header and routes to the correct public key:

```
token.kid == current keyId  →  verify with JWT_PUBLIC_KEY
token.kid == old keyId      →  verify with JWT_OLD_PUBLIC_KEY (if not expired)
anything else               →  reject
```

#### Environment variables

| Variable | Required | Description |
|---|---|---|
| `JWT_PRIVATE_KEY` | Yes | Current private key (PEM) |
| `JWT_PUBLIC_KEY` | Yes | Current public key (PEM) |
| `JWT_KEY_ID` | No | ID for the current key. Default: `"v1"` |
| `JWT_OLD_PUBLIC_KEY` | No | Previous public key (PEM), for grace period |
| `JWT_OLD_KEY_ID` | No | ID of the old key (must match `kid` in old tokens) |
| `JWT_OLD_KEY_EXPIRES` | No | ISO date after which old key is fully revoked |

Only the **public** key for the old key pair is needed — you never need to keep the old private key.

---

### Step-by-step rotation playbook

#### Before rotation (current state)

```
JWT_KEY_ID=v1
JWT_PRIVATE_KEY=<v1 private key>
JWT_PUBLIC_KEY=<v1 public key>
```

All tokens in the wild carry `kid: v1`.

---

#### Step 1 — Generate a new key pair

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private-v2.pem
openssl rsa -in private-v2.pem -pubout -out public-v2.pem
```

---

#### Step 2 — Deploy with both keys active

Set a grace period of 15 minutes (= access token TTL) so in-flight tokens signed by `v1` stay valid while new tokens are signed with `v2`.

```env
# New current key
JWT_KEY_ID=v2
JWT_PRIVATE_KEY=<v2 private key>
JWT_PUBLIC_KEY=<v2 public key>

# Old key — grace period until all v1 tokens have expired
JWT_OLD_KEY_ID=v1
JWT_OLD_PUBLIC_KEY=<v1 public key>
JWT_OLD_KEY_EXPIRES=2026-03-15T12:30:00Z   # now + 15 min
```

From this moment, all new tokens are signed with `v2`. Old `v1` tokens are still accepted until `JWT_OLD_KEY_EXPIRES`.

---

#### Step 3 — After expiry, clean up

Once `JWT_OLD_KEY_EXPIRES` has passed, all `v1` tokens have naturally expired (access tokens live 15 min max). Remove the old key vars:

```env
JWT_KEY_ID=v2
JWT_PRIVATE_KEY=<v2 private key>
JWT_PUBLIC_KEY=<v2 public key>

# Remove these three — any stale v1 tokens are now rejected
# JWT_OLD_KEY_ID=
# JWT_OLD_PUBLIC_KEY=
# JWT_OLD_KEY_EXPIRES=
```

---

### Scenario examples

#### Scenario A — Normal request, no rotation in progress

```
Client token header: { kid: "v1" }
Env: JWT_KEY_ID=v1, no OLD vars set

→ kid matches current keyId
→ verify with JWT_PUBLIC_KEY ✓
```

#### Scenario B — Mid-rotation, token issued before the cutover

```
Client token header: { kid: "v1" }
Env: JWT_KEY_ID=v2, JWT_OLD_KEY_ID=v1, JWT_OLD_PUBLIC_KEY=<v1 pub>, JWT_OLD_KEY_EXPIRES=<future>

→ kid != v2 (current)
→ kid == v1 (old), old key loaded, expiry not reached
→ verify with JWT_OLD_PUBLIC_KEY ✓
```

#### Scenario C — Grace period expired, client still holds old token

```
Client token header: { kid: "v1" }
Env: JWT_KEY_ID=v2, JWT_OLD_KEY_ID=v1, JWT_OLD_KEY_EXPIRES=<past>

→ kid != v2 (current)
→ kid == v1 (old), but new Date() >= oldKeyExpiry
→ throw "Token signed with unknown or revoked key"
→ authorize middleware returns 401
```

This forces the client to re-authenticate with new credentials, obtaining a `v2` token.

#### Scenario D — Token with unknown kid (forged or from different service)

```
Client token header: { kid: "v99" }

→ kid != v2 (current)
→ kid != v1 (old) or old key not configured
→ throw "Token signed with unknown or revoked key"
→ 401
```

#### Scenario E — Legacy token with no kid (issued before this milestone)

```
Client token header: { alg: "RS256" }   ← no kid field
Env: JWT_KEY_ID=v1

→ tokenKid is undefined → falls through to current key branch
→ verify with JWT_PUBLIC_KEY ✓
```

Tokens issued before the `kid` field was added are treated as belonging to the current key. This avoids a hard cutover for any tokens still in the wild at deploy time.

---

## 4. Monitoring – Redis Counters + `/metrics` Endpoint

**File:** `src/middleware/metrics.js`

### What it tracks

| Redis key | Incremented when |
|---|---|
| `metrics:login:failure` | Wrong password or credentials |
| `metrics:login:success` | Successful login |
| `metrics:http:401` | Any response with status 401 |
| `metrics:http:403` | Any response with status 403 |

All counters use a 1-hour TTL (sliding, reset on first write in a new window).

### How 401/403 counting works

A `res.on('finish', ...)` hook runs after every response, so the counter reflects the actual status code sent to the client — including responses from `authorize` and `requirePermission` middleware.

### Endpoint

```
GET /metrics
Authorization: Bearer <access token with metrics:read permission>
```

Response:

```json
{
  "login_failures_1h": 42,
  "login_success_1h": 120,
  "http_401_1h": 10,
  "http_403_1h": 3
}
```

**Why it requires `metrics:read` permission:** Counter data reveals attack patterns and internal error rates. It should only be accessible to admins or monitoring services, not regular users. Assign the `metrics:read` permission to the admin role via the existing RBAC seed.

### Alerting guidance

Useful thresholds to wire up in your monitoring tool of choice (Grafana, Datadog, PagerDuty):

| Metric | Suggested alert threshold | Likely cause |
|---|---|---|
| `login_failures_1h` | > 100 | Credential stuffing / brute force |
| `http_401_1h` | Sudden spike | Token invalidation bug or active attack |
| `http_403_1h` | Steady increase | Misconfigured permissions or privilege escalation attempts |
| `login_success_1h` drop | > 50% below baseline | Auth service degradation |
