// server.js — SkyMed Zambia pilot entry point: bootstrap and lifecycle only.
const config = require("./src/config"); // loads .env and validates first
const logger = require("./src/logger");
const db = require("./src/db");
const app = require("./src/app");

// New outreach module seeds synthetic catalogues; legacy seed is disabled.
const deliveryTimer=setInterval(()=>require('./src/notifications').deliver(),15000);
deliveryTimer.unref();

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, "SkyMed pilot running");
  logger.info(`Dashboard      http://localhost:${config.port}/`);
  logger.info(`USSD simulator http://localhost:${config.port}/simulator.html`);
  logger.info(`Ontech webhook POST http://localhost:${config.port}/api/ussd/ontech`);
});

// Graceful shutdown: stop accepting connections, finish in-flight requests,
// close the database, then exit. A hard deadline guards against hangs.
function shutdown(signal) {
  logger.info({ signal }, "shutting down");
  server.close(() => {
    db.close();
    logger.info("shutdown complete");
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("shutdown deadline exceeded — forcing exit");
    process.exit(1);
  }, 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
