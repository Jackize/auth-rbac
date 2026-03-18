# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Start with nodemon auto-reload
npm start                # Production start

# Testing
npm test                 # Run all tests (sequential, maxWorkers=1)
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report

# Run a single test file
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/auth.controller.test.js

# Code quality
npm run lint             # ESLint
npm run format           # Prettier

# Database
npm run prisma:migrate   # Run migrations (dev)
npm run prisma:generate  # Regenerate Prisma client
npm run prisma:seed      # Seed DB (ts-node)
```

## Architecture

This is an Express 5 / Node.js authentication + RBAC service backed by PostgreSQL (Prisma ORM) and Redis (rate limiting + metrics).

**Request flow:**
```
Middleware stack (helmet → cors → pino → metricsMiddleware → body-parser → rate-limit → validate → authorize → requirePermission)
  → Router (/auth, /refresh)
    → Controller (business logic)
      → Repository (Prisma queries)
        → PostgreSQL
```

**Key modules:**
- `src/modules/auth/` — register, login, profile
- `src/modules/refresh/` — token refresh, logout, list active sessions
- `src/middleware/authorize.js` — verifies RS256 JWT and checks `tokenVersion` (invalidated on global logout)
- `src/middleware/require.permission.js` — RBAC check after authorize; does a **live DB lookup** on every call (no caching)
- `src/middleware/metrics.js` — Redis counters (1h TTL) for login success/failure, HTTP 401/403; exposed at `GET /metrics` (requires `metrics:read` permission)
- `src/permissions/` — permission registry; `resource:action` strings defined in `user.permission.js` / `developer.permission.js`, aggregated in `permission.js`; `hasPermission` supports wildcards (`*`, `resource:*`, `*:action`)
- `src/repository/` — `BaseRepository` with CRUD, extended by `UserRepository` and `RefreshTokenRepository`
- `src/config/redis.js` — Redis singleton (`getRedis()`)
- `src/infra/prisma.js` — Prisma singleton

**API routes:**
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/auth/register` | — | |
| POST | `/auth/login` | — | Rate limited (5/min per IP) |
| GET | `/auth/me` | JWT + `user:read` | |
| POST | `/auth/refresh-token` | — | Rate limited (10/min per user) |
| POST | `/auth/logout` | — | Revokes single refresh token |
| POST | `/auth/logout-all` | JWT | Revokes all tokens + increments `tokenVersion` |
| GET | `/refresh/active` | JWT | Lists active refresh tokens |
| GET | `/metrics` | JWT + `metrics:read` | Redis counters |
| GET | `/health` | — | Uptime check |

**Auth flow highlights:**
- Passwords hashed with Argon2id
- JWTs signed with RS256 (private/public PEM keys from env); access tokens expire in 15 min
- Refresh tokens stored as SHA-256 hashes in DB; rotated on every use (old token revoked, new issued); 7-day TTL
- **Token theft detection**: if a revoked refresh token is presented, all tokens for that user are immediately revoked
- Failed logins tracked in `User.failedLoginAttempts`; account locks for `LOCK_DURATION_MINUTES` after `MAX_FAILED_LOGIN_ATTEMPTS` failures
- Global logout increments `User.tokenVersion`; `authorize` middleware rejects tokens with stale version
- Rate limiting uses Redis Lua scripts (sliding window): 5/min per IP on login, 10/min per user on refresh

## Database Schema

Core models: `User`, `Role`, `Permission`, `UserRole` (junction), `RolePermission` (junction), `RefreshToken`.

`User.status` enum: `ACTIVE | LOCKED | SUSPENDED`.

After schema changes, run `npm run prisma:migrate` then `npm run prisma:generate`.

## Environment Variables

Required in `.env`:
```
DATABASE_URL=          # PostgreSQL
REDIS_URL=             # Redis (rate limiting)
JWT_PRIVATE_KEY=       # RSA private key PEM
JWT_PUBLIC_KEY=        # RSA public key PEM
CORS_ORIGIN=
PORT=3000
NODE_ENV=
LOG_LEVEL=
MAX_FAILED_LOGIN_ATTEMPTS=5
LOCK_DURATION_MINUTES=15
```

RSA key pair is also available as `private.pem` / `public.pem` files in the project root.

## Testing Notes

Tests run sequentially (`maxWorkers: 1`) for DB isolation. The setup file is `tests/setup.js`. HTTP integration tests use `supertest` against the actual Express app.

HTTP request examples for manual testing are in `http/auth/auth.rest` and `http/refreshToken/refreshToken.rest`.
