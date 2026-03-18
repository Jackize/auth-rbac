# Architecture

**Analysis Date:** 2026-03-18

## Pattern Overview

**Overall:** Layered monolith — Express HTTP service with distinct middleware, controller, and repository layers. No domain/service layer; controllers call repositories directly.

**Key Characteristics:**
- Thin controllers: business logic lives in controller functions, not a dedicated service layer
- Repository pattern wraps Prisma; base class provides generic CRUD
- Middleware chain handles cross-cutting concerns (security, rate limiting, auth, RBAC) before controllers run
- All state is external: PostgreSQL (data), Redis (rate limits + metrics), JWT (session tokens)
- Singleton pattern for infrastructure clients (Prisma, Redis)

## Layers

**HTTP Infrastructure (App Bootstrap):**
- Purpose: Compose and order Express middleware, mount routers, define error handlers
- Location: `src/app.js`
- Contains: Middleware registration, router mounting, 404/error handlers
- Depends on: All middleware, all routers
- Used by: `src/sever.js` (entry point)

**Middleware:**
- Purpose: Cross-cutting request processing — security, logging, metrics, validation, auth, authorization
- Location: `src/middleware/`
- Contains: `authorize.js`, `require.permission.js`, `validate.middleware.js`, `metrics.js`, `rate.limit.login.js`, `rate.limit.refresh.js`, `rateLimitRedis.js`
- Depends on: `src/repository/user.repository.js`, `src/permissions/`, `src/config/redis.js`, `src/utils/jwt.js`
- Used by: `src/app.js`, route files

**Routing:**
- Purpose: Map HTTP verbs/paths to middleware chains and controller functions
- Location: `src/modules/auth/auth.route.js`, `src/modules/refresh/refresh.route.js`
- Contains: Express Router instances with middleware composition per route
- Depends on: Middleware, controllers, permissions registry
- Used by: `src/app.js`

**Controllers:**
- Purpose: Handle HTTP request/response; coordinate repository calls and utility functions
- Location: `src/modules/auth/auth.controller.js`, `src/modules/refresh/refresh.controller.js`
- Contains: Exported async handler functions
- Depends on: `src/repository/`, `src/utils/`, `src/middleware/metrics.js`
- Used by: Route files

**Repository:**
- Purpose: Encapsulate all database access; abstract Prisma behind typed methods
- Location: `src/repository/`
- Contains: `base.repository.js` (generic CRUD), `user.repository.js`, `refreshToken.repository.js`
- Depends on: `src/infra/prisma.js`, `src/config/loginLock.js`
- Used by: Controllers, middleware (`authorize.js`, `require.permission.js`)

**Infrastructure / Config:**
- Purpose: Singleton clients and environment-derived configuration
- Location: `src/infra/prisma.js`, `src/config/redis.js`, `src/config/logger.js`, `src/config/loginLock.js`, `src/utils/env.js`
- Contains: Prisma client, Redis client, Pino logger, lockout constants
- Depends on: Environment variables only
- Used by: All layers above

**Permissions Registry:**
- Purpose: Define and evaluate `resource:action` permission strings
- Location: `src/permissions/`
- Contains: `user.permission.js`, `developer.permission.js`, `permission.js` (aggregator), `hasPermission.js` (evaluator)
- Depends on: Nothing (pure constants + logic)
- Used by: Route files, `src/middleware/require.permission.js`

**Utilities:**
- Purpose: Stateless helper functions for JWT, password hashing, refresh token signing, IP extraction
- Location: `src/utils/`
- Contains: `jwt.js`, `password.js`, `refreshToken.js`, `clientIp.js`, `env.js`
- Depends on: `src/infra/`, `src/repository/`
- Used by: Controllers, middleware

## Data Flow

**Login Request:**

1. Request arrives at `POST /auth/login`
2. `rateLimitLogin` middleware checks `rate:login:<ip>` counter in Redis via Lua script
3. `validate(loginSchema)` middleware validates body with Zod; 400 on failure
4. `login` controller in `src/modules/auth/auth.controller.js` executes:
   a. `userRepository.findByEmail()` — fetch user from PostgreSQL
   b. Check `user.status === "LOCKED"`, call `userRepository.unlockIfExpired()` if needed
   c. `verifyPassword()` — Argon2id comparison
   d. On failure: `userRepository.recordFailedLogin()`, potentially lock account
   e. On success: `userRepository.resetFailedLoginAttempts()`
   f. `signAccessToken()` — RS256 JWT with `userId` + `tokenVersion`, 15 min expiry
   g. `signRefreshToken()` — 64-byte random token stored as hash in `RefreshToken` table, 7-day TTL
