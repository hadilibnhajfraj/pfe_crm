"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const projectService = require("../../../../modules/projects/services/project.service");

// listProjects() ne fait elle-même aucune vérification de portée stricte
// (voir modules/projects/services/project.service.js) : `ownerId`/`mine`
// sont de simples filtres, pas un contrôle d'accès — un choix DÉLIBÉRÉ et
// toujours correct pour la route REST classique (project.routes.js), où
// c'est un humain qui choisit "mes projets" vs "tous les projets" via un
// contrôle d'écran explicite. Schéma volontairement permissif
// (`unknown(true)`) pour cette même raison — la liste exhaustive des
// filtres/tri vit dans le validator Joi de la route, non ré-exporté sous
// forme réutilisable.
//
// AI-Business-Copilot/25_LIST_PROJECTS_RBAC_ENFORCEMENT.md — ce choix se
// retourne contre le Copilot : un LLM n'est PAS un humain qui clique un
// contrôle d'écran explicite, c'est un texte libre interprété. Reproduit en
// direct : pour "donne-moi les projets associés à Hadil" (elle-même
// l'utilisatrice authentifiée), qwen3:8b a produit
// `{"filter_owner":"Hadil"}` — un nom de champ inexistant, silencieusement
// ignoré par le schéma permissif ci-dessus, retombant sur `mine=false`
// (aucun filtre) — 5 des 20 projets renvoyés appartenaient à d'autres
// utilisateurs. Le VRAI risque est plus large qu'un simple champ ignoré :
// `ownerId`/`userId` sont des champs RÉELLEMENT lus par
// project.service.js (`ownerId = query.ownerId || query.userId || null`)
// — si le LLM les avait renseignés avec un VRAI uuid (deviné, halluciné,
// ou lu dans un tour de conversation précédent), la requête aurait
// silencieusement ciblé les projets d'un AUTRE utilisateur. Le texte du
// LLM n'est donc jamais la source de vérité sur le périmètre — voir
// scopeInputForActingUser() ci-dessous, seul point qui décide.
//
// Rôles "admin-tier" — déjà établis ailleurs dans ce noyau comme les seuls
// rôles disposant d'une visibilité transverse (ex. SuggestionEngine,
// "notify_team" réservé à ce même trio) : eux seuls gardent le filtre tel
// que le LLM/l'appelant l'a choisi. Tout autre rôle authentifié (`user`,
// `commercial`, `accueil`, `responsable_logistique_achat`) est TOUJOURS
// scopé à `actingUser.id`, quel que soit ce que le Tool a reçu en entrée —
// `mine`/`ownerId`/`userId` fournis par le LLM sont purement et simplement
// ignorés (jamais fusionnés, jamais "complétés"), pour qu'aucune
// combinaison de champs, connus ou inventés, ne puisse élargir le
// périmètre. Réutilise le MÊME mécanisme déjà correct
// (`mine:true` + `actingUser.id`, voir project.repository.js :
// `if (filters.mine && filters.userId) { where.ownerId = filters.userId }`)
// — aucun nouveau système RBAC, seulement l'endroit où l'imposer change.
const ADMIN_TIER_ROLES = new Set(["admin", "superadmin", "superadmin2"]);

function scopeInputForActingUser(input, actingUser) {
  if (ADMIN_TIER_ROLES.has(actingUser.role)) return input;
  // Destructure OUT every scope-affecting field the LLM could have
  // supplied (under its real name OR any alias `listProjects()` itself
  // recognizes — `mine`/`myProjects`/`ownerId`/`userId`) — never merged
  // back, never inspected for "does it happen to already say the right
  // thing": the caller's own text is not trusted here, only its role.
  const { mine: _mine, myProjects: _myProjects, ownerId: _ownerId, userId: _userId, ...rest } = input || {};
  return { ...rest, mine: true };
}

function createListProjectsTool() {
  return new ServiceBackedTool({
    name: "list_projects",
    description: "Liste les projets (pipeline/kanban) avec statistiques globales — filtrage/tri best-effort.",
    inputSchema: Joi.object({
      mine: Joi.boolean().optional(),
      ownerId: Joi.string().guid({ version: "uuidv4" }).optional(),
      // Colonne réelle `Project.statut` (STRING, valeurs métier françaises —
      // ex. "Négociation", "Identification" — voir project.repository.js::
      // buildBaseWhere). Non déclaré auparavant : `.unknown(true)` laissait
      // passer une valeur envoyée par le LLM sans jamais l'utiliser (le
      // repository ne filtrait pas dessus) — déclaré ici explicitement pour
      // que le contrat du Tool reflète ce qu'il fait réellement.
      statut: Joi.string().max(100).optional(),
      search: Joi.string().max(255).optional(),
      projectModele: Joi.string().valid("project", "revendeur", "applicateur").optional(),
      sortBy: Joi.string().valid("createdAt", "nomProjet", "montantMarche", "pourcentageReussite", "updatedAt").optional(),
      page: Joi.number().integer().min(1).optional(),
      pageSize: Joi.number().integer().min(1).max(500).optional(),
    }).unknown(true),
    requiredRoles: [],
    run: async (input, { actingUser }) => projectService.listProjects(scopeInputForActingUser(input, actingUser), actingUser.id),
  });
}

module.exports = { createListProjectsTool, scopeInputForActingUser, ADMIN_TIER_ROLES };
