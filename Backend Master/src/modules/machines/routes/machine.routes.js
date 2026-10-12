"use strict";

const router = require("express").Router();
const ctrl = require("../controllers/machine.controller");
const {
  validateCreate,
  validateUpdate,
  validateStatut,
  validateListQuery,
} = require("../validators/machine.validator");
const { authRequired } = require("../../../middleware/auth.middleware");
const { requireRole } = require("../../../middleware/requireRole");
const { ROLES, ADMIN_TIER_ROLES } = require("../../../constants/roles");

// Consultation ET gestion du référentiel (ajout, modification, type,
// activation/désactivation) : responsable_logistique_achat — l'utilisateur
// qui saisit les fiches de production (règle D) — et les administrateurs.
// Pas de DELETE : une machine référencée par l'historique des fiches est
// désactivée, jamais supprimée.
const READ_ROLES = [...ADMIN_TIER_ROLES, ROLES.RESPONSABLE_LOGISTIQUE_ACHAT];
const MANAGE_ROLES = [...ADMIN_TIER_ROLES, ROLES.RESPONSABLE_LOGISTIQUE_ACHAT];

router.use(authRequired);

// Liste : tout utilisateur connecté — elle alimente aussi la liste des
// équipements d'une demande de maintenance (Administration > Demandes >
// Maintenance, ouverte à tous). Données non sensibles (code, nom, type,
// numéro, statut). Le détail (avec le nombre de fiches) et toute écriture
// restent réservés à READ_ROLES / MANAGE_ROLES.
router.get("/", validateListQuery, ctrl.listMachines);
router.get("/:id", requireRole(...READ_ROLES), ctrl.getMachine);
router.post("/", requireRole(...MANAGE_ROLES), validateCreate, ctrl.createMachine);
router.put("/:id", requireRole(...MANAGE_ROLES), validateUpdate, ctrl.updateMachine);
// PUT (et non PATCH) : la configuration CORS de app.js n'autorise pas PATCH.
router.put("/:id/statut", requireRole(...MANAGE_ROLES), validateStatut, ctrl.setStatut);

module.exports = router;
