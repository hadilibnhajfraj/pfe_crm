"use strict";

const { createAssistantAgent } = require("./assistantAgent");
const { createCrmAssistantAgent } = require("./crmAssistantAgent");
const { createProjectAgent } = require("./projectAgent");
const { createCommercialAgent } = require("./commercialAgent");
const { createPipelineAgent } = require("./pipelineAgent");
const { createKpiAgent } = require("./kpiAgent");
const { createReportingAgent } = require("./reportingAgent");
const { createMaintenanceAgent } = require("./maintenanceAgent");
const { createIndustrialAgent } = require("./industrialAgent");
const { createNotificationAgent } = require("./notificationAgent");
const { createAutomationAgent } = require("./automationAgent");
const { createBusinessAnalystAgent } = require("./businessAnalystAgent");
const { createRecommendationAgent } = require("./recommendationAgent");
const { createDataQualityAgent } = require("./dataQualityAgent");
const { createAdvancedSearchAgent } = require("./advancedSearchAgent");
const { createMeetingAgent } = require("./meetingAgent");
const { createRoleCapabilityAuditAgent } = require("./roleCapabilityAuditAgent");
const { createHrAgent } = require("./hrAgent");
const { createPorPromeshAgent } = require("./porPromeshAgent");
// Phase 2 — assistant documentaire (documents joints au Copilot).
const { createDocumentAgent } = require("./documentAgent");
const { createTaskPlannerAgent } = require("./taskPlannerAgent");
const { createAnalyticsAgent } = require("./analyticsAgent");
const { createEntityLookupAgent } = require("./entityLookupAgent");

