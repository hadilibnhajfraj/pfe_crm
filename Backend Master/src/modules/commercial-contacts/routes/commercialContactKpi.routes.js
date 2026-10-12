"use strict";

const router = require("express").Router();
const ctrl = require("../controllers/commercialContactKpi.controller");
const { authRequired } = require("../../../middleware/auth.middleware");
const { requireRole }  = require("../../../middleware/requireRole");
const { ROLES, ADMIN_TIER_ROLES } = require("../../../constants/roles");

// KPI des contacts commerciaux — calculés sur createdBy (contacts saisis) :
// réservés aux administrateurs (vue globale) et au commercial_sedentaire
// (vue personnelle). Vocabulaire v2 : l'ancien rôle "commercial" de ces
// routes est devenu "commercial_sedentaire" ; le commercial terrain (ancien
// "user") reste exclu, comme avant.
const KPI_ROLES = [...ADMIN_TIER_ROLES, ROLES.COMMERCIAL_SEDENTAIRE];

// ── GET /commercial-contacts/kpi ─────────────────────────────────────────────
// admin / superadmin      → KPI globaux (tous contacts, tous commerciaux)
// commercial_sedentaire   → KPI personnels (filtré WHERE createdBy = userId)
router.get("/kpi", authRequired, requireRole(...KPI_ROLES), ctrl.getKPI);

// ── GET /commercial-contacts/my-kpi ──────────────────────────────────────────
// commercial_sedentaire / admin / superadmin → accès autorisé (données du user connecté)
// commercial / accueil / autres              → 403 Access denied
router.get("/my-kpi", authRequired, requireRole(...KPI_ROLES), ctrl.getMyKpiEndpoint);

// ── GET /commercial-contacts/analytics ───────────────────────────────────────
// admin / superadmin → global ; commercial_sedentaire → filtré
router.get("/analytics", authRequired, requireRole(...KPI_ROLES), ctrl.getAnalytics);

// ── GET /commercial-contacts/kpi/me — legacy ─────────────────────────────────
router.get("/kpi/me", authRequired, requireRole(...KPI_ROLES), ctrl.getKPIMe);

module.exports = router;
