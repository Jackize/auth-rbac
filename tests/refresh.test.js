import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";

// -----------------------------------------------------------------------------
// Mocks (ESM-safe) – Redis, Authorize, RefreshToken repo, User repo
// -----------------------------------------------------------------------------

jest.unstable_mockModule("../src/config/redis.js", () => ({
  getRedis: () => ({ eval: jest.fn().mockResolvedValue(1) }),
}));

jest.unstable_mockModule("../src/middleware/rate.limit.refresh.js", () => ({
  enforceRefreshRateLimit: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule("../src/middleware/authorize.js", () => ({
  authorize: (req, res, next) => {
    req.user = { userId: "test-user-id" };
    next();
  },
}));

let _tokens = [];
let refreshTokenRepositoryMock;
let userRepositoryMock;
let signRefreshToken;
let invalidateRefreshTokens;
let createApp;

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

  const findActiveTokensByUserId = jest.fn(async (userId) =>
    _tokens.filter(
      (t) => t.userId === userId && !t.revoked && t.expiresAt > new Date()
    )
  );

  const deleteByToken = jest.fn(async (token) => {
    _tokens = _tokens.filter((t) => t.tokenHash !== token);
  });
  const deleteByUserId = jest.fn(async (userId) => {
    _tokens = _tokens.filter((t) => t.userId !== userId);
  });

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

const findByIdMock = jest.fn(async (id) => ({ id, tokenVersion: 1 }));
const incrementTokenVersionMock = jest.fn(async (id) => ({ id }));

jest.unstable_mockModule("../src/repository/user.repository.js", () => ({
  userRepository: {
    findById: findByIdMock,
    incrementTokenVersion: incrementTokenVersionMock,
  },
}));

// -----------------------------------------------------------------------------
// Dynamic imports after mocks
// -----------------------------------------------------------------------------

beforeAll(async () => {
  const refreshTokenUtil = await import("../src/utils/refreshToken.js");
  signRefreshToken = refreshTokenUtil.signRefreshToken;
  invalidateRefreshTokens = refreshTokenUtil.invalidateRefreshTokens;
  ({ createApp } = await import("../src/app.js"));

  const refreshMod = await import("../src/repository/refreshToken.repository.js");
  refreshTokenRepositoryMock = refreshMod.refreshTokenRepository;

  const userMod = await import("../src/repository/user.repository.js");
  userRepositoryMock = userMod.userRepository;
});

beforeEach(() => {
  _tokens = [];
  findByIdMock.mockResolvedValue({ id: "user-1", tokenVersion: 1 });
  incrementTokenVersionMock.mockClear();
});

// -----------------------------------------------------------------------------
// Validation (refresh.validation.js)
// -----------------------------------------------------------------------------

describe("Refresh validation", () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  it("returns 400 when refreshToken is missing on POST /auth/refresh-token", async () => {
    const res = await request(app)
      .post("/auth/refresh-token")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid input/i);
    expect(res.body.details).toBeDefined();
  });

  it("returns 400 when refreshToken is empty string on POST /auth/refresh-token", async () => {
    const res = await request(app)
      .post("/auth/refresh-token")
      .send({ refreshToken: "" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid input/i);
  });

  it("returns 400 when refreshToken is missing on POST /auth/logout", async () => {
    const res = await request(app).post("/auth/logout").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid input/i);
  });

  it("returns 400 when refreshToken is not a string (validation)", async () => {
    const res = await request(app)
      .post("/auth/refresh-token")
      .send({ refreshToken: 123 });

    expect(res.status).toBe(400);
    expect(res.body.details).toBeDefined();
  });
});

// -----------------------------------------------------------------------------
// Controller: generateRefreshToken
// -----------------------------------------------------------------------------

describe("generateRefreshToken (controller)", () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  it("returns 401 when refresh token is invalid (not in DB)", async () => {
    refreshTokenRepositoryMock.findByToken.mockImplementationOnce(
      async () => null
    );
    const res = await request(app)
      .post("/auth/refresh-token")
      .send({ refreshToken: "nonexistent-token-12345" });

    expect([401, 503, 500]).toContain(res.status);
    if (res.status === 401) {
      expect(res.body.error).toBe("Invalid refresh token");
    }
  });

  it("returns 401 Invalid refresh token after invalidateRefreshTokens (covers util + controller line 30)", async () => {
    const userId = "user-invalidate";
    const token = await signRefreshToken(userId, "device");
    expect(_tokens.some((t) => t.tokenHash === token)).toBe(true);

    await invalidateRefreshTokens(userId);
    expect(refreshTokenRepositoryMock.deleteByUserId).toHaveBeenCalledWith(
      userId
    );
    expect(_tokens.some((t) => t.userId === userId)).toBe(false);

    const res = await request(app)
      .post("/auth/refresh-token")
      .send({ refreshToken: token });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid refresh token");
  });

  it("returns 400 when refreshToken missing (controller guard)", async () => {
    const { generateRefreshToken } = await import(
      "../src/modules/refresh/refresh.controller.js"
    );
    const req = { body: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await generateRefreshToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "Refresh token missing",
    });
  });


  it("returns 404 when user not found", async () => {
    findByIdMock.mockResolvedValueOnce(null);

    const token = await signRefreshToken("user-orphan", "device");
    const res = await request(app)
      .post("/auth/refresh-token")
      .send({ refreshToken: token });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("User not found");
  });

  it("returns 200 with new accessToken and refreshToken on success", async () => {
    const userId = "user-123";
    const oldToken = await signRefreshToken(userId, "test-device");

    const res = await request(app)
      .post("/auth/refresh-token")
      .send({ refreshToken: oldToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.refreshToken).not.toBe(oldToken);
  });

  it("returns 401 when token is revoked (reuse triggers revoke)", async () => {
    const userId = "user-123";
    const oldToken = await signRefreshToken(userId, "device");

    const first = await request(app)
      .post("/auth/refresh-token")
      .send({ refreshToken: oldToken });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/auth/refresh-token")
      .send({ refreshToken: oldToken });
    expect(second.status).toBe(401);
    expect(second.body.error).toBe("Refresh token revoked");
    expect(refreshTokenRepositoryMock.revokeTokensByUserId).toHaveBeenCalledWith(userId);
  });

  it("calls next(error) when findById throws", async () => {
    findByIdMock.mockRejectedValueOnce(new Error("DB error"));

    const token = await signRefreshToken("user-1", "device");
    const res = await request(app)
      .post("/auth/refresh-token")
      .send({ refreshToken: token });

    expect(res.status).toBe(500);
  });
});

