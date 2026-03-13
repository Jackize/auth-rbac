/**
 * Resolves client IP from request (for rate limiting, logging).
 * Set app.set("trust proxy", 1) when behind reverse proxy so req.ip is correct.
 */
export function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}
