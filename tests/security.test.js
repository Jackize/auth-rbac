import { beforeAll, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";

// -----------------------------------------------------------------------------
// Mocks (ESM-safe) – Redis, repositories
// -----------------------------------------------------------------------------

jest.unstable_mockModule("../src/config/redis.js", () => ({
  getRedis: () => ({ eval: jest.fn().mockResolvedValue(1) }),
}));

jest.unstable_mockModule("../src/repository/refreshToken.repository.js", () => ({
  refreshTokenRepository: {
    create: jest.fn(),
    findByToken: jest.fn().mockResolvedValue(null),
    revokeTokenByToken: jest.fn(),
    revokeTokensByUserId: jest.fn(),
    findActiveTokensByUserId: jest.fn().mockResolvedValue([]),
    deleteByToken: jest.fn(),
    deleteByUserId: jest.fn(),
  },
}));

jest.unstable_mockModule("../src/repository/user.repository.js", () => ({
  userRepository: {
    findByEmail: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    recordFailedLogin: jest.fn(),
    resetFailedLoginAttempts: jest.fn(),
    unlockIfExpired: jest.fn().mockResolvedValue(null),
    incrementTokenVersion: jest.fn(),
    getUserPermissions: jest.fn().mockResolvedValue([]),
    getUserRole: jest.fn(),
  },
}));

// -----------------------------------------------------------------------------
// Dynamic imports after mocks
// -----------------------------------------------------------------------------

let createApp;

beforeAll(async () => {
  ({ createApp } = await import("../src/app.js"));
});

// -----------------------------------------------------------------------------
// SQL Injection Attempt Tests
// -----------------------------------------------------------------------------

describe("SQL Injection Protection", () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  it("rejects SQL injection in email field (fails Zod email validation)", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "' OR '1'='1'; --", password: "password123" });

    // Zod rejects invalid email format → 400
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid input/i);
  });

  it("rejects SQL injection UNION attack in email (fails Zod email validation)", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({
        email: "test@test.com' UNION SELECT * FROM users; --",
        password: "password123",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid input/i);
  });

  it("treats SQL injection in password as plain string (no DB error)", async () => {
    // Valid email passes Zod; SQL-looking password passes min(8) check.
    // The app treats it as plain text — user not found → 401, not 500.
    const res = await request(app)
      .post("/auth/login")
      .send({
        email: "user@example.com",
        password: "' OR '1'='1'; --",
      });

    // Must NOT be 500 (no SQL error leaks through Prisma parameterisation)
    expect(res.status).not.toBe(500);
    expect([400, 401, 403]).toContain(res.status);
  });

  it("rejects SQL injection in register email (fails Zod email validation)", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({
        email: "admin'--",
        username: "hacker",
        password: "password123",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid input/i);
  });

  it("rejects oversized JSON body (body-bomb protection, limit 10kb)", async () => {
    const hugePayload = { email: "a".repeat(20_000) + "@x.com", password: "password123" };

    const res = await request(app)
      .post("/auth/login")
      .send(hugePayload);

    // Express body-parser rejects with 413 or the app rejects with 400
    expect([400, 413]).toContain(res.status);
  });
});

// -----------------------------------------------------------------------------
// XSS / Security Header Tests
// -----------------------------------------------------------------------------

describe("Security Headers (XSS protection via Helmet)", () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  it("sets X-Content-Type-Options: nosniff", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("sets X-Frame-Options to deny clickjacking", async () => {
    const res = await request(app).get("/health");
    // helmet sets SAMEORIGIN by default
    expect(res.headers["x-frame-options"]).toMatch(/SAMEORIGIN|DENY/i);
  });

  it("sets Content-Security-Policy header", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["content-security-policy"]).toBeDefined();
  });

  it("sets Strict-Transport-Security (HSTS) header", async () => {
    const res = await request(app).get("/health");
    const hsts = res.headers["strict-transport-security"];
    expect(hsts).toBeDefined();
    expect(hsts).toMatch(/max-age=/);
    expect(hsts).toMatch(/includeSubDomains/i);
  });

  it("does not expose X-Powered-By (Express fingerprinting removed)", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("API error responses return JSON, not raw HTML (no XSS reflection)", async () => {
    // Attempt to inject a script tag via a query parameter on a non-existent route
    const res = await request(app).get(
      "/auth/<script>alert(1)</script>",
    );

    expect(res.status).toBe(404);
    // Response must be JSON, not HTML that could reflect the input
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    // The body must not echo back the raw script tag unsanitised
    expect(JSON.stringify(res.body)).not.toMatch(/<script>/i);
  });
});
