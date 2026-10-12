"use strict";

// Module Rapports — exports PDF / Excel communs du CRM.
// Monté sur /reports et sur /production/reports (seul préfixe ouvert au rôle
// responsable_logistique_achat par moduleAccessGuard).
// Les exports existants (/production/export, /projects/export, exports
// générés dans le navigateur) restent en place.

const rateLimit = require("express-rate-limit");
const router = require("express").Router();
const ctrl = require("../controllers/report.controller");
const { authRequired } = require("../../../middleware/auth.middleware");

// Un export lit beaucoup de lignes : 20 rapports par utilisateur et par quart d'heure.
const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  // authRequired est passé avant : la limite est comptée par utilisateur, pas par adresse.
  keyGenerator: (req) => (req.user && req.user.sub) || "anonymous",
  message: { success: false, message: "Trop d'exports demandés : réessayez dans quelques minutes." },
});

router.use(authRequired);

router.get("/", ctrl.listReports);
router.get("/:type", exportLimiter, ctrl.exportReport);

module.exports = router;
