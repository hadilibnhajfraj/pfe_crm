"use strict";

const { BaseAgent } = require("./baseAgent");
const { AgentError } = require("./errors");
const { analyzeProjectAttention } = require("../reasoning/projectAttentionAnalyzer");
const { checkProjectsCoherence } = require("../reasoning/dataCoherenceChecker");
const {
  identifyPriorities,
  identifyImportantTasks,
  identifyClientsToFollowUp,
  identifyCriticalProjects,
  identifyRisks,
  identifyAnomalies,
} = require("../reasoning/recommendationEngine");
const { buildRecommendationAnswer } = require("../reasoning/recommendationAnswerBuilder");

// Deux Tools RÉELS et déjà existants — jamais un nouveau Tool créé pour
// cette passe. `get_maintenance_stats` est traité en best-effort (absent ou
// refusé pour ce rôle n'empêche pas les 6 autres catégories).
const ALLOWED_TOOL_NAMES = ["list_projects", "get_maintenance_stats"];

const SYSTEM_PROMPT = [
  "Tu es le Recommendation Agent du CRM CBI Tunisia : le Copilot devient un",
  "conseiller proactif.",
  "Tu proposes des priorités, des tâches importantes, des clients à",
  "relancer, des projets critiques, des risques et des anomalies, puis des",
  "actions recommandées — exclusivement à partir des Tools fournis, jamais",
  "en inventant une donnée.",
  "CHAQUE recommandation doit être justifiée par une raison concrète et",
  "vérifiable, jamais une affirmation sans preuve.",
].join(" ");

/**
 * # RecommendationAgent — le Copilot devient un conseiller
 *
 * ## Rôle
 * Prend en charge la nouvelle intention `recommendation`. Contrairement à
 * `BusinessAnalystAgent` (qui EXPLIQUE un domaine choisi par l'utilisateur —
 * "analyse les projets"), cet Agent CONSEILLE sans qu'un domaine précis
 * soit nommé ("conseille-moi", "priorise mes tâches") : à CHAQUE question
 * qui l'atteint, il produit systématiquement les 7 catégories demandées —
 * jamais une sélection partielle selon des mots-clés du message (voir
 * `RECOMMENDATION_AGENT.md`, "Recommendation Agent vs Business Analyst
 * Agent").
 *
 * ## D'où vient chaque catégorie — jamais une deuxième logique de scoring
 * `list_projects` → `ProjectAttentionAnalyzer.analyzeProjectAttention()`
 * (Business Reasoning, déjà construit) calcule, pour chaque projet, un
 * score et des `factors` justifiés. `reasoning/recommendationEngine.js`
 * ne fait QUE reclasser ces mêmes `factors` par catégorie (voir sa propre
 * doc) — jamais un second calcul. "Anomalies" vient de
 * `dataCoherenceChecker.js` (même famille). "Actions recommandées" vient de
 * `SuggestionEngine` (Smart Suggestions, optionnel, injecté comme pour
 * `ProjectAgent` — permission-filtré, jamais rien d'exécutable).
 * "Risques" ajoute, en best-effort, un signal agrégé de
 * `get_maintenance_stats` (déjà existant) — son indisponibilité pour ce
 * rôle n'invalide jamais les 6 autres catégories.
 *
 * ## Garantie "toute recommandation est justifiée"
 * Chaque élément affiché porte la raison EXACTE déjà calculée par
 * `ProjectAttentionAnalyzer`/`dataCoherenceChecker` — jamais une phrase
 * générique. Une catégorie sans rien à signaler n'apparaît simplement pas
 * dans la réponse (voir `recommendationAnswerBuilder.js`).
 */
class RecommendationAgent extends BaseAgent {
  constructor({ suggestionEngine = null, ...rest }) {
    super(rest);
    this.suggestionEngine = suggestionEngine;
  }

  async _run({ user }) {
    return this._runRecommendations(user);
  }

