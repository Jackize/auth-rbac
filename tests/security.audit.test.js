import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import request from "supertest";

// ============================================================================
// Security Audit Integration Tests – Milestone 7
// Covers: JWT tampering, expired token, refresh reuse (theft detection),
//         SQL injection, XSS security headers, rate limit enforcement.
// ============================================================================

// ---------------------------------------------------------------------------
// Redis mock – controls rate-limit counters per test
// ---------------------------------------------------------------------------
let redisEvalMock;
jest.unstable_mockModule("../src/config/redis.js", () => {
  redisEvalMock = jest.fn().mockResolvedValue(1);
  return {
    getRedis: () => ({
      eval: redisEvalMock,
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    }),
  };
});

// ---------------------------------------------------------------------------
// JWT mock – controls access-token verification outcomes
// ---------------------------------------------------------------------------
let verifyAccessTokenMock;
jest.unstable_mockModule("../src/utils/jwt.js", () => {
  verifyAccessTokenMock = jest.fn();
  return {
    signAccessToken: jest.fn().mockResolvedValue("signed-access-token"),
    verifyAccessToken: verifyAccessTokenMock,
  };
});

// ---------------------------------------------------------------------------
// User repository mock
// ---------------------------------------------------------------------------
let userFindByIdMock;
let userFindByEmailMock;
jest.unstable_mockModule("../src/repository/user.repository.js", () => {
  userFindByIdMock = jest.fn();
  userFindByEmailMock = jest.fn();
  return {
    userRepository: {
      findById: userFindByIdMock,
      findByEmail: userFindByEmailMock,
      create: jest.fn(),
      recordFailedLogin: jest.fn(),
      resetFailedLoginAttempts: jest.fn(),
      unlockIfExpired: jest.fn(),
      incrementTokenVersion: jest.fn(),
      getUserPermissions: jest.fn().mockResolvedValue([]),
    },
  };
});

// ---------------------------------------------------------------------------
// Refresh token repository mock
// ---------------------------------------------------------------------------
let revokeTokensByUserIdMock;
let findByTokenMock;
let revokeTokenByTokenMock;
jest.unstable_mockModule("../src/repository/refreshToken.repository.js", () => {
  revokeTokensByUserIdMock = jest.fn().mockResolvedValue(undefined);
  findByTokenMock = jest.fn();
  revokeTokenByTokenMock = jest.fn().mockResolvedValue(undefined);
  return {
    refreshTokenRepository: {
      findByToken: findByTokenMock,
      create: jest.fn(),
      revokeTokenByToken: revokeTokenByTokenMock,
      revokeTokensByUserId: revokeTokensByUserIdMock,
      findActiveTokensByUserId: jest.fn().mockResolvedValue([]),
      deleteByToken: jest.fn(),
      deleteByUserId: jest.fn(),
    },
  };
});

// ---------------------------------------------------------------------------
// Refresh rate limit mock – always allow unless overridden
// ---------------------------------------------------------------------------
jest.unstable_mockModule("../src/middleware/rate.limit.refresh.js", () => ({
  enforceRefreshRateLimit: jest.fn().mockResolvedValue(true),
}));

// ---------------------------------------------------------------------------
// Password mock – default: wrong password (so login returns 401, not 500)
// ---------------------------------------------------------------------------
jest.unstable_mockModule("../src/utils/password.js", () => ({
  hashPassword: jest.fn().mockResolvedValue("hashed"),
  verifyPassword: jest.fn().mockResolvedValue(false),
}));

// ---------------------------------------------------------------------------
// Dynamic import after all mocks
// ---------------------------------------------------------------------------
let app;
beforeAll(async () => {
  const { createApp } = await import("../src/app.js");
  app = createApp();
});

beforeEach(() => {
  jest.clearAllMocks();
  redisEvalMock.mockResolvedValue(1);
  verifyAccessTokenMock.mockReset();
  userFindByIdMock.mockReset();
  findByTokenMock.mockReset();
  revokeTokenByTokenMock.mockResolvedValue(undefined);
  revokeTokensByUserIdMock.mockResolvedValue(undefined);
});

