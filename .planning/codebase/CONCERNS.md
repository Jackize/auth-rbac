# Codebase Concerns

**Analysis Date:** 2026-03-18

## Tech Debt

**Validated input ignored — controllers read raw `req.body`:**
- Issue: The `validate` middleware stores sanitized data in `req.validated`, but all controllers read from `req.body` directly. Validation runs but its sanitized output is never consumed.
- Files: `src/modules/auth/auth.controller.js` (lines 9, 100), `src/modules/refresh/refresh.controller.js` (lines 12, 82), `src/middleware/validate.middleware.js` (line 15)
- Impact: Extra unknown fields from the request body pass through to repository create calls (e.g., `username` reaches `userRepository.create` even though it is not validated and not in the schema). Zod's sanitization benefit is wasted.
- Fix approach: Replace all `req.body` reads in controllers with `req.validated`, or remove `req.validated` and rely solely on `req.body` after Zod parse.

**`username` field accepted by register but not in schema:**
- Issue: `registerSchema` in `src/modules/auth/auth.validation.js` does not define a `username` field. The controller at line 100 destructures `username` from `req.body` and forwards it to `userRepository.create`. The Prisma `User` model also has no `username` column.
- Files: `src/modules/auth/auth.controller.js` (line 100), `src/modules/auth/auth.validation.js`, `prisma/schema.prisma`
- Impact: Prisma silently ignores unknown fields in `create` calls; the `username` value is discarded. Misleading API contract — callers who send `username` get no validation error and no storage.
- Fix approach: Either add `username` to the Prisma schema and validation, or remove it from the controller destructure.

**Commented-out error logging in global error handler:**
- Issue: Two logging lines in `src/app.js` (lines 109 and 113) are commented out. Unhandled errors are silently suppressed in the error handler — only the HTTP response is sent, no log record is emitted.
- Files: `src/app.js` (lines 109, 113)
- Impact: Production errors reaching the global handler leave no trace in logs. Debugging failures requires reproducing requests.
- Fix approach: Uncomment `req.log.error(err)` or use `logger.error(err, "Unhandled error occurred")`.

**Commented-out role embedding in JWT:**
- Issue: Lines 71–76 of `src/modules/auth/auth.controller.js` show a commented-out block that was intended to embed roles in the access token. The dead code also leaves the `getUserRole` method in `UserRepository` (`src/repository/user.repository.js` line 127) unused.
- Files: `src/modules/auth/auth.controller.js` (lines 71–76), `src/repository/user.repository.js` (lines 127–141)
- Impact: Dead code creates confusion about design intent. `getUserRole` is never called in production.
- Fix approach: Remove dead code if roles-in-JWT is not planned; otherwise implement and test it.

**Leftover `/protected` placeholder route:**
- Issue: `src/app.js` line 83 registers `GET /protected` with a hard-coded response. This was an example route during development.
- Files: `src/app.js` (line 83)
- Impact: Exposes an undocumented, unauthorized endpoint (only requires a valid JWT, no permission check). May confuse API consumers or scanners.
- Fix approach: Remove the route or replace it with a real implementation.

**`prisma:seed` script requires `ts-node` which is not installed:**
- Issue: `package.json` line 16 runs `npx ts-node prisma/seed.ts`, but `ts-node` is not in `devDependencies` and is not installed in `node_modules`.
- Files: `package.json` (line 16), `prisma/seed.ts`
- Impact: `npm run prisma:seed` will fail for any developer setting up the project for the first time.
- Fix approach: Add `ts-node` and a matching `tsconfig.json` to devDependencies, or rewrite `prisma/seed.ts` as `prisma/seed.js` with ESM syntax.

**`seed.ts` logs `DATABASE_URL` to stdout:**
- Issue: `prisma/seed.ts` line 8 contains `console.log("DATABASE_URL from seed.ts:", process.env.DATABASE_URL)`. This is a debug statement left from development.
- Files: `prisma/seed.ts` (line 8)
- Impact: Leaks the database connection string (which may contain credentials) into CI/CD logs or terminal history whenever seeding runs.
- Fix approach: Remove or replace with a non-sensitive log confirming the URL is set.

