"use strict";

const { DomainAnalyzer } = require("./domainAnalyzer");

// Défauts "meilleur effort" — voir automations/reminderAutomation.js pour le
// même avertissement : la forme exacte des champs renvoyés par list_projects
// (ownerId, stage, name) n'a pas été revérifiée service par service ; ces
// règles sont un point de départ documenté, à ajuster via `rules` au
// câblage réel plutôt que dans ce fichier. Mots-clés reconnus comme "étape
// finale" pour l'heuristique de prévision — configurable, pas exhaustif.
const DEFAULT_FINAL_STAGE_KEYWORDS = ["cloture", "clôture", "termine", "terminé", "gagne", "gagné", "livre", "livré"];

const DEFAULT_DATA_SOURCES = [{ key: "projects", listToolName: "list_projects" }];

function isFinalStage(stage, keywords) {
  if (!stage) return false;
  const normalized = String(stage).toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function buildDefaultRules({ finalStageKeywords = DEFAULT_FINAL_STAGE_KEYWORDS } = {}) {
  return {
    risks: [
      ({ data }) =>
        data.projects
          .filter((project) => !project.ownerId && !project.owner)
          .map((project) => ({ type: "unowned_project", projectId: project.id, message: `Le projet "${project.name || project.id}" n'a aucun propriétaire assigné.` })),
    ],
    dataQuality: [
      ({ data }) =>
        data.projects
          .filter((project) => !project.name || !(project.stage || project.currentStage))
          .map((project) => ({ type: "missing_field", projectId: project.id, message: `Le projet "${project.id}" a un nom ou une étape manquant(e).` })),
    ],
    recommendations: [
      ({ data }) => {
        const unowned = data.projects.filter((project) => !project.ownerId && !project.owner);
        return unowned.length > 0
          ? { type: "assign_owners", message: `${unowned.length} projet(s) sans propriétaire — envisager une assignation.` }
          : null;
      },
    ],
    forecasts: [
      // Heuristique basée sur l'instantané actuel (pas une série temporelle
      // réelle) : proportion de projets déjà en étape finale, comme
      // estimation grossière d'un "taux de complétion".
      ({ data }) => {
        if (data.projects.length === 0) return null;
        const finalCount = data.projects.filter((project) => isFinalStage(project.stage || project.currentStage, finalStageKeywords)).length;
        return {
          type: "completion_rate_estimate",
          metric: "completion_rate",
          value: Math.round((finalCount / data.projects.length) * 100) / 100,
          basis: "instantané actuel (pas une série temporelle)",
        };
      },
    ],
  };
}

function createProjectsAnalyzer({ tools = [], dataSources = DEFAULT_DATA_SOURCES, rules, finalStageKeywords, requiredRoles = [], allowedEmails = [] } = {}) {
  return new DomainAnalyzer({
    domain: "projects",
    tools,
    dataSources,
    rules: rules || buildDefaultRules({ finalStageKeywords }),
    requiredRoles,
    allowedEmails,
  });
}

module.exports = { createProjectsAnalyzer, buildDefaultRules, DEFAULT_DATA_SOURCES, DEFAULT_FINAL_STAGE_KEYWORDS };
