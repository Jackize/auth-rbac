import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

// ---------------------------------------------------------------------------
// Mocks (ESM-safe) for auth.controller dependencies
// ---------------------------------------------------------------------------

const findByEmailMock = jest.fn();
const findByIdMock = jest.fn();
const createUserMock = jest.fn();
const recordFailedLoginMock = jest.fn();
const resetFailedLoginAttemptsMock = jest.fn();
const unlockIfExpiredMock = jest.fn();

jest.unstable_mockModule("../src/repository/user.repository.js", () => ({
  userRepository: {
    findByEmail: findByEmailMock,
    findById: findByIdMock,
    create: createUserMock,
    recordFailedLogin: recordFailedLoginMock,
    resetFailedLoginAttempts: resetFailedLoginAttemptsMock,
    unlockIfExpired: unlockIfExpiredMock,
  },
}));

const signAccessTokenMock = jest.fn();
jest.unstable_mockModule("../src/utils/jwt.js", () => ({
  signAccessToken: signAccessTokenMock,
}));

const hashPasswordMock = jest.fn();
const verifyPasswordMock = jest.fn();
jest.unstable_mockModule("../src/utils/password.js", () => ({
  hashPassword: hashPasswordMock,
  verifyPassword: verifyPasswordMock,
}));

const signRefreshTokenMock = jest.fn();
jest.unstable_mockModule("../src/utils/refreshToken.js", () => ({
  signRefreshToken: signRefreshTokenMock,
}));

// ---------------------------------------------------------------------------
// Dynamic import after mocks
// ---------------------------------------------------------------------------

let login;
let register;
let getProfile;

beforeAll(async () => {
  const mod = await import("../src/modules/auth/auth.controller.js");
  login = mod.login;
  register = mod.register;
  getProfile = mod.getProfile;
});

beforeEach(() => {
  jest.clearAllMocks();
});

const createRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return res;
};

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

