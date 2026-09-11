import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

// pino-pretty is a devDependency: serverless runtimes (Vercel) prune dev
// dependencies, so a worker transport there would throw on cold start.
const canPrettyPrint = !isProduction && !process.env.VERCEL;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(canPrettyPrint
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : {}),
});
