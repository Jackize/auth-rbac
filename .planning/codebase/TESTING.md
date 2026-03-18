# Testing Patterns

**Analysis Date:** 2026-03-18

## Test Framework

**Runner:**
- Jest 29.7.0
- Config: `jest.config.js` (ESM export)
- Requires `--experimental-vm-modules` flag due to ESM module system

**Assertion Library:**
- Jest built-in (`expect`) — imported explicitly from `@jest/globals`

**Run Commands:**
```bash
npm test                 # Run all tests (sequential, maxWorkers=1)
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report

# Single file:
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/auth.controller.test.js
```

## Test File Organization

**Location:**
- All tests in top-level `tests/` directory — not co-located with source
- Setup file: `tests/setup.js`

**Naming:**
- `[subject].test.js` pattern:
  - `tests/auth.controller.test.js` — unit tests for `src/modules/auth/auth.controller.js`
  - `tests/authorize.test.js` — unit tests for `src/middleware/authorize.js`
  - `tests/jwt.test.js` — integration tests for `src/utils/jwt.js`
  - `tests/rbac.test.js` — middleware integration tests for RBAC
  - `tests/rate-limit.test.js` — integration tests for rate limiting via full app
  - `tests/rateLimitRedis.test.js` — unit tests for `src/middleware/rateLimitRedis.js`
  - `tests/refresh.test.js` — integration tests for refresh token flow

**Test match pattern:**
- `**/tests/**/*.test.js` (configured in `jest.config.js`)

**Structure:**
```
tests/
├── setup.js                       # Global setup (loads .env)
├── auth.controller.test.js        # Unit: auth controller functions
├── authorize.test.js              # Unit: authorize middleware
├── jwt.test.js                    # Integration: JWT sign/verify with real keys
├── rate-limit.test.js             # Integration: rate limit via full Express app
├── rateLimitRedis.test.js         # Unit: Redis rate limit utility
├── rbac.test.js                   # Integration: RBAC middleware with test app
└── refresh.test.js                # Integration: full refresh token flow
```

## Test Structure

**Suite Organization:**
```javascript
// All lifecycle hooks imported explicitly from @jest/globals
import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

describe("auth.controller - login", () => {
  it("returns 401 when user not found", async () => {
    findByEmailMock.mockResolvedValueOnce(null);
    const req = { body: { email: "none@example.com", password: "password123" } };
    const res = createRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid email or password" });
  });
});
```

**Patterns:**
- `beforeAll`: import modules dynamically after mocks are set up; create test Express apps
- `beforeEach`: reset/clear mocks (`jest.clearAllMocks()` or specific `.mockReset()`)
- `it()` used (not `test()`)
- Describe blocks group by subject — controller function name or feature area
- Test descriptions use plain language stating HTTP status + condition: `"returns 401 when user not found"`

## Mocking

**Framework:** Jest's `jest.unstable_mockModule` (ESM-safe)

**Critical Pattern — mocks MUST be declared before dynamic imports:**
```javascript
// 1. Declare mock functions at module scope
const findByEmailMock = jest.fn();

// 2. Register mock module BEFORE dynamic import
jest.unstable_mockModule("../src/repository/user.repository.js", () => ({
  userRepository: {
    findByEmail: findByEmailMock,
    // ...
  },
}));

// 3. Dynamic import AFTER mocks (in beforeAll)
let login;
beforeAll(async () => {
  const mod = await import("../src/modules/auth/auth.controller.js");
  login = mod.login;
});
```

**Mock declarations in module factory (alternative pattern):**
```javascript
// When mock function reference is needed after factory runs
let getUserPermissionsMock;
jest.unstable_mockModule("../src/repository/user.repository.js", () => {
  getUserPermissionsMock = jest.fn();
  return { userRepository: { getUserPermissions: getUserPermissionsMock } };
});
```

**What to Mock:**
- All repository layer (database calls): `userRepository`, `refreshTokenRepository`
- Redis client: `getRedis` from `src/config/redis.js`
- JWT utilities when testing controllers: `signAccessToken`, `verifyAccessToken`
- Password utilities: `hashPassword`, `verifyPassword`
- Metrics: `incrementLoginFailure`, `incrementLoginSuccess`
- `authorize` middleware when testing routes that require auth (replace with fake that sets `req.user`)

