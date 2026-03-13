import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";

// -----------------------------------------------------------------------------
// Mocks (ESM-safe) – Redis + User + RefreshToken for rate-limit & login/refresh
// -----------------------------------------------------------------------------

let redisEvalMock;
jest.unstable_mockModule("../src/config/redis.js", () => {
  redisEvalMock = jest.fn();
  return {
    getRedis: () => ({ eval: redisEvalMock }),
  };
});

let _tokens = [];
jest.unstable_mockModule("../src/repository/refreshToken.repository.js", () => {
  _tokens = [];
  const create = jest.fn(async ({ tokenHash, userId, deviceId }) => {
    const record = {
      tokenHash,
      userId,
      deviceId,
      revoked: false,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
    _tokens.push(record);
    return record;
  });
  const findByToken = jest.fn(async (token) =>
    _tokens.find((t) => t.tokenHash === token) || null
  );
  const revokeTokenByToken = jest.fn(async (token) => {
    const rec = _tokens.find((t) => t.tokenHash === token);
    if (rec) rec.revoked = true;
  });
  const revokeTokensByUserId = jest.fn(async (userId) => {
    _tokens.forEach((t) => {
      if (t.userId === userId) t.revoked = true;
    });
  });
  const findActiveTokensByUserId = jest.fn(async () => []);
  const deleteByToken = jest.fn(async () => {});
  const deleteByUserId = jest.fn(async () => {});

  return {
    refreshTokenRepository: {
      create,
      findByToken,
      revokeTokenByToken,
      revokeTokensByUserId,
      findActiveTokensByUserId,
      deleteByToken,
      deleteByUserId,
    },
  };
});

const findByEmailMock = jest.fn();
const findByIdMock = jest.fn();
jest.unstable_mockModule("../src/repository/user.repository.js", () => ({
  userRepository: {
    findByEmail: findByEmailMock,
    findById: findByIdMock,
    recordFailedLogin: jest.fn(),
    resetFailedLoginAttempts: jest.fn(),
    unlockIfExpired: jest.fn().mockResolvedValue(null),
    incrementTokenVersion: jest.fn(),
    getUserPermissions: jest.fn().mockResolvedValue(["*"]),
    getUserRole: jest.fn(),
  },
}));

// -----------------------------------------------------------------------------
// Dynamic imports after mocks
// -----------------------------------------------------------------------------

let createApp;
let signRefreshToken;

beforeAll(async () => {
  const appMod = await import("../src/app.js");
  createApp = appMod.createApp;
  const refreshMod = await import("../src/utils/refreshToken.js");
  signRefreshToken = refreshMod.signRefreshToken;
});

beforeEach(() => {
  _tokens = [];
  redisEvalMock.mockReset();
  findByEmailMock.mockReset();
  findByIdMock.mockReset();
  findByIdMock.mockResolvedValue({ id: "user-1", tokenVersion: 1 });
});

// -----------------------------------------------------------------------------
// Test Cases (05-rate-limit.md)
// -----------------------------------------------------------------------------

describe("Rate limiting", () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  describe("Spam login blocked", () => {
    it("returns 429 when login attempts exceed 5 per minute per IP", async () => {
      redisEvalMock.mockResolvedValue(6); // over limit

      const res = await request(app)
        .post("/auth/login")
        .send({ email: "any@example.com", password: "any" });

      expect(res.status).toBe(429);
      expect(res.body.error).toMatch(/too many login attempts/i);
      expect(res.body.retryAfterSeconds).toBe(60);
    });
  });

  describe("Account locked after threshold", () => {
    it("returns 403 with lockedUntil when user is temporarily locked", async () => {
      redisEvalMock.mockResolvedValue(1); // under limit
      const lockedUntil = new Date(Date.now() + 60 * 1000);
      findByEmailMock.mockResolvedValueOnce({
        id: "user-locked",
        email: "locked@example.com",
        password: "hash",
        status: "LOCKED",
        lockedUntil,
      });

      const res = await request(app)
        .post("/auth/login")
        .send({ email: "locked@example.com", password: "wrongpass" });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/temporarily locked/i);
      expect(res.body.lockedUntil).toBe(lockedUntil.toISOString());
      expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  describe("Spam refresh blocked", () => {
    it("returns 429 when refresh attempts exceed 10 per minute per user", async () => {
      redisEvalMock.mockResolvedValue(11); // over limit

      const userId = "user-refresh";
      const token = await signRefreshToken(userId, "device");

      const res = await request(app)
        .post("/auth/refresh-token")
        .send({ refreshToken: token });

      expect(res.status).toBe(429);
      expect(res.body.error).toMatch(/too many refresh attempts/i);
      expect(res.body.retryAfterSeconds).toBe(60);
    });
  });
});
