import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";

// -----------------------------------------------------------------------------
// Mocks (ESM-safe)
// -----------------------------------------------------------------------------

let _tokens = [];
let refreshTokenRepositoryMock;
let signRefreshToken;
let createApp;

jest.unstable_mockModule("../src/repository/refreshToken.repository.js", () => {
  _tokens = [];
  const create = jest.fn(async ({ tokenHash, userId, deviceId }) => {
    const record = {
      tokenHash,
      userId,
      deviceId,
      revoked: false,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
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

  const __reset = () => {
    _tokens = [];
    create.mockClear();
    findByToken.mockClear();
    revokeTokenByToken.mockClear();
    revokeTokensByUserId.mockClear();
    findActiveTokensByUserId.mockClear();
    deleteByToken.mockClear();
    deleteByUserId.mockClear();
  };

  const __getTokens = () => _tokens;

  return {
    refreshTokenRepository: {
      create,
      findByToken,
      revokeTokenByToken,
      revokeTokensByUserId,
      findActiveTokensByUserId,
      deleteByToken,
      deleteByUserId,
      __reset,
      __getTokens,
    },
  };
});

jest.unstable_mockModule("../src/repository/user.repository.js", () => {
  return {
    userRepository: {
      findById: jest.fn(async (id) => ({ id, tokenVersion: 1 })),
      incrementTokenVersion: jest.fn(async (id) => ({ id })),
    },
  };
});

// dynamically import modules that depend on the mocks
beforeAll(async () => {
  ({ signRefreshToken } = await import("../src/utils/refreshToken.js"));
  ({ createApp } = await import("../src/app.js"));

  const mod = await import("../src/repository/refreshToken.repository.js");
  refreshTokenRepositoryMock = mod.refreshTokenRepository;
});

// -----------------------------------------------------------------------------
// Helper & setup
// -----------------------------------------------------------------------------

describe("Refresh token/session lifecycle", () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    // clear the in-memory "database" used by our mock implementation
    _tokens = [];
  });

  it("should rotate tokens and prevent reuse of the previous refresh (reuse triggers global revoke)", async () => {
    const userId = "user-123";
    const deviceId = "test-device";

    // create initial refresh token
    const oldToken = await signRefreshToken(userId, deviceId);

    // first call should succeed and return a new refresh token
    const first = await request(app)
      .post("/auth/refresh-token")
      .send({ refreshToken: oldToken });

    expect(first.status).toBe(200);
    expect(first.body.refreshToken).toBeDefined();
    expect(first.body.refreshToken).not.toBe(oldToken);

    const newToken = first.body.refreshToken;

    // using the old token again should fail with 401 and trigger revocation of
    // all tokens for the user
    const second = await request(app)
      .post("/auth/refresh-token")
      .send({ refreshToken: oldToken });

    expect(second.status).toBe(401);
    expect(second.body.error).toBe("Refresh token revoked");

    // our mock keeps the tokens in the `_tokens` array defined above.
    // the repository mock was captured in `refreshTokenRepositoryMock` earlier
    // so we can inspect the jest.fn() calls directly.
    expect(refreshTokenRepositoryMock.revokeTokensByUserId).toHaveBeenCalledWith(userId);

    // after revocation every token for that user should have been marked
    // revoked (including the one we just issued)
    expect(_tokens.every((t) => t.revoked)).toBe(true);
  });

  it("logout should invalidate the specific refresh token", async () => {
    const userId = "user-456";
    const deviceId = "logout-device";

    const token = await signRefreshToken(userId, deviceId);

    const logoutResp = await request(app)
      .post("/auth/logout")
      .send({ refreshToken: token });

    expect(logoutResp.status).toBe(200);
    expect(logoutResp.body.message).toBe("Refresh token revoked successfully");

    // subsequent attempts to refresh with the same token must fail
    const attempt = await request(app)
      .post("/auth/refresh-token")
      .send({ refreshToken: token });

    expect(attempt.status).toBe(401);
    expect(attempt.body.error).toBe("Refresh token revoked");
  });
});
