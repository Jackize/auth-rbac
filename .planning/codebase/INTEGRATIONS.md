# External Integrations

**Analysis Date:** 2026-03-18

## APIs & External Services

No third-party external HTTP APIs are consumed. All integrations are infrastructure-level (database and cache).

## Data Storage

**Databases:**
- PostgreSQL
  - Connection: `DATABASE_URL` env var
  - Client: Prisma ORM (`@prisma/client` 7.4.1) with `@prisma/adapter-pg` adapter
  - Singleton: `src/infra/prisma.js` exports `prisma` instance
  - Schema: `prisma/schema.prisma`
  - Migrations: `prisma/migrations/`
  - Generated client: `src/generated/prisma/`
  - Models: `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `RefreshToken`

**File Storage:**
- Not used

**Caching / Session Store:**
- Redis (ioredis 5.9.3)
  - Connection: `REDIS_URL` env var
  - Singleton: `src/config/redis.js` exports `getRedis()`
  - Used for:
    1. Rate limiting - sliding window counters via Lua script (`src/middleware/rateLimitRedis.js`)
       - `rate:login:<ip>` - login rate limit (5/min per IP)
       - `rate:refresh:<userId>` - refresh token rate limit (10/min per user)
    2. Metrics counters (`src/middleware/metrics.js`)
       - `metrics:login:failure`, `metrics:login:success`, `metrics:http:401`, `metrics:http:403`
       - 1-hour TTL per counter

## Authentication & Identity

**Auth Provider:**
- Custom (self-hosted, no third-party auth provider)
  - Passwords: Argon2id hashing via `argon2` library (`src/utils/password.js`); memoryCost 64 MB, timeCost 3, parallelism 1
  - JWTs: RS256-signed access tokens via `jose` library (`src/utils/jwt.js`); 15-minute expiry
  - JWT keys: loaded from `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` env vars; key rotation supported via `JWT_OLD_PUBLIC_KEY` / `JWT_OLD_KEY_ID` / `JWT_OLD_KEY_EXPIRES`
  - Key IDs: `JWT_KEY_ID` (current, default `"v1"`), `JWT_OLD_KEY_ID` (previous)
  - Refresh tokens: stored as SHA-256 hashes in `RefreshToken` table; 7-day TTL; rotated on every use
  - RBAC: roles and permissions stored in PostgreSQL; live DB lookup on every protected request via `src/middleware/require.permission.js`
  - Account lockout: tracked via `User.failedLoginAttempts` and `User.lockedUntil` columns; configurable via `MAX_FAILED_LOGIN_ATTEMPTS` and `LOCK_DURATION_MINUTES` env vars
  - Global logout: `User.tokenVersion` incremented; checked on every authorized request in `src/middleware/authorize.js`
  - Token theft detection: revoked token reuse triggers full session revocation for the user

## Monitoring & Observability

**Error Tracking:**
- Not used (no Sentry, Datadog, or similar integration)

**Logs:**
- Pino structured JSON logger (`src/config/logger.js`)
- Sensitive fields redacted: `password`, `body.password`, `req.body.password`, `refreshToken`, `accessToken`, `token` → replaced with `[REDACTED]`
- Log level controlled by `LOG_LEVEL` env var (defaults to `"info"`)
- HTTP request/response logged via `pino-http` middleware in `src/app.js`
- Metrics endpoint `GET /metrics` exposes Redis counters (requires `metrics:read` permission)

## CI/CD & Deployment

**Hosting:**
- Not configured (no Dockerfile, no platform configuration files detected)

**CI Pipeline:**
- Not configured (no `.github/workflows/`, no CI config files detected)

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_PRIVATE_KEY` - RSA private key PEM (`\n` for newlines)
- `JWT_PUBLIC_KEY` - RSA public key PEM (`\n` for newlines)
- `CORS_ORIGIN` - Allowed origin for CORS
- `PORT` - HTTP listen port
- `NODE_ENV` - Runtime environment
- `LOG_LEVEL` - Pino log verbosity
- `MAX_FAILED_LOGIN_ATTEMPTS` - Integer; triggers account lock
- `LOCK_DURATION_MINUTES` - Integer; duration of lockout

**Optional env vars (key rotation):**
- `JWT_KEY_ID` - Current key identifier (defaults to `"v1"`)
- `JWT_OLD_PUBLIC_KEY` - Previous RSA public key PEM
- `JWT_OLD_KEY_ID` - Previous key identifier
- `JWT_OLD_KEY_EXPIRES` - ISO datetime after which old key is rejected

**Secrets location:**
- `.env` file at project root (not committed); PEM files `private.pem` / `public.pem` also at project root

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

---

*Integration audit: 2026-03-18*