**Duplicate email in seed data:**
- Issue: `prisma/seed.ts` defines `developer@example.com` twice in the `createMany` call (lines 38 and 49). `skipDuplicates: true` suppresses the error, but the intent is ambiguous.
- Files: `prisma/seed.ts` (lines 38–54)
- Impact: Silent data inconsistency; developer role will not be seeded with a user or permissions beyond the duplicate skip.
- Fix approach: Remove the duplicate entry.

---

## Security Considerations

**RSA private/public PEM files committed to repository:**
- Risk: `private.pem` and `public.pem` exist in the project root. `.gitignore` only excludes `.env` — both PEM files are tracked by git.
- Files: `private.pem`, `public.pem`, `.gitignore`
- Current mitigation: None. Anyone with repository access can obtain the private signing key.
- Recommendations: Add `*.pem` to `.gitignore` immediately. Rotate the key pair. Distribute keys only through environment variables (`JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`) or a secret manager.

**IP spoofing risk via `X-Forwarded-For` header:**
- Risk: `src/utils/clientIp.js` reads `X-Forwarded-For` directly before falling back to `req.ip`. When `trust proxy` is set to `1` (as in `src/app.js` line 16), Express already resolves `req.ip` correctly using that header. The manual read of `X-Forwarded-For` in `clientIp.js` bypasses this and accepts the raw header value, which any client can spoof.
- Files: `src/utils/clientIp.js`, `src/app.js` (line 16)
- Current mitigation: The `trust proxy 1` setting on Express provides some protection through `req.ip`, but the custom utility overrides it by reading the raw header.
- Recommendations: Remove the manual `X-Forwarded-For` read and use only `req.ip` (which respects the `trust proxy` setting). This ensures the rate-limit key reflects the real client IP when behind a reverse proxy.

**`SUSPENDED` user status not enforced at login:**
- Risk: The `User` model has three statuses: `ACTIVE`, `LOCKED`, `SUSPENDED`. The login flow in `src/modules/auth/auth.controller.js` only checks for `LOCKED`. A `SUSPENDED` user can log in freely.
- Files: `src/modules/auth/auth.controller.js` (line 17), `prisma/schema.prisma` (UserStatus enum)
- Current mitigation: None. There is no code path that blocks a `SUSPENDED` user.
- Recommendations: Add an explicit check for `SUSPENDED` status alongside the `LOCKED` check, returning 403 with an appropriate message.

**`SUSPENDED` user status not blocked on token refresh:**
- Risk: The refresh token flow in `src/modules/refresh/refresh.controller.js` fetches the user by ID (line 38) but does not check `user.status`. A `SUSPENDED` user with a valid refresh token continues to obtain new access tokens indefinitely.
- Files: `src/modules/refresh/refresh.controller.js` (lines 38–48)
- Current mitigation: None.
- Recommendations: Check `user.status` after the `findById` call and return 401/403 if the account is not `ACTIVE`.

**Case-insensitive matching on SHA-256 token hashes:**
- Risk: `src/repository/refreshToken.repository.js` uses `mode: "insensitive"` on `tokenHash` for all lookups and revocations (lines 14, 37, 67). SHA-256 hex hashes are always lowercase; case-insensitive matching is unnecessary and slightly less efficient, but more critically it is semantically incorrect — it would match a different hash if casing differed.
- Files: `src/repository/refreshToken.repository.js` (lines 11–18, 34–41, 64–71)
- Current mitigation: Hashes are always lowercase in practice, so no collision occurs today.
- Recommendations: Use exact-match (`equals: token` without `mode`) for token hash lookups to reflect correct semantics and remove unnecessary query overhead.

**Metrics endpoint does not check user status:**
- Risk: `GET /metrics` at `src/app.js` line 91 checks JWT validity and `metrics:read` permission, but does not verify that the requesting user's account is `ACTIVE`. A `SUSPENDED` admin could still read metrics.
- Files: `src/app.js` (line 91)
- Current mitigation: None.
- Recommendations: This is lower priority than the login/refresh status checks but should be addressed together.

