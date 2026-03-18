import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { logger, redactConfig } from "./config/logger.js";
import { authorize } from "./middleware/authorize.js";
import { getMetrics, metricsMiddleware } from "./middleware/metrics.js";
import { requirePermission } from "./middleware/require.permission.js";
import authRouter from "./modules/auth/auth.route.js";
import refreshRouter from "./modules/refresh/refresh.route.js";

export const createApp = () => {
  const app = express();

  // So req.ip reflects client IP when behind reverse proxy (rate limit, logs)
  app.set("trust proxy", 1);

  // ===== HTTPS Redirect (production only) =====
  if (process.env.NODE_ENV === "production") {
    app.use((req, res, next) => {
      if (req.secure || req.headers["x-forwarded-proto"] === "https") {
        return next();
      }
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    });
  }

  // ===== Security Headers =====
  app.use(
    helmet({
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      contentSecurityPolicy: true,
      crossOriginResourcePolicy: { policy: "same-origin" },
    }),
  );

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
      redact: redactConfig,
    }),
  );

  // ===== Metrics Middleware =====
  app.use(metricsMiddleware);

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

  // ===== Metrics Route =====
  app.get("/metrics", authorize, requirePermission("metrics:read"), async (req, res, next) => {
    try {
      const data = await getMetrics();
      res.json(data);
    } catch (error) {
      next(error);
    }
  });

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
