"use strict";

const { BaseAgent } = require("./baseAgent");
const { AgentError } = require("./errors");
const { analyzeDataQuality } = require("../reasoning/dataQualityAnalyzer");
const { buildDataQualityAnswer } = require("../reasoning/dataQualityAnswerBuilder");

// UN SEUL Tool, en LECTURE SEULE — jamais move_project_stage/
// assign_project_owner (des Tools d'ÉCRITURE, disponibles ailleurs dans
// mcp/tools/projects/) : cet Agent ne peut structurellement RIEN modifier,
// même s'il le "voulait" — voir "Ne jamais modifier les données
// automatiquement", DATA_QUALITY_AGENT.md.
const ALLOWED_TOOL_NAMES = ["list_projects"];

const SYSTEM_PROMPT = [
  "Tu es le Data Quality Agent du CRM CBI Tunisia.",
  "Tu détectes automatiquement les doublons, informations manquantes,",
  "emails invalides, téléphones invalides, documents manquants,",
  "incohérences, erreurs de workflow et données orphelines, exclusivement à",
  "partir des Tools fournis.",
  "Tu calcules un Score Qualité et tu PROPOSES des corrections.",
  "Tu ne modifies JAMAIS une donnée toi-même : chaque correction est une",
  "suggestion à valider par un humain, jamais une action automatique.",
].join(" ");

/**
 * # DataQualityAgent — détecter, noter, proposer, jamais modifier
 *
 * ## Rôle
 * Prend en charge la nouvelle intention `data_quality`. Comme
 * `RecommendationAgent`, applique systématiquement les 8 détections à
 * CHAQUE question qui atteint son intention (jamais une sélection par
 * mots-clés du message) : c'est un AUDIT, pas une recherche ciblée.
 *
 * ## D'où vient chaque catégorie
 * `list_projects` (Tool déjà existant, lecture seule) →
 * `reasoning/dataQualityAnalyzer.js::analyzeDataQuality()` calcule les 8
 * catégories + le Score Qualité. "Informations manquantes" réutilise
 * `completionRate`/`missingFields` (déjà calculés côté CRM). "Incohérences"
 * réutilise intégralement `dataCoherenceChecker.js` (Business Reasoning) —
 * jamais une deuxième logique. "Emails invalides"/"Téléphones invalides"
 * réutilisent EXACTEMENT les règles de validation du serveur
 * (`routes/projects.routes.js`) — jamais une règle différente. Voir
 * `DATA_QUALITY_AGENT.md` pour la justification de chaque règle et le
 * calcul du Score Qualité.
 *
 * ## "Ne jamais modifier les données automatiquement" — une garantie STRUCTURELLE
 * `ALLOWED_TOOL_NAMES` ne contient AUCUN Tool d'écriture — `list_projects`
 * uniquement. Il est donc IMPOSSIBLE que cet Agent modifie une donnée,
 * indépendamment de ce que le modèle de langage pourrait décider : aucun
 * Tool capable d'écrire ne lui est même accessible. Les "corrections"
 * proposées (`reasoning/dataQualityAnalyzer.js`, champ `correction` de
 * chaque élément détecté) sont du texte descriptif, jamais un appel de
 * Tool — voir `test/ai.agents.dataQualityAgent.test.js`, "ne modifie
 * jamais rien automatiquement".
 */
class DataQualityAgent extends BaseAgent {
  async _run() {
    return this._runAudit();
  }

  async _runAudit() {
    const tool = this._allowedTools().find((t) => t.name === "list_projects");
    if (!tool) {
      throw new AgentError(`Agent "${this.name}" has no "list_projects" Tool available to audit data quality.`);
    }

    const toolInput = { limit: 100, isArchived: false };
    const raw = await tool.invoke(toolInput);
    const { data: projects = [] } = JSON.parse(raw);

    const { categories, qualityScore, totalProjects } = analyzeDataQuality(projects);
    const answer = buildDataQualityAnswer({ qualityScore, totalProjects, categories });

    return {
      answer,
      citations: [],
      toolSteps: [
        { tool: "list_projects", input: toolInput, output: `${projects.length} projet(s) audité(s)` },
        {
          tool: "analyze_data_quality",
          // Étape de RAISONNEMENT (pas un Tool MCP réel) — voir
          // orchestrator/explainabilityBuilder.js.
          synthetic: true,
          description: `Audit de qualité sur ${totalProjects} projet(s) — 8 catégories (doublons, informations manquantes, emails/téléphones invalides, documents manquants, incohérences, erreurs de workflow, données orphelines), Score Qualité ${qualityScore}/100.`,
          input: {},
          output: { qualityScore, totalProjects, issueCounts: Object.fromEntries(Object.entries(categories).map(([key, items]) => [key, items.length])) },
        },
      ],
    };
  }
}

function createDataQualityAgent({ chatModel, tools = [], workflowEngine, qaChain = null, memory = null, maxToolCalls, maxHistoryMessages, promptInjectionGuard = null }) {
  return new DataQualityAgent({
    name: "data_quality_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["data_quality"],
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
  });
}

module.exports = { createDataQualityAgent, DataQualityAgent, ALLOWED_TOOL_NAMES, SYSTEM_PROMPT };
