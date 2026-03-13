import { beforeAll, describe, expect, it, jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Minimal mocks: only async deps (verifyAccessToken, userRepository.findById)
// ---------------------------------------------------------------------------

const verifyAccessTokenMock = jest.fn();
jest.unstable_mockModule("../src/utils/jwt.js", () => ({
  verifyAccessToken: verifyAccessTokenMock,
}));

const findByIdMock = jest.fn();
jest.unstable_mockModule("../src/repository/user.repository.js", () => ({
  userRepository: {
    findById: findByIdMock,
  },
}));

let authorize;

beforeAll(async () => {
  const mod = await import("../src/middleware/authorize.js");
  authorize = mod.authorize;
});

const createRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return res;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("authorize middleware", () => {
  it("returns 401 when access token is missing", async () => {
    const req = { headers: {} };
    const res = createRes();
    const next = jest.fn();

    await authorize(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "Access token missing",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when token version is invalid or user not found", async () => {
    verifyAccessTokenMock.mockResolvedValueOnce({
      userId: "user-1",
      tokenVersion: 2,
    });
    // user not found (null)
    findByIdMock.mockResolvedValueOnce(null);

    const req = { headers: { authorization: "Bearer token-abc" } };
    const res = createRes();
    const next = jest.fn();

    await authorize(req, res, next);

    expect(verifyAccessTokenMock).toHaveBeenCalledWith("token-abc");
    expect(findByIdMock).toHaveBeenCalledWith("user-1", {
      select: { tokenVersion: true },
    });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "Invalid token version",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches payload to req.user and calls next on success", async () => {
    const payload = { userId: "user-2", tokenVersion: 3 };
    verifyAccessTokenMock.mockResolvedValueOnce(payload);
    findByIdMock.mockResolvedValueOnce({ tokenVersion: 3 });

    const req = { headers: { authorization: "Bearer good-token" } };
    const res = createRes();
    const next = jest.fn();

    await authorize(req, res, next);

    expect(req.user).toEqual(payload);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 401 when verifyAccessToken throws (invalid/expired token)", async () => {
    verifyAccessTokenMock.mockRejectedValueOnce(new Error("jwt error"));

    const req = { headers: { authorization: "Bearer bad-token" } };
    const res = createRes();
    const next = jest.fn();

    await authorize(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "Invalid or expired token",
    });
    expect(next).not.toHaveBeenCalled();
  });
});

