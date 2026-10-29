// src/routes/health.js — liveness and readiness probes.
//
//  /healthz — liveness: the process and event loop are up. No I/O, so an
//             overloaded database never causes a restart loop.
//  /ready   — readiness: the instance can serve traffic (database probe).
//             Load balancers/orchestrators route traffic only when this is 200.
//  /health  — legacy alias kept for the original demo scripts and tests.
const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/healthz", (_req, res) => res.json({ ok: true, service: "skymed-pilot" }));

router.get("/ready", (_req, res) => {
  try {
    db.prepare("SELECT 1").get();
    res.json({ ok: true, db: "up" });
  } catch {
    res.status(503).json({ ok: false, db: "down" });
  }
});

router.get("/health", (_req, res) => res.json({ ok: true, service: "skymed-pilot" }));

module.exports = router;