  async _runRecommendations(user) {
    const tools = this._allowedTools();
    const listProjectsTool = tools.find((t) => t.name === "list_projects");
    if (!listProjectsTool) {
      throw new AgentError(`Agent "${this.name}" has no "list_projects" Tool available to build recommendations.`);
    }

    const projectsInput = { limit: 100, isArchived: false };
    const rawProjects = await listProjectsTool.invoke(projectsInput);
    const { data: projects = [] } = JSON.parse(rawProjects);

    const toolSteps = [{ tool: "list_projects", input: projectsInput, output: `${projects.length} projet(s) analysé(s)` }];
    const maintenanceStats = await this._fetchMaintenanceStats(tools, toolSteps);

    const ranked = analyzeProjectAttention(projects);
    const dataQuality = checkProjectsCoherence(projects);

    const flaggedFactors = ranked.filter((r) => r.priority !== "faible").flatMap((r) => r.factors);
    const recommendedActions = this.suggestionEngine ? this.suggestionEngine.suggestForFactors(flaggedFactors, user) : [];

    const priorities = identifyPriorities(ranked);
    const importantTasks = identifyImportantTasks(ranked);
    const clientsToFollowUp = identifyClientsToFollowUp(ranked);
    const criticalProjects = identifyCriticalProjects(ranked);
    const risks = identifyRisks(ranked, { maintenanceStats });
    const anomalies = identifyAnomalies(dataQuality);

    const answer = buildRecommendationAnswer({ priorities, importantTasks, clientsToFollowUp, criticalProjects, risks, anomalies, recommendedActions });

    // Étape de RAISONNEMENT (pas un Tool MCP réel) — voir
    // orchestrator/explainabilityBuilder.js.
    toolSteps.push({
      tool: "generate_recommendations",
      synthetic: true,
      description:
        `Conseil proactif sur ${ranked.length} projet(s) : ${priorities.length} priorité(s), ${importantTasks.length} tâche(s) importante(s), ` +
        `${clientsToFollowUp.length} client(s) à relancer, ${criticalProjects.length} projet(s) critique(s), ${risks.length} risque(s), ` +
        `${anomalies.length} anomalie(s), ${recommendedActions.length} action(s) recommandée(s).`,
      input: {},
      output: {
        priorities: priorities.length,
        importantTasks: importantTasks.length,
        clientsToFollowUp: clientsToFollowUp.length,
        criticalProjects: criticalProjects.length,
        risks: risks.length,
        anomalies: anomalies.length,
        recommendedActions: recommendedActions.length,
      },
    });

    return { answer, citations: [], suggestions: recommendedActions, dataQuality, toolSteps };
  }

  // Best-effort : un rôle qui n'a pas accès aux statistiques de maintenance
  // (voir mcp/tools/maintenance/) obtient quand même les 6 autres
  // catégories — seul le signal de risque "maintenance" est simplement
  // absent, jamais une raison d'échec pour tout le tour.
  async _fetchMaintenanceStats(tools, toolSteps) {
    const tool = tools.find((t) => t.name === "get_maintenance_stats");
    if (!tool) return null;
    try {
      const raw = await tool.invoke({});
      const stats = JSON.parse(raw);
      toolSteps.push({ tool: "get_maintenance_stats", input: {}, output: stats });
      return stats;
    } catch (err) {
      toolSteps.push({ tool: "get_maintenance_stats", input: {}, output: `Error: ${err.message}` });
      return null;
    }
  }
}

function createRecommendationAgent({
  chatModel,
  tools = [],
  workflowEngine,
  qaChain = null,
  memory = null,
  maxToolCalls,
  maxHistoryMessages,
  promptInjectionGuard = null,
  suggestionEngine = null,
}) {
  return new RecommendationAgent({
    name: "recommendation_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["recommendation"],
    requiredRoles: [],
    allowedEmails: [],
    chatModel,
    tools,
    allowedToolNames: ALLOWED_TOOL_NAMES,
    workflowEngine,
    qaChain,
    memory,
    maxToolCalls,
    maxHistoryMessages,
    promptInjectionGuard,
    suggestionEngine,
  });
}

module.exports = { createRecommendationAgent, RecommendationAgent, ALLOWED_TOOL_NAMES, SYSTEM_PROMPT };
