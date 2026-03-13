import { getClientIp } from "../utils/clientIp.js";
import { checkRateLimit } from "./rateLimitRedis.js";

const WINDOW_SECONDS = 60;
const MAX_ATTEMPTS = 10;
const KEY_PREFIX_USER = "rate:refresh:";
const KEY_PREFIX_ANON = "rate:refresh:anon:";

/**
 * 10 refresh attempts per minute per user (Redis key rate:refresh:<userId>).
 * Nếu userId null (token invalid), dùng rate:refresh:anon:<ip> để giới hạn abuse.
 * @returns {Promise<boolean>} true nếu cho phép, false nếu đã gửi 429/503
 */
export async function enforceRefreshRateLimit(userId, req, res) {
  const key =
    userId != null
      ? `${KEY_PREFIX_USER}${userId}`
      : `${KEY_PREFIX_ANON}${getClientIp(req)}`;

  return checkRateLimit(key, MAX_ATTEMPTS, WINDOW_SECONDS, res, {
    errorMessage: "Too many refresh attempts",
  });
}
