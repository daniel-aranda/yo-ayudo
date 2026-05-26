import pino from "pino";
import { config } from "../app/config.js";

export const logger = pino({
  level: config.node_env === "test" ? "silent" : config.log_level,
  transport:
    config.node_env === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
          },
        }
      : undefined,
  redact: {
    paths: [
      "req.headers.authorization",
      "whatsapp_access_token",
      "WHATSAPP_ACCESS_TOKEN",
      "*.access_token",
      "*.token",
    ],
    censor: "[redacted]",
  },
});
