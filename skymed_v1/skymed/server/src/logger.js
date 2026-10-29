// src/logger.js — structured JSON logging (pino).
// One logger instance for the whole process; modules create children with
// a `module` binding so every line is attributable.
const pino = require("pino");
const config = require("./config");

const logger = pino({
  level: config.logLevel,
  base: { service: "skymed-pilot" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    // Defence in depth: never let a raw MSISDN slip into a log line.
    paths: ["MSISDN", "msisdn", "*.MSISDN", "*.msisdn"],
    censor: "[redacted]",
  },
});

module.exports = logger;
