import pino from "pino";
import pretty from "pino-pretty";

const stream = pretty({
  levelFirst: true,
  colorize: true,
  ignore: "time,hostname,pid",
});

export const redactConfig = {
  paths: [
    "password",
    "body.password",
    "req.body.password",
    "refreshToken",
    "accessToken",
    "token",
  ],
  censor: "[REDACTED]",
};

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    redact: redactConfig,
  },
  stream,
);