---

## Performance Bottlenecks

**Live DB permission lookup on every authenticated request:**
- Problem: `src/middleware/require.permission.js` calls `userRepository.getUserPermissions(user.userId)` on every request that hits a permission-protected route. `getUserPermissions` in turn runs two DB round trips: one `findUnique` on `User` with `roles` select, then a `Promise.all` of N `RolePermission.findMany` calls (one per role).
- Files: `src/middleware/require.permission.js`, `src/repository/user.repository.js` (lines 35–65)
- Cause: No caching layer. CLAUDE.md explicitly notes "does a **live DB lookup** on every call (no caching)".
- Improvement path: Cache permissions per user in Redis (short TTL, e.g., 60s) keyed by `perm:<userId>`. Invalidate on role/permission assignment changes. Alternatively, embed permissions or a version hash in the JWT and only re-fetch on mismatch.

**N+1 query pattern in `getUserPermissions`:**
- Problem: `getUserPermissions` issues a separate `RolePermission.findMany` query for each role the user holds. A user with 5 roles triggers 6 DB queries (1 user fetch + 5 permission fetches) per request.
- Files: `src/repository/user.repository.js` (lines 45–57)
- Cause: `Promise.all` over per-role queries instead of a single join query.
- Improvement path: Use a single Prisma query with nested `include` on `User → UserRole → Role → RolePermission → Permission`, or use a raw SQL query with a join.

**No cleanup job for expired/revoked refresh tokens:**
- Problem: Revoked and expired rows in the `RefreshToken` table accumulate indefinitely. There is no scheduled job or on-demand cleanup.
- Files: `src/repository/refreshToken.repository.js`, `prisma/schema.prisma` (RefreshToken model)
- Cause: No cron or background task implemented.
- Improvement path: Add a scheduled job (e.g., `node-cron` or a pg `pg_cron` extension) that runs `deleteMany({ where: { OR: [{ revoked: true }, { expiresAt: { lt: new Date() } }] } })` periodically.

**Metrics counter TTL race condition:**
- Problem: `src/middleware/metrics.js` uses two Redis operations: `INCR` then `EXPIRE` (only if count equals 1). Between `INCR` and `EXPIRE`, a crash could leave a key with no TTL, causing it to persist permanently. The rate-limit middleware (`rateLimitRedis.js`) uses a Lua script for atomicity, but metrics does not.
- Files: `src/middleware/metrics.js` (lines 5–11)
- Cause: Non-atomic INCR + EXPIRE in application code rather than in a Lua script.
- Improvement path: Use the same Lua-script pattern already implemented in `src/middleware/rateLimitRedis.js` for the metrics increment.

---

## Fragile Areas

**`env.js` module-level `await` for RSA key import:**
- Files: `src/utils/jwt.js` (lines 4–9)
- Why fragile: RSA key objects are created at module load time via top-level `await`. If `JWT_PRIVATE_KEY` or `JWT_PUBLIC_KEY` env vars are missing or malformed, the entire module fails to load and the whole process crashes at startup with no user-friendly error message.
- Safe modification: Wrap key imports in a startup validation function that provides a clear error message. Alternatively, validate env vars in `src/utils/env.js` and throw early with a helpful message.
- Test coverage: No test covers startup failure due to missing/invalid key env vars.

**`prisma.js` singleton with no error handling on missing `DATABASE_URL`:**
- Files: `src/infra/prisma.js`
- Why fragile: `const connectionString = process.env.DATABASE_URL` will be `undefined` if the env var is missing, and `new PrismaPg({ connectionString: undefined })` will throw a cryptic error at first DB call rather than at startup.
- Safe modification: Assert `DATABASE_URL` is set at module load and throw a descriptive error.
- Test coverage: Not tested.

