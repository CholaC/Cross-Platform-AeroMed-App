// src/middleware/requestLog.js — structured HTTP request logging (pino-http).
// Every request gets a UUID request-id (echoed in the X-Request-Id header)
// so a webhook callback, its domain calls, and its response can be
// correlated across log lines. Health probes are logged at debug to keep
// production logs signal-dense.
const crypto = require("crypto");
const pinoHttp = require("pino-http");
const logger = require("../logger");

const QUIET_PATHS = new Set(["/healthz", "/ready", "/health"]);

const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const id = req.headers["x-request-id"] || crypto.randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    if (QUIET_PATHS.has(req.url)) return "debug";
    return "info";
  },
  // Keep log lines compact: method/path/status/time, not full req/res dumps.
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

module.exports = { httpLogger };
