"use strict";

const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const ctrl = require("../controllers/aiDashboard.controller");
const { authRequired } = require("../../../middleware/auth.middleware");

// Every route requires an authenticated caller; domain-level restriction
// (e.g. "industrial"/"sales" require specific roles) is enforced by
// DomainAnalyzer itself (see src/ai/dashboard/*Analyzer.js) — same defense
// pattern as the AI kernel's Automations/Agents: a coarse "must be logged
// in" gate here, fine-grained per-domain/per-Tool permission downstream.
router.use(authRequired);

// `skip` en environnement de test — même convention que
// routes/auth.routes.js (les tests d'intégration enchaînent volontairement
// plus de requêtes que ce plafond depuis la même IP locale).
const isTestEnv = () => process.env.NODE_ENV === "test";

// Ce dashboard agrège 7 DomainAnalyzer (donc potentiellement plusieurs
// requêtes DB/services par appel) — la limite est par IP authentifiée,
// assez large pour un usage normal (rafraîchissement UI) mais bornée contre
// un abus (scan/poll agressif ou boucle client cassée).
const dashboardLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requêtes / IP / minute
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
});
router.use(dashboardLimiter);

// GET /ai-dashboard/insights/:category — registered BEFORE /:domain so
// "insights" is never swallowed as a domain name.
router.get("/insights/:category", ctrl.getInsightsByCategory);
router.get("/:domain", ctrl.getDomain);
router.get("/", ctrl.getSnapshot);

module.exports = router;
