"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const kpiService = require("../../../../modules/commercial-contacts/services/commercialContactKpi.service");

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "EXPOSER LA
// LISTE DES CONTACTS À RELANCER AU COPILOT". Même triplet ADMIN_TIER_ROLES
// répété par convention ailleurs dans ce noyau (listProjectsTool.js,
// getPersonalKpiSummaryTool.js...).
const ADMIN_TIER_ROLES = new Set(["admin", "superadmin", "superadmin2"]);

// Le schéma Joi ne déclare NI `ownerId`, NI `userId`, NI `createdBy`, NI
// `commercialName` — un LLM qui les fournirait quand même se les verrait
// SILENCIEUSEMENT retirés par ValidationManager (`stripUnknown: true`,
// schéma non `.unknown(true)` ici, contrairement à list_projects) AVANT
// même que `run()` ne s'exécute : la garde ci-dessous est donc une
// confirmation explicite et documentée, pas le seul rempart.
function scopeInputForActingUser(input, actingUser) {
  if (ADMIN_TIER_ROLES.has(actingUser.role)) return input;
  const { ownerId: _ownerId, userId: _userId, createdBy: _createdBy, commercialName: _commercialName, ...rest } = input || {};
  return rest;
}

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "CORRIGER
// LES ACTIONS COMMERCIALES DEPUIS LA LISTE DES CONTACTS" — longueur bornée,
// même discipline que `status`/`limit` : jamais un filtre libre non borné.
const MAX_SEARCH_LENGTH = 200;

// Calls modules/commercial-contacts/services/commercialContactKpi.service.js
// exclusively (listCommercialContacts, ajoutée par cette mission — même
// fichier, même helpers `_where`/`_andUser` déjà utilisés par
// getMyKPI/getPersonalKPISummary, jamais un second scope réinventé).
function createGetMyCommercialContactsTool() {
  return new ServiceBackedTool({
    name: "get_my_commercial_contacts",
    description:
      "Liste les contacts commerciaux de l'utilisateur courant (tous pour un rôle admin-tier), filtrables par statut — retourne les enregistrements réels (nom, entreprise, téléphone, statut, dernier appel), pas seulement un compte.",
    inputSchema: Joi.object({
      status: Joi.string().valid("ok", "rappeler_plus_tard", "user_injoignable", "client_refuse").optional(),
      search: Joi.string().max(MAX_SEARCH_LENGTH).optional(),
      limit: Joi.number().integer().min(1).max(100).optional(),
      offset: Joi.number().integer().min(0).optional(),
    }),
    requiredRoles: ["commercial", ...ADMIN_TIER_ROLES],
    run: async (input, { actingUser }) => {
      const scopedInput = scopeInputForActingUser(input, actingUser);
      const userId = ADMIN_TIER_ROLES.has(actingUser.role) ? null : actingUser.id;
      return kpiService.listCommercialContacts(userId, scopedInput);
    },
  });
}

module.exports = { createGetMyCommercialContactsTool, scopeInputForActingUser, ADMIN_TIER_ROLES };
