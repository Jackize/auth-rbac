import { getClientIp } from "../utils/clientIp.js";
import { checkRateLimit } from "./rateLimitRedis.js";

const WINDOW_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const KEY_PREFIX = "rate:login:";

/**
 * Rate limit login: 5 attempts per minute per IP.
 * Redis key: rate:login:<ip>
 */
export async function rateLimitLogin(req, res, next) {
  const key = `${KEY_PREFIX}${getClientIp(req)}`;
  const allowed = await checkRateLimit(key, MAX_ATTEMPTS, WINDOW_SECONDS, res, {
    errorMessage: "Too many login attempts",
  });
  if (allowed) next();
}
