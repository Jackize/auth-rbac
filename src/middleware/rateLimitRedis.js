import { getRedis } from "../config/redis.js";

const LUA_INCR_EXPIRE = `
  local n = redis.call('INCR', KEYS[1])
  if n == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return n
`;

/**
 * Kiểm tra rate limit bằng Redis: INCR key, nếu vượt maxAttempts thì chặn.
 * Tự set header X-RateLimit-* và gửi 429/503 khi cần.
 * @param {string} key - Redis key (vd: rate:login:<ip>)
 * @param {number} maxAttempts - Số lần cho phép trong window
 * @param {number} windowSeconds - Cửa sổ thời gian (giây)
 * @param {object} res - Express response
 * @param {{ errorMessage: string }} options - errorMessage cho body 429
 * @returns {Promise<boolean>} true nếu cho phép, false nếu đã gửi 429/503
 */
export async function checkRateLimit(
  key,
  maxAttempts,
  windowSeconds,
  res,
  options = {},
) {
  const { errorMessage = "Too many requests" } = options;

  let redis;
  try {
    redis = getRedis();
  } catch {
    res.status(503).json({ error: "Rate limit service unavailable" });
    return false;
  }

  try {
    const count = await redis.eval(
      LUA_INCR_EXPIRE,
      1,
      key,
      String(windowSeconds),
    );
    const n = Number(count);
    const remaining = Math.max(0, maxAttempts - n);

    res.setHeader("X-RateLimit-Limit", String(maxAttempts));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(windowSeconds));

    if (n > maxAttempts) {
      res.setHeader("Retry-After", String(windowSeconds));
      res.status(429).json({
        error: errorMessage,
        retryAfterSeconds: windowSeconds,
      });
      return false;
    }
    return true;
  } catch {
    res.status(503).json({ error: "Rate limit service unavailable" });
    return false;
  }
}
