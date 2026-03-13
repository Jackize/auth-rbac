import "dotenv/config";
import http from "http";
import { createApp } from "./app.js";
import { logger } from "./config/logger.js";
const PORT = process.env.PORT || 3000;

const app = createApp();
const server = http.createServer(app);

server.listen(PORT, () => {
  // console.clear();
  logger.info(`🚀 Auth Service running on port ${PORT}`);
});

// ===== Graceful Shutdown =====
function shutdown(signal) {
  logger.info(`${signal} received. Shutting down gracefully...`);

  server.close(() => {
    logger.info("HTTP server closed.");
    process.exit(0);
  });

  // force shutdown nếu treo quá lâu
  setTimeout(() => {
    logger.error("Force shutdown.");
    process.exit(1);
  }, 10000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("uncaughtException", (err) => {
  logger.fatal(err, "Uncaught Exception");
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  logger.fatal(err, "Unhandled Rejection");
  process.exit(1);
});