**What NOT to Mock:**
- JWT crypto operations in `tests/jwt.test.js` — tests use real `signAccessToken`/`verifyAccessToken` against actual PEM keys from `.env`
- Express framework itself — real Express app used in integration tests

## Fixtures and Factories

**Response mock factory:**
```javascript
const createRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return res;
};
```

**Test app factory:**
```javascript
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  // fake authorize middleware
  const fakeAuthorize = (req, res, next) => {
    req.user = { userId: "test-user", roles: ["admin"] };
    next();
  };
  app.get("/protected", fakeAuthorize, requirePermission(...), handler);
  app.use((err, req, res, next) => res.status(500).json({ error: "internal" }));
  return app;
};
```

**In-memory token store (refresh tests):**
```javascript
let _tokens = [];
// Mock repository uses in-memory array for realistic token lifecycle testing
jest.unstable_mockModule("../src/repository/refreshToken.repository.js", () => {
  const create = jest.fn(async ({ tokenHash, userId, deviceId }) => {
    const record = { tokenHash, userId, deviceId, revoked: false, expiresAt: new Date(Date.now() + 7*24*60*60*1000) };
    _tokens.push(record);
    return record;
  });
  // ... findByToken, revokeTokenByToken, etc.
  return { refreshTokenRepository: { create, findByToken, ... } };
});
```

**Test data:** Inline objects created per test case — no shared fixtures file. User objects follow schema shape:
```javascript
{ id: "user-1", email: "user@example.com", password: "hash", status: "ACTIVE", tokenVersion: 1 }
```

**Location:**
- No dedicated fixtures directory — test data defined inline in each test file

## Coverage

**Configuration:**
- Collects from: `src/**/*.js` (excludes `src/generated/**`)
- `maxWorkers: 1` — tests run sequentially to avoid DB/Redis state conflicts

**Requirements:** None enforced (no threshold configured)

**View Coverage:**
```bash
npm run test:coverage
# Report written to coverage/lcov-report/index.html
```

## Test Types

**Unit Tests:**
- Test a single function/middleware in isolation
- All dependencies mocked via `jest.unstable_mockModule`
- Files: `tests/auth.controller.test.js`, `tests/authorize.test.js`, `tests/rateLimitRedis.test.js`
- Request/response created as plain objects: `{ body: {...} }`, `createRes()`

**Integration Tests:**
- Mount real Express app (via `createApp()` from `src/app.js` or a `createTestApp()` helper)
- Use `supertest` to make HTTP requests
- Repository and Redis still mocked, but middleware stack is real
- Files: `tests/refresh.test.js`, `tests/rate-limit.test.js`, `tests/rbac.test.js`, `tests/jwt.test.js`

**E2E Tests:**
- Not used — no database or Redis live connections in test suite

## Common Patterns

**Async Testing:**
```javascript
it("returns 401 when user not found", async () => {
  findByEmailMock.mockResolvedValueOnce(null);
  await login(req, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
});
```

**Error/Exception Testing:**
```javascript
it("calls next(error) when login throws", async () => {
  const error = new Error("DB failure");
  findByEmailMock.mockRejectedValueOnce(error);
  await login(req, res, next);
  expect(next).toHaveBeenCalledWith(error);
});
```

**HTTP Integration via supertest:**
```javascript
it("returns 429 when login attempts exceed 5 per minute per IP", async () => {
  redisEvalMock.mockResolvedValue(6); // over limit
  const res = await request(app)
    .post("/auth/login")
    .send({ email: "any@example.com", password: "any" });
  expect(res.status).toBe(429);
  expect(res.body.error).toMatch(/too many login attempts/i);
});
```

**Regex matching for flexible error messages:**
```javascript
expect(res.body.error).toMatch(/temporarily locked/i);
expect(res.body.error).toMatch(/too many login attempts/i);
```

**Flexible status code assertion (when 503 fallback possible):**
```javascript
expect([401, 503, 500]).toContain(res.status);
if (res.status === 401) {
  expect(res.body.error).toBe("Invalid refresh token");
}
```

## Setup

**`tests/setup.js`:**
```javascript
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
```
Loads `.env` so JWT keys and other env vars are available for all tests. Requires a valid `.env` with `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY`.

---

*Testing analysis: 2026-03-18*
