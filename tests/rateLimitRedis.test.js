import { beforeAll, describe, expect, it, jest } from "@jest/globals";

// We only mock the async dependency getRedis; checkRateLimit itself is real.
let getRedisMock;
jest.unstable_mockModule("../src/config/redis.js", () => {
  getRedisMock = jest.fn();
  return {
    getRedis: getRedisMock,
  };
});

let checkRateLimit;

beforeAll(async () => {
  const mod = await import("../src/middleware/rateLimitRedis.js");
  checkRateLimit = mod.checkRateLimit;
});

const createRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    setHeader: jest.fn(),
  };
  return res;
};

describe("checkRateLimit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns false and 503 when getRedis throws", async () => {
    getRedisMock.mockImplementationOnce(() => {
      throw new Error("redis config error");
    });

    const res = createRes();
    const allowed = await checkRateLimit(
      "rate:test:getRedisError",
      5,
      60,
      res,
      { errorMessage: "Too many test" },
    );

    expect(allowed).toBe(false);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: "Rate limit service unavailable",
    });
  });

  it("returns false and 503 when redis.eval throws", async () => {
    const evalMock = jest.fn().mockRejectedValueOnce(new Error("redis down"));
    getRedisMock.mockReturnValueOnce({ eval: evalMock });

    const res = createRes();
    const allowed = await checkRateLimit("rate:test:evalError", 5, 60, res, {
      errorMessage: "Too many test",
    });

    expect(evalMock).toHaveBeenCalledTimes(1);
    expect(allowed).toBe(false);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: "Rate limit service unavailable",
    });
  });
});