// Manifeste explicite des Agents spécialisés — même discipline que
// mcp/tools/index.js::defaultToolFactories : une liste réviewable, pas une
// découverte automatique de fichiers. Chaque factory reçoit le même objet
// `deps` (les collaborateurs déjà construits par
// orchestrator/pipeline.js::createAiOrchestrator — chatModel, tools,
// workflowEngine, qaChain, summarizationChain, planner, memory) et ne
// consomme que ce dont elle a besoin.
//
// `createCrmAssistantAgent` (crmAssistantAgent.js) a remplacé
// `createSearchAgent` (searchAgent.js, toujours présent mais plus câblé par
// défaut) comme gestionnaire de l'intention `documentation_question` — le
// premier Agent MÉTIER du Copilot ("CRM Assistant"), avec une vraie base de
// connaissances (`docs/user-guide/`, voir CRM_ASSISTANT.md) plutôt qu'un
// prompt de recherche documentaire générique. Même Tools (aucun), même
// intention, même mécanisme RAG — seul le contenu indexé et le prompt
// système changent.
//
// `createBusinessAnalystAgent` (businessAnalystAgent.js) est le 12e Agent —
// gère la nouvelle intention `business_analysis` (voir intentCatalog.js) :
// analyse déterministe à 4 volets (résultat/causes/risques/recommandations)
// sur 8 domaines métier, exclusivement via des Tools MCP déjà existants
// (jamais un nouveau Tool créé pour cette passe) — voir BUSINESS_ANALYST.md.
//
// `createRecommendationAgent` (recommendationAgent.js) est le 13e Agent —
// gère la nouvelle intention `recommendation` : conseil proactif (priorités,
// tâches importantes, clients à relancer, projets critiques, risques,
// anomalies, actions recommandées), en réutilisant ProjectAttentionAnalyzer/
// dataCoherenceChecker/SuggestionEngine — jamais une deuxième logique de
// scoring — voir RECOMMENDATION_AGENT.md. Reçoit `suggestionEngine` du même
// `deps` que `ProjectAgent` (voir orchestrator/pipeline.js, Smart Suggestions).
//
// `createDataQualityAgent` (dataQualityAgent.js) est le 14e Agent — gère la
// nouvelle intention `data_quality` : audit de fiabilité des données
// (doublons, informations manquantes, emails/téléphones invalides,
// documents manquants, incohérences, erreurs de workflow, données
// orphelines), un Score Qualité, et des corrections PROPOSÉES jamais
// appliquées — `allowedToolNames` ne contient QUE `list_projects` (lecture
// seule), aucun Tool d'écriture n'est même accessible à cet Agent — voir
// DATA_QUALITY_AGENT.md.
//
// `createAdvancedSearchAgent` (advancedSearchAgent.js) est le 15e Agent —
// gère la nouvelle intention `advanced_search` : recherches complexes
// multi-critères (période, seuil de montant, absence de correspondance) en
// combinant `list_projects` (Projects) et `get_commercial_contact_kpi`
// (Commercial-Contacts) — 2 Tools, 2 modules. Distinct de `searchAgent.js`
// (RAG générique, toujours présent mais non câblé, voir ci-dessus) : celui-ci
// n'est pas un concierge documentaire, c'est un moteur de recherche sur les
// DONNÉES réelles du CRM — voir ADVANCED_SEARCH_AGENT.md, y compris les
// limites honnêtes (aucun montant de devis n'existe dans ce CRM ; "clients
// n'ayant jamais acheté" reste explicitement non supporté).
//
// `createMeetingAgent` (meetingAgent.js) est le 16e Agent — gère la
// nouvelle intention `meetings` (AI-Business-Copilot/11_MEETING_AGENT_FIX.md) :
// "Programmer une réunion"/"Créer un rendez-vous" retombaient auparavant sur
// `general_chat` (aucun mot-clé du catalogue), puis se faisaient absorber à
// tort par le contexte d'écran (ex. Dashboard → réponse KPI). Réutilise les
// 4 Tools googleCalendar déjà construits pour AutomationAgent (aucun
// nouveau Tool) — ne collecte QUE les champs réellement exigés par
// `create_calendar_event` (sujet, début, fin), jamais des "participants"
// (champ absent du Tool réel).
//
// `createRoleCapabilityAuditAgent` (roleCapabilityAuditAgent.js) est le 17e
// Agent — gère la nouvelle intention `capability_audit`
// (AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md) : "Qu'est-ce que
// je peux faire avec mon compte ?"/"Pourquoi cette action est-elle
// refusée ?". STRICTEMENT READ-ONLY (`allowedToolNames: []`, aucun Tool
// accessible) — interroge `reasoning/capabilityMatrixService.js`, qui
// réutilise `AgentRegistry.findHandler()`/`isAuthorized()` tels quels,
// jamais une seconde implémentation RBAC. Reçoit 4 dépendances
// supplémentaires que les 16 autres Agents ne consomment pas
// (`agentRegistry`, `intentCatalog`, `toolPermissionIndex`,
// `toolModuleIndex`, `moduleAccessByRole`) — voir orchestrator/pipeline.js.
//
// `createHrAgent` (hrAgent.js) et `createPorPromeshAgent` (porPromeshAgent.js)
// sont les 18e et 19e Agents — mission "IMPLÉMENTER HRAgent ET
// PorPromeshAgent" (P1 du rapport d'audit "AUDIT ET CONCEPTION DES AGENTS
// PAR RÔLE") : les intentions `hr`/`por_promesh` existaient déjà dans
// intentCatalog.js (aucun changement de catalogue nécessaire) mais
// n'avaient aucun Agent dédié — traitées jusqu'ici par le chemin générique
// (`WorkflowManager`/`ToolRouter`). Chacun réutilise EXCLUSIVEMENT les
// Tools MCP déjà existants de son module (9 pour HR, 10 pour POR PROMESH),
// même discipline exacte que MaintenanceAgent (`requiredRoles: []`, accès
// mixte déjà géré Tool par Tool) et IndustrialAgent (`requiredRoles:
// READ_WRITE_ROLES`, accès uniforme déjà géré Tool par Tool) respectivement
// — aucun nouveau Tool, aucune règle RBAC nouvelle ou dupliquée.
const defaultAgentFactories = [
  createAssistantAgent,
  createCrmAssistantAgent,
  createProjectAgent,
  createCommercialAgent,
  createPipelineAgent,
  createKpiAgent,
  createReportingAgent,
  createMaintenanceAgent,
  createIndustrialAgent,
  createNotificationAgent,
  createAutomationAgent,
  createBusinessAnalystAgent,
  createRecommendationAgent,
  createDataQualityAgent,
  createAdvancedSearchAgent,
  createMeetingAgent,
  createRoleCapabilityAuditAgent,
  createHrAgent,
  createPorPromeshAgent,
  createDocumentAgent,
  createTaskPlannerAgent,
  createAnalyticsAgent,
  // 23e Agent — intention `entity_lookup` (personne / société / promoteur
  // précis : find_crm_entity + web_search, réponse déterministe et sourcée).
  createEntityLookupAgent,
];

// Construit et enregistre les Agents par défaut dans `agentRegistry`
// (agents/agentRegistry.js). Chaque Agent a une intention exclusive (voir
// orchestrator/intentCatalog.js) donc l'ordre d'enregistrement n'affecte pas
// AgentRouter.select() — AgentRegistry.findHandler() choisit toujours celui
// dont canHandle(intent) est vrai, jamais un second candidat ambigu.
function loadDefaultAgents(agentRegistry, deps) {
  for (const factory of defaultAgentFactories) {
    agentRegistry.register(factory(deps));
  }
  return agentRegistry;
}

module.exports = { defaultAgentFactories, loadDefaultAgents };
