"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const kpiService = require("../../../../modules/commercial-contacts/services/commercialContactKpi.service");

// AI-Business-Copilot/34_PERSONAL_KPI_SUMMARY_RBAC.md — risque RBAC confirmé
// par audit (matrice de capacités) : `commercialName`, fourni par le LLM,
// remplaçait ENTIÈREMENT le filtre `createdBy = actingUser.id` côté service
// (`getPersonalKPISummary()` bascule sur un WHERE `user_nom`/`user_nom_custom`
// dès que `commercialName` est non-null, sans jamais revérifier `userId`) —
// un rôle `commercial` (non admin-tier, mais déjà autorisé à appeler CE
// Tool, voir `requiredRoles` ci-dessous) pouvait donc obtenir les KPI
// personnels d'un AUTRE commercial en le nommant, halluciné ou deviné par le
// LLM. Corrigé avec EXACTEMENT le même mécanisme déjà en place pour
// `list_projects` (`listProjectsTool.js::scopeInputForActingUser`, jamais
// dupliqué en logique différente) : pour tout rôle NON admin-tier, le champ
// scope-affectant fourni par le LLM est retiré AVANT d'atteindre le service,
// jamais fusionné, jamais "complété" — seul `actingUser.id` fait foi.
// Rôles admin-tier : conservent leur capacité transverse déjà établie
// ailleurs dans ce même module (`get_commercial_contact_kpi`/
// `get_commercial_contact_analytics` passent déjà `userId: null` pour ces
// rôles, une visibilité globale sur TOUS les commerciaux) — leur laisser
// nommer UN commercial précis via ce Tool est un sous-ensemble plus étroit
// de cette même visibilité déjà autorisée, jamais une extension.
const ADMIN_TIER_ROLES = new Set(["admin", "superadmin", "superadmin2"]);

function scopeInputForActingUser(input, actingUser) {
  if (ADMIN_TIER_ROLES.has(actingUser.role)) return input;
  // Retire `commercialName` pour tout rôle non admin-tier — jamais inspecté
  // pour "est-ce déjà le bon nom", jamais réutilisé : seul le rôle décide,
  // jamais le texte fourni par l'appelant (LLM ou autre).
  const { commercialName: _commercialName, ...rest } = input || {};
  return rest;
}

function createGetPersonalKpiSummaryTool() {
  return new ServiceBackedTool({
    name: "get_commercial_personal_kpi_summary",
    description: "Résumé KPI personnel enrichi (taux de validation, distributions) pour l'utilisateur courant ou un commercial nommé.",
    inputSchema: Joi.object({ commercialName: Joi.string().max(120).optional() }),
    requiredRoles: ["commercial_sedentaire", "admin", "superadmin", "superadmin2"],
    run: async (input, { actingUser }) => {
      const scopedInput = scopeInputForActingUser(input, actingUser);
      return kpiService.getPersonalKPISummary(actingUser.id, scopedInput.commercialName || null);
    },
  });
}

module.exports = { createGetPersonalKpiSummaryTool, scopeInputForActingUser, ADMIN_TIER_ROLES };
