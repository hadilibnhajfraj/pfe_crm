"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const { WebSearchService } = require("../../../web/webSearchService");
const { WebSearchNotConfiguredError } = require("../../../web/webSearchProviders");

// Recherche Web contrôlée (PROBAR ASSISTANT) : informations PUBLIQUES sur une
// société, une personne dans son rôle professionnel ou un promoteur.
//
// - L'entrée est une CIBLE (un nom) et un type d'entité, jamais une requête
//   libre : la requête envoyée au moteur est construite et nettoyée par
//   WebSearchService (aucun e-mail, téléphone, jeton ni donnée CRM privée).
// - Aucune donnée du CRM n'est lue ici : ce Tool ne peut donc rien révéler
//   qu'un utilisateur n'aurait pas le droit de consulter (le RBAC du CRM reste
//   porté par les Tools CRM).
// - Sans fournisseur configuré (AI_WEB_SEARCH_PROVIDER), répond
//   { configured: false } — jamais un résultat inventé.
function createWebSearchTool({ service = null } = {}) {
  let cached = service;
  const getService = () => (cached = cached || new WebSearchService());
  return new ServiceBackedTool({
    name: "web_search",
    description:
      "Recherche Web d'informations publiques sur une société, un professionnel ou un promoteur ; renvoie 3 à 5 sources vérifiables (titre, URL, extrait).",
    inputSchema: Joi.object({
      target: Joi.string().trim().min(2).max(120).required(),
      entity: Joi.string().valid("company", "engineer", "person", "promoter", "topic").default("company"),
      language: Joi.string().valid("fr", "en", "ru").default("fr"),
      // Contexte PUBLIC qui précise la recherche d'une personne et permet de
      // vérifier qu'un résultat parle bien d'elle : sa société, son pays.
      company: Joi.string().trim().max(120).allow("", null).optional(),
      country: Joi.string().trim().max(60).allow("").optional(),
      limit: Joi.number().integer().min(1).max(5).default(5),
    }),
    requiredRoles: [],
    run: async (input) => {
      const web = getService();
      if (!web.isConfigured()) return { configured: false, query: null, queries: [], provider: null, identity: null, confidence: null, results: [] };
      try {
        return { configured: true, ...(await web.search(input)) };
      } catch (err) {
        if (err instanceof WebSearchNotConfiguredError) return { configured: false, query: null, queries: [], provider: null, identity: null, confidence: null, results: [] };
        // Échec du fournisseur : la cause (jamais le message brut ni la clé)
        // accompagne un résultat vide, pour que la réponse dise ce qui se passe.
        if (err && err.code === "WEB_SEARCH_PROVIDER_ERROR") {
          return { configured: true, failed: true, reason: err.reason || "unavailable", query: null, queries: [], provider: web.provider.name, identity: null, confidence: null, results: [] };
        }
        throw err;
      }
    },
  });
}

const toolFactories = [createWebSearchTool];

module.exports = { toolFactories, createWebSearchTool };