// ============================================================================
// 1. JWT TAMPERING
// ============================================================================
describe("JWT Tampering", () => {
  it("rejects a token with invalid signature (tampered payload)", async () => {
    const err = new Error("signature verification failed");
    err.code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
    verifyAccessTokenMock.mockRejectedValue(err);

    const res = await request(app)
      .get("/auth/me")
      .set(
        "Authorization",
        "Bearer eyJhbGciOiJSUzI1NiJ9.dGFtcGVyZWQ.ZmFrZXNpZw",
      );

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "Invalid or expired token" });
  });

  it("rejects a token signed with an unknown key id (kid mismatch)", async () => {
    const err = new Error("Token signed with unknown or revoked key");
    verifyAccessTokenMock.mockRejectedValue(err);

    const res = await request(app)
      .get("/auth/me")
      .set(
        "Authorization",
        "Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6InVua25vd24ifQ.e30.fake",
      );

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "Invalid or expired token" });
  });

  it("rejects request with no Authorization header", async () => {
    const res = await request(app).get("/auth/me");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "Access token missing" });
  });

  it("rejects a token with malformed structure (not 3 dot-separated parts)", async () => {
    const err = new Error("Invalid JWT");
    verifyAccessTokenMock.mockRejectedValue(err);

    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer not.a.valid.jwt.at.all");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "Invalid or expired token" });
  });
});

// ============================================================================
// 2. EXPIRED TOKEN
// ============================================================================
describe("Expired Token", () => {
  it("rejects an expired access token with 401", async () => {
    const err = new Error("JWT expired");
    err.code = "ERR_JWT_EXPIRED";
    verifyAccessTokenMock.mockRejectedValue(err);

    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer expired.token.here");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "Invalid or expired token" });
  });

  it("rejects a token whose tokenVersion is stale (after logout-all)", async () => {
    // Token signature is valid but tokenVersion is behind the DB value
    verifyAccessTokenMock.mockResolvedValue({
      userId: "user-1",
      tokenVersion: 1,
    });
    userFindByIdMock.mockResolvedValue({ tokenVersion: 2 }); // incremented by logout-all

    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer valid.but.stale.token");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "Invalid token version" });
  });

  it("rejects a token for a user that no longer exists", async () => {
    verifyAccessTokenMock.mockResolvedValue({
      userId: "deleted-user",
      tokenVersion: 0,
    });
    userFindByIdMock.mockResolvedValue(null);

    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer valid.but.user.gone");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "Invalid token version" });
  });
});

// ============================================================================
// 3. REFRESH TOKEN REUSE (theft detection)
// ============================================================================
describe("Refresh Token Reuse", () => {
  it("rejects a revoked refresh token and revokes ALL user tokens (theft detection)", async () => {
    findByTokenMock.mockResolvedValue({
      tokenHash: "stolen-token",
      userId: "victim-user",
      revoked: true,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const res = await request(app)
      .post("/auth/refresh-token")
      .send({ refreshToken: "stolen-token" });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "Refresh token revoked" });
    // Theft detection: all sessions for this user must be nuked
    expect(revokeTokensByUserIdMock).toHaveBeenCalledWith("victim-user");
  });

  it("rejects an unknown refresh token without revoking user sessions", async () => {
    findByTokenMock.mockResolvedValue(null);

    const res = await request(app)
      .post("/auth/refresh-token")
      .send({ refreshToken: "nonexistent-token" });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "Invalid refresh token" });
    // Unknown token → not a reuse attack, do NOT nuke sessions
    expect(revokeTokensByUserIdMock).not.toHaveBeenCalled();
  });

  it("rejects request with missing refreshToken field", async () => {
    const res = await request(app).post("/auth/refresh-token").send({});

    expect(res.status).toBe(400);
  });
});