**`authorize` middleware returns a generic error for all JWT failures:**
- Files: `src/middleware/authorize.js` (lines 23–25)
- Why fragile: The `catch` block returns `"Invalid or expired token"` for all errors — whether the JWT is malformed, expired, has a bad signature, or the `tokenVersion` DB lookup throws. An unhandled Prisma error inside the `try` block will be silently caught here and return 401 instead of propagating to the global error handler.
- Safe modification: Re-throw non-JWT errors (e.g., Prisma connection errors) so the global error handler can log and return 500 correctly.
- Test coverage: `tests/authorize.test.js` exists but only tests happy path and expired token scenarios.

---

## Scaling Limits

**Redis singleton is not gracefully disconnected:**
- Current capacity: Single Redis client shared across the app.
- Limit: On `SIGTERM`/`SIGINT`, `src/sever.js` closes the HTTP server but does not call `client.quit()` on the Redis connection. This can cause in-flight Redis commands to be abandoned and the process to hang past the 10-second force-shutdown timeout.
- Scaling path: Add `await getRedis().quit()` inside the `shutdown` function before `process.exit(0)`.

**No Prisma `$disconnect` on graceful shutdown:**
- Current capacity: Single Prisma client.
- Limit: Similar to Redis, `src/sever.js` does not call `prisma.$disconnect()` during shutdown, which can leave the PostgreSQL connection pool open and cause hanging connections on the DB side.
- Scaling path: Import `prisma` in `src/sever.js` and call `prisma.$disconnect()` in the `shutdown` function.

---

## Missing Critical Features

**No email uniqueness check is case-insensitive at registration:**
- Problem: `userRepository.findByEmail` normalizes email to lowercase for lookups, but `userRepository.create` does not lowercase the email before storing it. A user could register as `User@Example.com` and bypass the `Admin@example.com` uniqueness guard.
- Blocks: Correct duplicate detection at registration.
- Files: `src/repository/user.repository.js` (lines 13–22), `src/modules/auth/auth.controller.js` (line 102)

**No SUSPENDED account enforcement in any flow:**
- Problem: The `SUSPENDED` status exists in the enum and schema but is never checked in login, token refresh, or the `authorize` middleware.
- Blocks: Administrators cannot effectively suspend users — suspended users retain full access.
- Files: `src/modules/auth/auth.controller.js`, `src/modules/refresh/refresh.controller.js`, `src/middleware/authorize.js`

---

## Test Coverage Gaps

**`SUSPENDED` status not tested:**
- What's not tested: No test verifies that a `SUSPENDED` user is blocked from logging in or refreshing tokens.
- Files: `tests/auth.controller.test.js`, `tests/refresh.test.js`
- Risk: Incomplete enforcement could silently allow suspended users full access.
- Priority: High

**Global error handler error logging not tested:**
- What's not tested: The commented-out `req.log.error` in `src/app.js` means error logging is not exercised. No test asserts that server errors produce a log entry.
- Files: `src/app.js` (lines 108–122), `tests/`
- Risk: Silent production errors with no log trail.
- Priority: High

**`authorize` middleware DB error path not tested:**
- What's not tested: The `catch` block in `src/middleware/authorize.js` swallows all errors including Prisma failures and returns 401. No test covers a DB failure during token version check.
- Files: `src/middleware/authorize.js`, `tests/authorize.test.js`
- Risk: A database outage could silently log all authenticated users out and mask the underlying error.
- Priority: Medium

**`getUserRole` is never tested or called:**
- What's not tested: `userRepository.getUserRole` at `src/repository/user.repository.js` line 127 is dead code with zero test coverage.
- Files: `src/repository/user.repository.js` (lines 127–141)
- Risk: Low (code is unused), but it pollutes coverage metrics and could cause confusion.
- Priority: Low

**No integration test for the `GET /protected` placeholder route:**
- What's not tested: The placeholder route registered in `src/app.js` line 83 has no corresponding test.
- Files: `src/app.js` (line 83)
- Risk: Low (it is a placeholder), but it is an undocumented surface exposed in production.
- Priority: Low

---

*Concerns audit: 2026-03-18*
