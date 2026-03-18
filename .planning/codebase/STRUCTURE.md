# Codebase Structure

**Analysis Date:** 2026-03-18

## Directory Layout

```
auth-rbac/
├── src/
│   ├── app.js                    # Express app factory (createApp)
│   ├── sever.js                  # HTTP server entry point (note: typo in filename)
│   ├── modules/
│   │   ├── auth/                 # Register, login, profile, logout handlers
│   │   │   ├── auth.controller.js
│   │   │   ├── auth.route.js
│   │   │   └── auth.validation.js
│   │   └── refresh/              # Token refresh, session management
│   │       ├── refresh.controller.js
│   │       ├── refresh.route.js
│   │       └── refresh.validation.js
│   ├── middleware/
│   │   ├── authorize.js          # JWT verification + tokenVersion check
│   │   ├── require.permission.js # RBAC enforcement (live DB lookup)
│   │   ├── validate.middleware.js# Zod schema validation
│   │   ├── metrics.js            # Redis counters + getMetrics()
│   │   ├── rate.limit.login.js   # 5/min per IP on login
│   │   ├── rate.limit.refresh.js # 10/min per user on refresh
│   │   └── rateLimitRedis.js     # Core Lua-based sliding window logic
│   ├── repository/
│   │   ├── base.repository.js    # Generic CRUD base class
│   │   ├── user.repository.js    # User domain queries + lockout logic
│   │   └── refreshToken.repository.js # Refresh token persistence
│   ├── permissions/
│   │   ├── permission.js         # Aggregated registry export
│   │   ├── user.permission.js    # user:create/read/update/delete constants
│   │   ├── developer.permission.js# api:access constant
│   │   └── hasPermission.js      # Wildcard evaluator function
│   ├── config/
│   │   ├── logger.js             # Pino logger singleton with redact config
│   │   ├── redis.js              # ioredis singleton (getRedis())
│   │   └── loginLock.js          # MAX_FAILED_LOGIN_ATTEMPTS, LOCK_DURATION_MINUTES
│   ├── infra/
│   │   └── prisma.js             # Prisma client singleton
│   ├── utils/
│   │   ├── jwt.js                # signAccessToken, verifyAccessToken (RS256, jose)
│   │   ├── password.js           # hashPassword, verifyPassword (Argon2id)
│   │   ├── refreshToken.js       # signRefreshToken, verifyRefreshToken, invalidateRefreshTokens
│   │   ├── clientIp.js           # Extract real client IP (proxy-aware)
│   │   └── env.js                # JWT key material + key rotation env vars
│   └── generated/
│       └── prisma/               # Auto-generated Prisma client (do not edit)
├── prisma/
│   ├── schema.prisma             # Database schema definition
│   ├── seed.ts                   # DB seed script (ts-node)
│   └── migrations/               # Prisma migration history
├── tests/
│   ├── setup.js                  # Jest global setup
│   ├── auth.controller.test.js
│   ├── authorize.test.js
│   ├── jwt.test.js
│   ├── rate-limit.test.js
│   ├── rateLimitRedis.test.js
│   ├── rbac.test.js
│   └── refresh.test.js
├── http/
│   ├── auth/auth.rest            # Manual HTTP test examples
│   └── refreshToken/refreshToken.rest
├── docs/
│   └── tasks/                    # Task documentation
├── .planning/
│   └── codebase/                 # GSD codebase analysis documents
├── prisma.config.ts              # Prisma config (TypeScript)
├── jest.config.js                # Jest config (ESM, sequential workers)
├── package.json
└── CLAUDE.md                     # Project guidance for Claude
```

## Directory Purposes

**`src/modules/`:**
- Purpose: Feature-grouped request handlers; each module owns its route, controller, and validation
- Contains: One subdirectory per feature (`auth`, `refresh`); each has `.controller.js`, `.route.js`, `.validation.js`
- Key files: `src/modules/auth/auth.route.js`, `src/modules/refresh/refresh.controller.js`

**`src/middleware/`:**
- Purpose: Reusable Express middleware functions applied globally or per-route
- Contains: Auth, RBAC, validation, rate limiting, metrics
- Key files: `src/middleware/authorize.js`, `src/middleware/require.permission.js`, `src/middleware/rateLimitRedis.js`

**`src/repository/`:**
- Purpose: All database access; no SQL/Prisma calls outside this directory
- Contains: `BaseRepository` class + two domain repositories exported as singletons
- Key files: `src/repository/base.repository.js`, `src/repository/user.repository.js`

**`src/permissions/`:**
- Purpose: Permission string constants and evaluation logic
- Contains: Permission registries per resource type, aggregator, wildcard evaluator
- Key files: `src/permissions/permission.js` (use this for imports in routes)

**`src/config/`:**
- Purpose: App-level configuration and infrastructure singletons tied to env vars
- Contains: Logger, Redis client factory, login lockout constants
- Key files: `src/config/redis.js` (use `getRedis()` for Redis access), `src/config/logger.js`

**`src/infra/`:**
- Purpose: Core infrastructure clients
- Contains: Prisma client singleton
- Key files: `src/infra/prisma.js` (import `prisma` for DB access)