// ============================================================================
// 4. SQL INJECTION ATTEMPT
// ============================================================================
describe("SQL Injection Attempt", () => {
  const sqlPayloads = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "1' OR 1=1 --",
    "admin'--",
    '" OR ""="',
    "' UNION SELECT * FROM users --",
  ];

  it.each(sqlPayloads)(
    "rejects SQL injection in login email: %s",
    async (payload) => {
      const res = await request(app)
        .post("/auth/login")
        .send({ email: payload, password: "irrelevant" });

      // Validation must reject before reaching DB
      expect(res.status).toBe(400);
      // Must not leak DB internals
      expect(res.body?.error ?? "").not.toMatch(/sql|syntax|database|query/i);
    },
  );

  it.each(sqlPayloads)(
    "rejects SQL injection in register email: %s",
    async (payload) => {
      const res = await request(app)
        .post("/auth/register")
        .send({ email: payload, password: "ValidPass1!" });

      expect(res.status).toBe(400);
      expect(res.body?.error ?? "").not.toMatch(/sql|syntax|database|query/i);
    },
  );

  it("rejects missing email field entirely", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ password: "somepass" });

    expect(res.status).toBe(400);
  });

  it("rejects body exceeding 10kb limit (DoS prevention)", async () => {
    const hugeBody = { email: "a".repeat(11000) + "@x.com", password: "pass" };
    const res = await request(app).post("/auth/login").send(hugeBody);

    // Either 413 (body too large) or 400 (validation) — never a 500
    expect([400, 413]).toContain(res.status);
    expect(res.status).not.toBe(500);
  });
});

// ============================================================================
// 5. XSS HEADER CHECK (Helmet security headers)
// ============================================================================
describe("XSS Header Check (Security Headers)", () => {
  it("sets X-Content-Type-Options: nosniff (prevents MIME sniffing)", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("sets X-Frame-Options to prevent clickjacking", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-frame-options"]).toMatch(/DENY|SAMEORIGIN/i);
  });

  it("sets Content-Security-Policy header", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["content-security-policy"]).toBeDefined();
  });

  it("sets Strict-Transport-Security (HSTS) header", async () => {
    const res = await request(app).get("/health");
    const hsts = res.headers["strict-transport-security"];
    expect(hsts).toBeDefined();
    expect(hsts).toMatch(/max-age=31536000/);
    expect(hsts).toMatch(/includeSubDomains/);
  });

  it("does not expose X-Powered-By header (server fingerprinting)", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("returns JSON Content-Type (not HTML that could execute scripts)", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("sets X-RateLimit headers on login endpoint", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "user@example.com", password: "pass" });

    expect(res.headers["x-ratelimit-limit"]).toBeDefined();
    expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
    expect(res.headers["x-ratelimit-reset"]).toBeDefined();
  });
});

// ============================================================================
// 6. RATE LIMIT STRESS TEST
// ============================================================================
describe("Rate Limit Stress Test", () => {
  it("blocks login after exceeding 5 attempts per minute (returns 429)", async () => {
    redisEvalMock.mockResolvedValue(6); // counter at 6, over the 5/min limit

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "attacker@example.com", password: "wrongpass" });

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      error: "Too many login attempts",
      retryAfterSeconds: 60,
    });
    expect(res.headers["retry-after"]).toBe("60");
  });

  it("allows login when at the limit boundary (counter = 5)", async () => {
    redisEvalMock.mockResolvedValue(5); // exactly at limit → still allowed
    userFindByEmailMock.mockResolvedValue(null); // user not found → 401, not 429

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "user@example.com", password: "pass" });

    expect(res.status).not.toBe(429);
    expect(res.status).not.toBe(503);
  });

  it("sets X-RateLimit-Remaining header reflecting current count", async () => {
    redisEvalMock.mockResolvedValue(3); // 3rd request → 2 remaining

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "user@example.com", password: "pass" });

    expect(res.headers["x-ratelimit-remaining"]).toBe("2");
    expect(res.headers["x-ratelimit-limit"]).toBe("5");
  });

  it("returns 503 when Redis is unavailable", async () => {
    redisEvalMock.mockRejectedValue(new Error("Redis connection refused"));

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "user@example.com", password: "pass" });

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: "Rate limit service unavailable" });
  });

  it("increments rate limit counter on each login attempt", async () => {
    redisEvalMock.mockResolvedValue(1);
    userFindByEmailMock.mockResolvedValue(null);

    await request(app)
      .post("/auth/login")
      .send({ email: "user@example.com", password: "pass" });

    expect(redisEvalMock).toHaveBeenCalledTimes(1);
    expect(redisEvalMock).toHaveBeenCalledWith(
      expect.any(String), // Lua script
      1,
      expect.stringMatching(/^rate:login:/),
      "60",
    );
  });
});
