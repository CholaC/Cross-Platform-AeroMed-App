// src/app.js — Express application wiring, exported without listening so
// tests can drive it in-process and server.js owns the lifecycle.
const express = require("express");
const helmet = require("helmet");
const path = require("path");
const config = require("./config");
const { apiLimiter, webhookLimiter } = require("./middleware/rateLimit");
const healthRoutes = require("./routes/health");
const logger = require("./logger");
const { httpLogger } = require("./middleware/requestLog");

const app = express();
app.disable("x-powered-by");
if (config.trustProxy) app.set("trust proxy", 1);

// Security headers. The dashboard and simulator are self-contained static
// pages using inline <script>/<style> and onclick handlers (no build step),
// so CSP permits 'unsafe-inline' for this origin only — a documented pilot
// trade-off; everything else keeps helmet's strict defaults.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "script-src": ["'self'", "'unsafe-inline'"],
      "script-src-attr": ["'unsafe-inline'"],
    },
  },
}));

app.use(httpLogger); // structured request logs with request-id correlation
app.use((req,res,next)=>{
 const origin=req.get('origin');const allowed=(process.env.CORS_ORIGINS||'http://localhost:8080').split(',');
 if(origin&&allowed.includes(origin)){res.set('Access-Control-Allow-Origin',origin);res.set('Vary','Origin');res.set('Access-Control-Allow-Headers','Content-Type, Authorization');res.set('Access-Control-Allow-Methods','GET, POST, PUT, OPTIONS');}
 if(req.method==='OPTIONS')return res.sendStatus(204);next();
});
app.use(express.json({ limit: "16kb" })); // USSD + dispatch payloads are tiny
app.use(express.static(path.join(__dirname, "..", "public")));

// The webhook carries its own (aggregate-sized) limiter inside ussdRoutes;
// everything else on /api shares the per-IP API bucket. The skip avoids
// double-counting webhook traffic against both limiters.
app.use("/api", (req, res, next) =>
  req.path === "/ussd/ontech" ? next() : apiLimiter(req, res, next));

app.use('/api/v1', require('./outreach').router);
app.post('/api/ussd/ontech', webhookLimiter, (req,res)=>{
 if(config.isProd && (!process.env.USSD_GATEWAY_SECRET || req.get('x-gateway-secret')!==process.env.USSD_GATEWAY_SECRET)) return res.status(401).json({error:'Gateway authentication required'});
 const b=req.body||{};
 const out=require('./ussd/outreach').handle(String(b.SESSION_ID||''),String(b.MSISDN||''),String(b.REQUEST_TYPE)==='1'?'':b.MESSAGE,String(b.STEP_ID||''));
 res.json({ussd_response:{USSD_BODY:out.text,REQUEST_TYPE:out.end?'3':'2'}});
});


app.use("/", healthRoutes); // /healthz (liveness), /ready (DB probe), /health (legacy alias)

// JSON 404 for unknown API paths (static handler already served real files).
app.use("/api", (_req, res) => res.status(404).json({ error: "not found" }));

// Central error handler: log the details, return a generic JSON error.
app.use((err, req, res, _next) => {
  logger.error({ err, method: req.method, path: req.path }, "unhandled error");
  res.status(500).json({ error: "Unable to process request. Contact clinic staff" });
});

module.exports = app;
