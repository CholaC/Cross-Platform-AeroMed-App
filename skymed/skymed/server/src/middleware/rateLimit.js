// src/middleware/rateLimit.js — per-IP rate limiting.
//
// Two buckets:
//  - webhookLimiter: the public Ontech USSD webhook. In production every
//    user's keystrokes arrive from the gateway's IP, so this limit must be
//    sized for aggregate peak volume (RATE_LIMIT_WEBHOOK_PER_MIN); it exists
//    to stop scripted abuse from arbitrary internet hosts, not to police the
//    gateway.
//  - apiLimiter: dashboard/REST endpoints.
// Limits are per-instance and in-memory; behind a load balancer use a shared
// store (see express-rate-limit docs) or enforce at the reverse proxy.
const { rateLimit } = require("express-rate-limit");
const config = require("../config");

const common = {
  windowMs: 60 * 1000,
  standardHeaders: "draft-7", // RateLimit response header
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
};

const webhookLimiter = rateLimit({ ...common, limit: config.rateLimitWebhookPerMin });
const apiLimiter = rateLimit({ ...common, limit: config.rateLimitApiPerMin });

module.exports = { webhookLimiter, apiLimiter };
