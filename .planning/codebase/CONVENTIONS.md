# Coding Conventions

**Analysis Date:** 2026-03-18

## Naming Patterns

**Files:**
- Middleware: `kebab.case.dot.separated.js` — e.g., `require.permission.js`, `rate.limit.login.js`, `validate.middleware.js`
- Controllers: `[module].controller.js` — e.g., `auth.controller.js`, `refresh.controller.js`
- Routes: `[module].route.js` — e.g., `auth.route.js`, `refresh.route.js`
- Validation schemas: `[module].validation.js` — e.g., `auth.validation.js`, `refresh.validation.js`
- Repositories: `[entity].repository.js` — e.g., `user.repository.js`, `base.repository.js`
- Utilities: `[purpose].js` — e.g., `jwt.js`, `password.js`, `refreshToken.js`
- Config: `[resource].js` inside `src/config/` — e.g., `logger.js`, `redis.js`, `loginLock.js`
- Permissions: `[resource].permission.js` — e.g., `user.permission.js`, `developer.permission.js`

**Functions:**
- camelCase for all exported functions: `signAccessToken`, `verifyPassword`, `requirePermission`, `checkRateLimit`
- Named exports preferred over default exports (except for Express routers)
- Factory functions use `create` prefix: `createApp()` in `src/app.js`
- Helper factories in tests use `create` prefix: `createRes()`, `createTestApp()`

**Variables:**
- camelCase throughout: `findByEmailMock`, `accessToken`, `lockedUntil`
- Constants: SCREAMING_SNAKE_CASE for exported constant objects — e.g., `RESOURCE_USER_PERMISSIONS`, `RESOURCE_PERMISSIONS`, `MAX_FAILED_LOGIN_ATTEMPTS`
- Boolean variables: plain camelCase without `is` prefix in some places (`locked`, `revoked`), `is` prefix in others (`isValid`)

**Types / Classes:**
- PascalCase for classes: `BaseRepository`, `UserRepository`, `RefreshTokenRepository`
- Singleton instances exported as camelCase: `userRepository`, `refreshTokenRepository`
- Enums in Prisma schema are SCREAMING_SNAKE_CASE strings used as literals: `"ACTIVE"`, `"LOCKED"`, `"SUSPENDED"`

**Permissions:**
- `resource:action` string format: `"user:read"`, `"metrics:read"`, `"*"`, `"resource:*"`, `"*:action"`
- Aggregated in `src/permissions/permission.js` via a nested object: `RESOURCE_PERMISSIONS.user.read`

## Code Style

**Formatting:**
- Prettier is listed as a devDependency; run with `npm run format`
- No `.prettierrc` config file found — Prettier defaults apply
- 2-space indentation observed throughout
- Trailing commas in multi-line function arguments

**Linting:**
- ESLint listed as devDependency; run with `npm run lint`
- No `eslint.config.*` or `.eslintrc*` found at project root — default rules apply
- Vietnamese comments present in some files (e.g., `src/repository/user.repository.js`, `src/middleware/authorize.js`)

## Import Organization

**Order observed:**
1. Node built-in modules (`crypto`, `path`)
2. Third-party packages (`express`, `cors`, `helmet`, `jose`, `pino`)
3. Internal modules using relative paths (`../repository/...`, `../../middleware/...`)

**Path Aliases:**
- None — all imports use relative paths only

**Module System:**
- ESM (`"type": "module"` in `package.json`)
- All files use `import`/`export` syntax
- No CommonJS `require()` calls in source files

## Error Handling

**Controller pattern — try/catch delegating to `next`:**
```javascript
export const login = async (req, res, next) => {
  try {
    // ... business logic
    return res.status(401).json({ error: "Invalid email or password" });
  } catch (error) {
    next(error);
  }
};
```

**Middleware pattern — catches thrown errors and returns directly:**
```javascript
export const authorize = async (req, res, next) => {
  try {
    const payload = await verifyAccessToken(token);
    // ...
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};
```

**Global error handler in `src/app.js`:**
```javascript
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: process.env.NODE_ENV === "production" ? "Internal Server Error" : err.message,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
});
```

**Error response shape — always `{ error: "message string" }`:**
- 400: `{ error: "Invalid input", details: [...] }` (validation)
- 401: `{ error: "Access token missing" }` / `{ error: "Invalid or expired token" }`
- 403: `{ error: "Forbidden" }` / `{ error: "Account temporarily locked...", lockedUntil, retryAfterSeconds }`
- 404: `{ error: "User not found" }`
- 409: `{ error: "Email already exists" }`
- 429: `{ error: "Too many login attempts...", retryAfterSeconds }`
- 503: `{ error: "Rate limit service unavailable" }`

**Fire-and-forget pattern for non-critical async ops:**
```javascript
incrementLoginFailure().catch(() => {});
incrementLoginSuccess().catch(() => {});
```

## Logging

**Framework:** pino + pino-http + pino-pretty

**Configuration:** `src/config/logger.js`

**Patterns:**
- Structured log objects with `event` field: `{ userId, event: "login_success" }`
- Log level set via `LOG_LEVEL` env var, defaults to `"info"`
- Sensitive fields redacted via `redactConfig`: `password`, `refreshToken`, `accessToken`, `token`
- Logs use `req.log` (pino-http request logger) inside controllers with optional chaining: `req.log?.warn(...)`
- Use `warn` for security events (failed login, account lock), `info` for success events

## Comments

**When to Comment:**
- JSDoc on complex repository methods with `@returns` tag
- Section separator comments using dashes (`// ---------------------------------------------------------------------------`)
- Inline Vietnamese comments for legacy/edge-case explanations
- Commented-out code left in place (e.g., `// const getRole = ...` in `auth.controller.js`, `// req.log.error(err)` in `app.js`)

**Commenting style:**
```javascript
/**
 * Ghi nhận login thất bại: tăng failedLoginAttempts; đủ ngưỡng thì LOCKED.
 * @returns {{ locked: boolean, attempts: number }}
 */
async recordFailedLogin(userId) { ... }
```

## Validation

**Framework:** Zod v4

**Pattern:** Schema defined in `[module].validation.js`, applied via `validate` middleware in route:
```javascript
// src/modules/auth/auth.validation.js
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// src/modules/auth/auth.route.js
router.post("/login", rateLimitLogin, validate(loginSchema), login);
```

**Validate middleware** (`src/middleware/validate.middleware.js`) parses `req.body || req.query || req.params`, sets `req.validated` on success, returns `400` with `{ error: "Invalid input", details: [...] }` on failure.

## Module Design

**Exports:**
- Named exports for all functions: `export const login = ...`, `export function requirePermission(...)`
- Default export only for Express routers: `export default router`
- Singleton instances exported as named: `export const userRepository = new UserRepository()`

**Barrel Files:**
- `src/permissions/permission.js` acts as a barrel aggregating permission modules
- No `index.js` barrel files used in other directories

## Repository Pattern

**Base class** (`src/repository/base.repository.js`): provides `findById`, `findMany`, `create`, `update`, `delete` using Prisma model passed in constructor.

**Extension pattern:**
```javascript
class UserRepository extends BaseRepository {
  constructor() {
    super(prisma.user);
  }
  // domain-specific methods added here
}
export const userRepository = new UserRepository();
```

---

*Convention analysis: 2026-03-18*
