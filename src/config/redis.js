import dotenv from "dotenv";
import Redis from "ioredis";
import { logger } from "./logger.js";
dotenv.config();

// singleton – reuse one client across the app
let client;

export function getRedis() {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL must be defined in environment");
    }

    client = new Redis(url);

    client.on("connect", () => {
      logger.info("Redis connected");
    });
    client.on("error", (err) => {
      logger.error("Redis error", err);
    });
  }

  return client;
}
