import { getRedis } from "../config/redis.js";

const TTL_SECONDS = 3600; // 1 hour window

async function incrementMetric(key) {
  const redis = getRedis();
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, TTL_SECONDS);
  }
}

export async function incrementLoginFailure() {
  await incrementMetric("metrics:login:failure");
}

export async function incrementLoginSuccess() {
  await incrementMetric("metrics:login:success");
}

export function metricsMiddleware(req, res, next) {
  res.on("finish", () => {
    if (res.statusCode === 401) {
      incrementMetric("metrics:http:401").catch(() => {});
    } else if (res.statusCode === 403) {
      incrementMetric("metrics:http:403").catch(() => {});
    }
  });
  next();
}

export async function getMetrics() {
  const redis = getRedis();
  const [loginFailures, loginSuccess, http401, http403] = await redis.mget(
    "metrics:login:failure",
    "metrics:login:success",
    "metrics:http:401",
    "metrics:http:403",
  );
  return {
    login_failures_1h: parseInt(loginFailures ?? "0", 10),
    login_success_1h: parseInt(loginSuccess ?? "0", 10),
    http_401_1h: parseInt(http401 ?? "0", 10),
    http_403_1h: parseInt(http403 ?? "0", 10),
  };
}
