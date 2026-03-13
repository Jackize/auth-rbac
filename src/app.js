import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { logger } from "./config/logger.js";
import { authorize } from "./middleware/authorize.js";
import authRouter from "./modules/auth/auth.route.js";
import refreshRouter from "./modules/refresh/refresh.route.js";

export const createApp = () => {
  const app = express();

  // So req.ip reflects client IP when behind reverse proxy (rate limit, logs)
  app.set("trust proxy", 1);

  // ===== Security Headers =====
  app.use(helmet());

  // ===== CORS =====
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || "*",
      credentials: true,
    }),
  );

  // ===== Logger =====
  app.use(
    pinoHttp({
      logger,
    }),
  );

  // ===== Body Parser =====
  app.use(
    express.json({
      limit: "10kb", // chống body bomb
    }),
  );

  app.use(
    express.urlencoded({
      extended: false,
    }),
  );

  // ===== Health Check =====
  app.get("/health", (req, res) => {
    res.status(200).json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
  });

  // ===== Example Protected Route Placeholder =====
  app.get("/protected", authorize, (req, res) => {
    res.json({ message: "You reached protected route" });
  });

  app.use("/auth", authRouter);
  app.use("/refresh", refreshRouter);

  // ===== 404 Handler =====
  app.use((req, res) => {
    res.status(404).json({
      error: "Route not found",
    });
  });

  // ===== Global Error Handler =====
  app.use((err, req, res, next) => {
    // req.log.error(err);

    const statusCode = err.statusCode || 500;

    // logger.error(err, "Unhandled error occurred");

    res.status(statusCode).json({
      error:
        process.env.NODE_ENV === "production"
          ? "Internal Server Error"
          : err.message,
      stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
    });
  });

  return app;
};