5. Response: `{ accessToken, refreshToken }`

**Authenticated Request (e.g., `GET /auth/me`):**

1. `authorize` middleware extracts Bearer token from `Authorization` header
2. `verifyAccessToken()` verifies RS256 signature; supports `kid`-based key rotation (current + old key)
3. `userRepository.findById()` fetches `tokenVersion`; rejected if stale (global logout protection)
4. `req.user` set to JWT payload `{ userId, tokenVersion }`
5. `requirePermission("user:read")` middleware calls `userRepository.getUserPermissions(userId)` — live DB lookup
6. `hasPermission()` evaluates against registry with wildcard support (`*`, `resource:*`, `*:action`)
7. `getProfile` controller returns user data

**Refresh Token Rotation:**

1. `POST /auth/refresh-token` receives `{ refreshToken }`
2. `verifyRefreshToken()` looks up `tokenHash` in DB
3. If token is revoked → revoke ALL tokens for that user (theft detection)
4. `enforceRefreshRateLimit()` applies per-user sliding window (10/min)
5. New access + refresh tokens issued; old refresh token marked `revoked: true`

**Global Logout:**

1. `POST /auth/logout-all` requires `authorize` middleware
2. `revokeTokensByUserId()` marks all refresh tokens revoked in DB
3. `incrementTokenVersion()` increments `User.tokenVersion` in PostgreSQL
4. All existing access tokens become invalid on next use (version mismatch)

**State Management:**
- No in-memory state beyond module-level singletons (Redis client, Prisma client, JWT key objects)
- `req.user` carries authenticated user payload within a single request lifecycle
- `req.validated` carries Zod-parsed body within a single request lifecycle

## Key Abstractions

**BaseRepository:**
- Purpose: Generic CRUD for any Prisma model
- Examples: `src/repository/base.repository.js`
- Pattern: Class instantiation with `this.model = prisma.<model>`; subclasses call `super(prisma.<model>)` and extend with domain-specific queries

**Permission Registry (`RESOURCE_PERMISSIONS`):**
- Purpose: Typed constants for permission strings, preventing string literal errors
- Examples: `src/permissions/permission.js`, consumed in `src/modules/auth/auth.route.js`
- Pattern: `RESOURCE_PERMISSIONS.user.read` resolves to `"user:read"`

**`checkRateLimit` (Redis Lua sliding window):**
- Purpose: Atomic INCR+EXPIRE via Lua script for race-condition-free rate limiting
- Examples: `src/middleware/rateLimitRedis.js`
- Pattern: Returns `boolean`; sets `X-RateLimit-*` headers; caller decides whether to call `next()`

## Entry Points

**HTTP Server:**
- Location: `src/sever.js`
- Triggers: `node src/sever.js` or `npm start` / `npm run dev`
- Responsibilities: Load env, call `createApp()`, create `http.Server`, bind port, register graceful shutdown and uncaught error handlers

**App Factory:**
- Location: `src/app.js` — `createApp()` function
- Triggers: Called by `src/sever.js` and test setup
- Responsibilities: Register all middleware, mount routers, define health/metrics/404/error routes

## Error Handling

**Strategy:** Express error-forwarding — all async handlers wrap in `try/catch` and call `next(error)`.

**Patterns:**
- Controllers: `try { ... } catch (error) { next(error); }` — uniform in every handler
- Global error handler in `src/app.js` (lines 108–122): reads `err.statusCode || 500`; hides stack in production
- Middleware failures (auth, rate limit): return early with `res.status(4xx).json(...)` — do not call `next(error)`
- Redis unavailability in rate limiter: returns `503` rather than failing open

## Cross-Cutting Concerns

**Logging:** Pino via `pino-http` attached to every request as `req.log`; redacts `password`, `refreshToken`, `accessToken`, `token` fields. Config at `src/config/logger.js`. Controllers use `req.log?.info/warn` for structured events.

**Validation:** Zod schemas per route in `<module>.validation.js`; enforced by `validate` middleware (`src/middleware/validate.middleware.js`); validated data available as `req.validated`.

**Authentication:** RS256 JWT via `jose` library; key material loaded from env at startup in `src/utils/jwt.js`; supports `kid`-based dual-key rotation. Enforced by `authorize` middleware.

**RBAC:** Permission strings (`resource:action`) stored in DB, fetched live per request by `requirePermission` middleware; wildcard evaluation in `src/permissions/hasPermission.js`.

**Security Headers:** `helmet` with HSTS (1-year, preload), CSP, and `crossOriginResourcePolicy: same-origin`; production HTTPS redirect; body size limit 10kb.

---

*Architecture analysis: 2026-03-18*
