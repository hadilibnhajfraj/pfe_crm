"use strict";

const router = require("express").Router();
const ctrl = require("../controllers/production.controller");
const { authRequired } = require("../../../middleware/auth.middleware");
const { requireRole } = require("../../../middleware/requireRole");

// Mêmes rôles que les modules sources (por-promesh, industrial-records) —
// responsable_logistique_achat reste limité à ses propres fiches (périmètre
// appliqué dans le service). Module en lecture seule : aucune route d'écriture.
const READ_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];

router.use(authRequired);
router.use(requireRole(...READ_ROLES));

// Vue consolidée en une seule requête : KPI PROMESH / PROBAR, machines,
// séries des graphiques et dernières productions.
router.get("/dashboard", ctrl.getDashboard);
router.get("/fiches", ctrl.listFiches);
router.get("/fiches/:line/:id", ctrl.getFiche);
router.get("/export", ctrl.exportProduction);

module.exports = router;