describe("auth.controller - login", () => {
  it("returns 401 when user not found", async () => {
    findByEmailMock.mockResolvedValueOnce(null);
    const req = {
      body: { email: "none@example.com", password: "password123" },
    };
    const res = createRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "Invalid email or password",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when account is LOCKED and lockedUntil in future", async () => {
    const lockedUntil = new Date(Date.now() + 60_000);
    findByEmailMock.mockResolvedValueOnce({
      id: "user-1",
      email: "locked@example.com",
      password: "hash",
      status: "LOCKED",
      lockedUntil,
      tokenVersion: 1,
    });
    unlockIfExpiredMock.mockResolvedValueOnce(null);

    const req = {
      body: { email: "locked@example.com", password: "password123" },
    };
    const res = createRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toMatch(/temporarily locked/i);
    expect(payload.lockedUntil).toBe(lockedUntil.toISOString());
    expect(payload.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("returns 403 when account is LOCKED without lockedUntil (legacy data)", async () => {
    findByEmailMock.mockResolvedValueOnce({
      id: "user-legacy",
      email: "legacy@example.com",
      password: "hash",
      status: "LOCKED",
      lockedUntil: null,
      tokenVersion: 1,
    });
    unlockIfExpiredMock.mockResolvedValueOnce(null);

    const req = {
      body: { email: "legacy@example.com", password: "password123" },
    };
    const res = createRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "Account is locked. Contact support.",
    });
  });

  it("unlocks expired LOCKED account then continues login flow", async () => {
    const past = new Date(Date.now() - 60_000);
    const lockedUser = {
      id: "user-locked-expired",
      email: "locked2@example.com",
      password: "hash",
      status: "LOCKED",
      lockedUntil: past,
      tokenVersion: 1,
    };
    const unlockedUser = {
      ...lockedUser,
      status: "ACTIVE",
      lockedUntil: null,
    };
    findByEmailMock.mockResolvedValueOnce(lockedUser);
    unlockIfExpiredMock.mockResolvedValueOnce(unlockedUser);
    verifyPasswordMock.mockResolvedValueOnce(false);
    recordFailedLoginMock.mockResolvedValueOnce({ locked: false });

    const req = {
      body: { email: "locked2@example.com", password: "wrongpass" },
    };
    const res = createRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(unlockIfExpiredMock).toHaveBeenCalledWith(lockedUser);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "Invalid email or password",
    });
  });

  it("returns 401 when password is invalid and account not locked", async () => {
    findByEmailMock.mockResolvedValueOnce({
      id: "user-2",
      email: "user2@example.com",
      password: "hash",
      status: "ACTIVE",
      tokenVersion: 1,
    });
    verifyPasswordMock.mockResolvedValueOnce(false);
    recordFailedLoginMock.mockResolvedValueOnce({ locked: false });

    const req = { body: { email: "user2@example.com", password: "wrongpass" } };
    const res = createRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(recordFailedLoginMock).toHaveBeenCalledWith("user-2");
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "Invalid email or password",
    });
  });

  it("returns 403 when invalid password triggers lock (recordFailedLogin.locked)", async () => {
    const lockedUntil = new Date(Date.now() + 60_000);
    findByEmailMock.mockResolvedValueOnce({
      id: "user-3",
      email: "user3@example.com",
      password: "hash",
      status: "ACTIVE",
      tokenVersion: 1,
    });
    verifyPasswordMock.mockResolvedValueOnce(false);
    recordFailedLoginMock.mockResolvedValueOnce({
      locked: true,
      lockedUntil,
    });

    const req = { body: { email: "user3@example.com", password: "wrongpass" } };
    const res = createRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toMatch(/temporarily locked/i);
    expect(payload.lockedUntil).toBe(lockedUntil.toISOString());
    expect(payload.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("returns 200 and tokens on successful login", async () => {
    findByEmailMock.mockResolvedValueOnce({
      id: "user-4",
      email: "user4@example.com",
      password: "hash",
      status: "ACTIVE",
      tokenVersion: 2,
    });
    verifyPasswordMock.mockResolvedValueOnce(true);
    signAccessTokenMock.mockResolvedValueOnce("access-token-123");
    signRefreshTokenMock.mockResolvedValueOnce("refresh-token-abc");

    const req = {
      body: { email: "user4@example.com", password: "password123" },
      headers: { "user-agent": "jest-test-agent" },
    };
    const res = createRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(resetFailedLoginAttemptsMock).toHaveBeenCalledWith("user-4");
    expect(signAccessTokenMock).toHaveBeenCalledWith({
      userId: "user-4",
      tokenVersion: 2,
    });
    expect(signRefreshTokenMock).toHaveBeenCalledWith(
      "user-4",
      "jest-test-agent",
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.message).toBe("Login successful");
    expect(payload.accessToken).toBe("access-token-123");
    expect(payload.refreshToken).toBe("refresh-token-abc");
  });

  it("calls next(error) when login throws", async () => {
    const error = new Error("DB failure");
    findByEmailMock.mockRejectedValueOnce(error);

    const req = {
      body: { email: "boom@example.com", password: "password123" },
    };
    const res = createRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

describe("auth.controller – register", () => {
  it("returns 409 when email already exists", async () => {
    findByEmailMock.mockResolvedValueOnce({ id: "existing" });

    const req = {
      body: {
        email: "dup@example.com",
        username: "dup",
        password: "password123",
      },
    };
    const res = createRes();
    const next = jest.fn();

    await register(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: "Email already exists",
    });
  });

  it("hashes password and creates user on success", async () => {
    findByEmailMock.mockResolvedValueOnce(null);
    hashPasswordMock.mockResolvedValueOnce("hashed-pass");
    createUserMock.mockResolvedValueOnce({ id: "new-user" });

    const req = {
      body: {
        email: "new@example.com",
        username: "new",
        password: "password123",
      },
    };
    const res = createRes();
    const next = jest.fn();

    await register(req, res, next);

    expect(hashPasswordMock).toHaveBeenCalledWith("password123");
    expect(createUserMock).toHaveBeenCalledWith({
      email: "new@example.com",
      username: "new",
      password: "hashed-pass",
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: "User registered successfully",
    });
  });

  it("calls next(error) when register throws", async () => {
    const error = new Error("create failed");
    findByEmailMock.mockResolvedValueOnce(null);
    hashPasswordMock.mockRejectedValueOnce(error);

    const req = {
      body: {
        email: "err@example.com",
        username: "err",
        password: "password123",
      },
    };
    const res = createRes();
    const next = jest.fn();

    await register(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

// ---------------------------------------------------------------------------
// getProfile
// ---------------------------------------------------------------------------

describe("auth.controller – getProfile", () => {
  it("returns 404 when user not found", async () => {
    findByIdMock.mockResolvedValueOnce(null);

    const req = { user: { userId: "missing-id" } };
    const res = createRes();
    const next = jest.fn();

    await getProfile(req, res, next);

    expect(findByIdMock).toHaveBeenCalledWith("missing-id");
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "User not found" });
  });

  it("returns email and status when user exists", async () => {
    findByIdMock.mockResolvedValueOnce({
      id: "user-5",
      email: "u5@example.com",
      status: "ACTIVE",
    });

    const req = { user: { userId: "user-5" } };
    const res = createRes();
    const next = jest.fn();

    await getProfile(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      email: "u5@example.com",
      status: "ACTIVE",
    });
  });

  it("calls next(error) when getProfile throws", async () => {
    const error = new Error("findById failed");
    findByIdMock.mockRejectedValueOnce(error);

    const req = { user: { userId: "boom" } };
    const res = createRes();
    const next = jest.fn();

    await getProfile(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
