"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const crmEntityDirectory = require("../../../../modules/projects/services/crmEntityDirectory.service");
const { ADMIN_TIER_ROLES } = require("./listProjectsTool");
const { withNamespace } = require("../../../utils/logger");

const logger = withNamespace("crm-lookup");

// Recherche d'UNE personne ou société précise du CRM (PROBAR ASSISTANT) et
// lecture de sa fiche complète, en LECTURE SEULE — jamais une liste complète
// (→ list_engineers, get_my_commercial_contacts).
//
// - entityType "engineer" | "contact" | "company" | "auto" : par nom (exact,
//   normalisé, mots dans un autre ordre, approché), e-mail, téléphone ou id.
// - entityType "project_promoter" : promoteur renseigné sur un projet.
//
// Périmètre décidé ICI à partir de `actingUser`, jamais par l'appelant :
// - projets : rôles admin-tier → tous ; tout autre rôle → uniquement les siens
//   (règle de list_projects) ;
// - contacts commerciaux : admin-tier → tous ; commercial_sedentaire → ceux
//   qu'il a créés (règle de get_my_commercial_contacts) ; commercial → ceux
//   qui lui sont affectés ; tout autre rôle → aucun ;
// - coordonnées d'un ingénieur : admin-tier, sinon seulement si l'ingénieur
//   suit un projet du périmètre de l'utilisateur.
function scopeFor(actingUser) {
  const admin = ADMIN_TIER_ROLES.has(actingUser.role);
  const contactMode = admin ? "all" : actingUser.role === "commercial_sedentaire" ? "createdBy" : actingUser.role === "commercial" ? "commercialId" : "none";
  return {
    ownerId: admin ? null : actingUser.id,
    contacts: { mode: contactMode, userId: admin ? null : actingUser.id },
    engineerCoordinates: admin ? "all" : "linked",
  };
}

// Noms des champs renseignés — jamais leurs valeurs (journal de diagnostic).
function filledFields(match) {
  const fields = Object.entries(match.fields || {}).filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k]) => k);
  if (match.projects) fields.push(`projects(${match.projects.total})`);
  if (match.activity) fields.push(`actions(${match.activity.actions})`, `relances(${match.activity.relances})`);
  return fields;
}

function createFindCrmEntityTool() {
  return new ServiceBackedTool({
    name: "find_crm_entity",
    description:
      "Recherche une personne ou une société précise du CRM (ingénieur, contact commercial, société) par nom, e-mail, téléphone ou identifiant, et renvoie sa fiche complète : coordonnées, société, statut, projets, actions et relances. Ou le promoteur d'un projet.",
    inputSchema: Joi.object({
      entityType: Joi.string().valid("engineer", "architect", "contact", "company", "auto", "project_promoter").required(),
      name: Joi.string().trim().min(2).max(200).when("entityType", { is: "project_promoter", then: Joi.forbidden(), otherwise: Joi.required() }),
      includeDetails: Joi.boolean().default(true),
      projectName: Joi.string().trim().min(2).max(200),
      projectId: Joi.string().uuid(),
    }).when(Joi.object({ entityType: Joi.valid("project_promoter") }).unknown(), { then: Joi.object().or("projectName", "projectId") }),
    requiredRoles: [],
    run: async (input, { actingUser }) => {
      const scope = scopeFor(actingUser);
      if (input.entityType === "project_promoter") {
        return { operation: "project_promoter", ...(await crmEntityDirectory.findProjectPromoter(input, scope)) };
      }
      logger.info(`[AI CRM SEARCH] query=${JSON.stringify(input.name.slice(0, 80))} entityType=${input.entityType} role=${actingUser.role}`);
      const result =
        input.entityType === "auto"
          ? await crmEntityDirectory.findAnyEntity(input, scope)
          : await crmEntityDirectory.findEntity(input.entityType, input, scope);
      logger.info(`[AI CRM SEARCH] matchedContact=${JSON.stringify(result.matches.map((m) => `${m.entityType}:${m.id}`))} matchType=${result.matchType}`);
      if (result.matches.length === 1 && result.matches[0].fields) {
        const [match] = result.matches;
        logger.info(`[AI CRM DETAILS] contactId=${match.id} entityType=${match.entityType}`);
        logger.info(`[AI CRM DETAILS] fieldsReturned=${JSON.stringify(filledFields(match))} restricted=${JSON.stringify(match.restricted || [])}`);
      }
      return { operation: "find", scope: scope.ownerId ? "mine" : "all", contactsSearched: scope.contacts.mode !== "none", ...result };
    },
  });
}

module.exports = { createFindCrmEntityTool, scopeFor };