**`src/utils/`:**
- Purpose: Stateless helper functions; cryptographic operations and env parsing
- Contains: JWT signing/verification, password hashing, refresh token management, IP extraction
- Key files: `src/utils/jwt.js`, `src/utils/password.js`, `src/utils/refreshToken.js`

**`src/generated/`:**
- Purpose: Auto-generated Prisma client output
- Contains: Generated TypeScript/JS client; do not manually edit
- Generated: Yes — run `npm run prisma:generate` after schema changes
- Committed: Yes (in repo)

**`prisma/`:**
- Purpose: Database schema source of truth and migration history
- Contains: `schema.prisma`, `seed.ts`, migration SQL files
- Key files: `prisma/schema.prisma`

**`tests/`:**
- Purpose: All test files; flat structure, one file per feature/concern
- Contains: Integration tests using supertest against the real Express app
- Key files: `tests/setup.js` (global Jest setup)

## Key File Locations

**Entry Points:**
- `src/sever.js`: Process entry point; binds port, sets up graceful shutdown
- `src/app.js`: `createApp()` factory; used by server and tests

**Configuration:**
- `src/utils/env.js`: JWT key material (private/public PEM, key ID, rotation support)
- `src/config/loginLock.js`: `MAX_FAILED_LOGIN_ATTEMPTS`, `LOCK_DURATION_MINUTES` from env
- `src/config/logger.js`: Pino logger with redact config
- `src/config/redis.js`: Redis singleton factory
- `src/infra/prisma.js`: Prisma client singleton
- `jest.config.js`: Test runner configuration
- `prisma/schema.prisma`: Database schema

**Core Logic:**
- `src/middleware/authorize.js`: JWT verification + tokenVersion staleness check
- `src/middleware/require.permission.js`: Live RBAC enforcement
- `src/middleware/rateLimitRedis.js`: Redis Lua sliding window rate limiter
- `src/permissions/hasPermission.js`: Wildcard permission evaluation
- `src/utils/jwt.js`: RS256 signing/verification with key rotation support
- `src/utils/refreshToken.js`: Refresh token lifecycle (sign, verify, invalidate)
- `src/repository/user.repository.js`: Account lockout logic, permission fetching, token version

**Testing:**
- `tests/setup.js`: Jest global setup
- `tests/*.test.js`: Integration tests (flat, feature-named)

## Naming Conventions

**Files:**
- Controllers: `<feature>.controller.js` — e.g., `auth.controller.js`
- Routes: `<feature>.route.js` — e.g., `refresh.route.js`
- Validation: `<feature>.validation.js` — e.g., `auth.validation.js`
- Middleware: `<concern>.middleware.js` or `<concern>.<aspect>.js` — e.g., `validate.middleware.js`, `rate.limit.login.js`
- Repositories: `<entity>.repository.js` — e.g., `user.repository.js`
- Permissions: `<resource>.permission.js` — e.g., `user.permission.js`
- Config/infra: `<service>.js` — e.g., `redis.js`, `prisma.js`
- Utils: `<concern>.js` — e.g., `jwt.js`, `password.js`

**Directories:**
- Feature modules: singular lowercase — `auth`, `refresh`
- Cross-cutting: plural lowercase — `middleware`, `repository`, `permissions`, `utils`
- Infrastructure: lowercase — `config`, `infra`

**Exports:**
- Repository instances: named singleton exports — `export const userRepository = new UserRepository()`
- Controllers: named function exports — `export const login = async (req, res, next) => ...`
- Middleware factories: named function exports — `export function requirePermission(permission) {...}`
- Permission constants: named object exports — `export const RESOURCE_USER_PERMISSIONS = {...}`

## Where to Add New Code

**New Feature Module (e.g., `admin`):**
- Create directory: `src/modules/admin/`
- Implementation files: `src/modules/admin/admin.controller.js`, `src/modules/admin/admin.route.js`, `src/modules/admin/admin.validation.js`
- Mount in: `src/app.js` with `app.use("/admin", adminRouter)`
- Tests: `tests/admin.test.js`

**New Permission Resource:**
- Create: `src/permissions/<resource>.permission.js`
- Register in: `src/permissions/permission.js` under `RESOURCE_PERMISSIONS`

**New Middleware:**
- Add file to: `src/middleware/<concern>.js`
- Apply globally in `src/app.js` or per-route in route files

**New Repository:**
- Create: `src/repository/<entity>.repository.js`
- Extend `BaseRepository` from `src/repository/base.repository.js`
- Export singleton instance

**Database Schema Changes:**
- Edit: `prisma/schema.prisma`
- Run: `npm run prisma:migrate` then `npm run prisma:generate`
- Regenerated client lands in: `src/generated/prisma/`

**Utilities:**
- Shared helpers: `src/utils/<concern>.js`
- Config/env-bound singletons: `src/config/<service>.js`

## Special Directories

**`src/generated/`:**
- Purpose: Prisma client output directory
- Generated: Yes — by `npm run prisma:generate`
- Committed: Yes

**`.planning/codebase/`:**
- Purpose: GSD codebase analysis documents
- Generated: Yes — by `/gsd:map-codebase`
- Committed: Yes

**`coverage/`:**
- Purpose: Jest code coverage HTML report output
- Generated: Yes — by `npm run test:coverage`
- Committed: No (gitignored)

---

*Structure analysis: 2026-03-18*
