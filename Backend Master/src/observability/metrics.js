"use strict";

// Observabilité (audit des exigences non fonctionnelles) — expose les
// métriques Prometheus du backend : métriques Node.js par défaut (CPU,
// mémoire, event loop, GC) + compteur et histogramme des requêtes HTTP.
// Aucune logique métier ici ; le middleware ne fait que mesurer.
const client = require("prom-client");

const register = new client.Registry();
register.setDefaultLabels({ app: "crm-probar-backend" });
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Nombre total de requêtes HTTP traitées",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Durée des requêtes HTTP en secondes",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [register],
});

const dbUp = new client.Gauge({
  name: "crm_database_up",
  help: "1 si PostgreSQL répond au dernier contrôle /health, 0 sinon",
  registers: [register],
});

// Libellé de route à faible cardinalité : le motif Express ("/projects/:id")
// plutôt que l'URL réelle, pour ne pas créer une série par identifiant.
function routeLabel(req) {
  if (req.route && req.route.path) return `${req.baseUrl || ""}${req.route.path}`;
  return "unmatched";
}

function metricsMiddleware(req, res, next) {
  if (req.path === "/metrics") return next();
  const end = httpRequestDuration.startTimer();
  res.on("finish", () => {
    const labels = { method: req.method, route: routeLabel(req), status_code: res.statusCode };
    httpRequestsTotal.inc(labels);
    end(labels);
  });
  return next();
}

// /metrics n'est jamais public : jeton METRICS_TOKEN (Bearer) s'il est
// défini, sinon accès limité à la boucle locale.
function metricsAuth(req, res, next) {
  const token = process.env.METRICS_TOKEN;
  if (token) {
    if (req.headers.authorization === `Bearer ${token}`) return next();
    return res.status(401).json({ message: "Unauthorized" });
  }
  const ip = req.socket.remoteAddress || "";
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") return next();
  return res.status(403).json({ message: "Forbidden" });
}

async function metricsHandler(req, res) {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
}

function healthHandler(sequelize) {
  return async (req, res) => {
    const startedAt = process.hrtime.bigint();
    try {
      await sequelize.authenticate();
      const dbLatencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      dbUp.set(1);
      return res.json({
        status: "ok",
        database: "up",
        dbLatencyMs: Math.round(dbLatencyMs * 100) / 100,
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      dbUp.set(0);
      return res.status(503).json({
        status: "degraded",
        database: "down",
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    }
  };
}

module.exports = { register, metricsMiddleware, metricsAuth, metricsHandler, healthHandler };
