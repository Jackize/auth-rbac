const Redis = require("ioredis");
const { logger } = require("./logger");

// simple singleton wrapper around a single redis client
// every module that needs a redis connection should call
// `getRedis()` so the same underlying instance is reused.
let client;

function getRedis() {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL must be defined in environment");
    }

    client = new Redis(url);

    // optional logging to aid in debugging
    client.on("connect", () => {
      logger.info("Redis connected");
    });
    client.on("error", (err) => {
      logger.error("Redis error", err);
    });
  }

  return client;
}

module.exports = { getRedis };