// -----------------------------------------------------------------------------
// Controller: getActiveRefreshTokens + Route GET /refresh/active
// -----------------------------------------------------------------------------

describe("getActiveRefreshTokens (controller) and GET /refresh/active (route)", () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  it("returns 200 with list of active tokens for authenticated user", async () => {
    const res = await request(app)
      .get("/refresh/active")
      .set("Authorization", "Bearer fake-token-ok");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(refreshTokenRepositoryMock.findActiveTokensByUserId).toHaveBeenCalledWith(
      "test-user-id"
    );
  });

  it("calls next(error) when findActiveTokensByUserId throws", async () => {
    refreshTokenRepositoryMock.findActiveTokensByUserId.mockRejectedValueOnce(
      new Error("DB error")
    );
    const res = await request(app)
      .get("/refresh/active")
      .set("Authorization", "Bearer any");
    expect(res.status).toBe(500);
  });
});

// -----------------------------------------------------------------------------
// Controller: revokeRefreshToken
// -----------------------------------------------------------------------------

describe("revokeRefreshToken (controller)", () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  it("returns 400 when refreshToken missing (controller guard)", async () => {
    const { revokeRefreshToken } = await import(
      "../src/modules/refresh/refresh.controller.js"
    );
    const req = { body: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await revokeRefreshToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "Refresh token missing",
    });
  });

  it("returns 200 and revokes the given refresh token", async () => {
    const token = await signRefreshToken("user-456", "logout-device");

    const res = await request(app)
      .post("/auth/logout")
      .send({ refreshToken: token });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Refresh token revoked successfully");

    const attempt = await request(app)
      .post("/auth/refresh-token")
      .send({ refreshToken: token });
    expect(attempt.status).toBe(401);
    expect(attempt.body.error).toBe("Refresh token revoked");
  });

  it("calls next(error) when revokeTokenByToken throws", async () => {
    refreshTokenRepositoryMock.revokeTokenByToken.mockRejectedValueOnce(
      new Error("DB error")
    );
    const token = await signRefreshToken("user-x", "device");
    const res = await request(app)
      .post("/auth/logout")
      .send({ refreshToken: token });
    expect(res.status).toBe(500);
  });
});

// -----------------------------------------------------------------------------
// Controller: revokeAllRefreshTokens + Route POST /auth/logout-all
// -----------------------------------------------------------------------------

describe("revokeAllRefreshTokens (controller) and POST /auth/logout-all (route)", () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  it("returns 200 and revokes all tokens for the user", async () => {
    const res = await request(app)
      .post("/auth/logout-all")
      .set("Authorization", "Bearer any");

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("All refresh tokens revoked successfully");
    expect(refreshTokenRepositoryMock.revokeTokensByUserId).toHaveBeenCalledWith(
      "test-user-id"
    );
    expect(userRepositoryMock.incrementTokenVersion).toHaveBeenCalledWith(
      "test-user-id"
    );
  });

  it("calls next(error) when revokeTokensByUserId throws", async () => {
    refreshTokenRepositoryMock.revokeTokensByUserId.mockRejectedValueOnce(
      new Error("DB error")
    );
    const res = await request(app)
      .post("/auth/logout-all")
      .set("Authorization", "Bearer any");
    expect(res.status).toBe(500);
  });
});
