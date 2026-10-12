"use strict";

const { AiError } = require("../utils/errors");
const { buildExplanation } = require("./explanationBuilder");
const { detectMissingFields, buildFollowUpQuestion } = require("./missingInfoDetector");
const { buildExplainability, buildErrorExplainability, buildClarificationExplainability } = require("./explainabilityBuilder");

const GENERIC_ERROR_MESSAGE = "Le Copilot a rencontré une erreur interne.";
// Refus RBAC (Agent ou intention) : le détail technique (rôle, nom de
// l'Agent) reste dans le journal du serveur ; l'utilisateur lit un message
// clair, et l'interface ne propose pas « Réessayer » (le résultat serait le même).
const PERMISSION_DENIED_MESSAGE = "Votre rôle ne vous autorise pas à utiliser cette fonction de l'assistant. Si vous pensez qu'il s'agit d'une erreur, contactez un administrateur.";

function isPermissionError(error) {
  const name = error && error.constructor && error.constructor.name;
  return name === "AgentPermissionError" || name === "OrchestratorPermissionError" || name === "PermissionDeniedError";
}

/**
 * # ResponseBuilder — enveloppe de réponse stable pour un tour de conversation
 *
 * ## Rôle
 * Transforme le résultat brut d'`AgentRouter`/`WorkflowManager` (qui varie
 * selon le mode : agent, tool_calling, qa) en une forme unique que
 * n'importe quel futur appelant (contrôleur HTTP, CLI de test) peut
 * consommer sans connaître ces détails internes. Même logique de
 * "ne jamais fuiter le détail interne d'une erreur" que
 * `mcp/errorHandler.js` : seules les erreurs typées du kernel (`AiError` et
 * ses sous-classes — `OrchestratorError`, `LangChainError`, `RagError`, ...)
 * ont un message jugé sûr à renvoyer tel quel ; toute autre erreur (bug,
 * exception non prévue) devient un message générique côté client, la vraie
 * erreur restant dans les logs serveur (voir AIManager.handleMessage).
 *
 * ## Entrée
 * `build({ conversationId, intent, mode, answer, citations?, toolSteps?, agentName?, suggestions?, dataQuality? })`
 * `buildErrorResponse(error, { conversationId?, intent? })`
 * `buildClarificationResponse({ conversationId?, message })`
 *
 * ## Sortie
 * `{ conversationId, intent, mode, answer, explanation, explainability, pendingAction, citations, toolCalls, suggestions, dataQuality, followUpQuestion, agent, generatedAt }`
 * (ou `{ ..., mode: "error", answer: null, error: { message } }`, ou
 * `{ ..., mode: "clarification", answer: <question à l'utilisateur>, intent: null }`)
 * — `explanation` (étape "ajouter des explications si nécessaire" du
 * workflow) est calculée par `explanationBuilder.js`, `null` quand il n'y a
 * rien d'utile à ajouter (voir sa propre doc).
 *
 * ## `followUpQuestion` — étape 11 : poser une question si des informations manquent
 * Calculé ICI, générique à TOUT `toolSteps` (n'importe quel Agent/Workflow,
 * pas seulement `ProjectAgent`) via `missingInfoDetector.js` : détecte un
 * échec de validation Joi ("champ requis manquant") parmi les Tools
 * effectivement appelés et construit une question de relance en français —
 * `null` quand rien ne manque. Filet de sécurité déterministe, indépendant
 * du bon vouloir du modèle à suivre le principe déjà posé dans
 * `RESPONSE_PROMPTS.md` ("dis-le explicitement" si une information manque).
 *
 * ## `dataQuality` — étape 8 : vérifier la cohérence des données
 * Simplement PROJETÉ tel quel (`{projectId, projectName, warnings}[]`, `[]`
 * par défaut), même répartition des responsabilités que `suggestions` :
 * l'appelant (aujourd'hui, `ProjectAgent`, via
 * `reasoning/dataCoherenceChecker.js`) a déjà calculé ces avertissements
 * avant que `ResponseBuilder` ne les mette en forme — voir
 * `BUSINESS_REASONING.md`.
 *
 * ## `suggestions` — Smart Suggestions (voir `suggestionEngine.js`/`SMART_SUGGESTIONS.md`)
 * Simplement PROJETÉ tel quel (`{id, label, reason}[]`, `[]` par défaut) —
 * ce `ResponseBuilder` ne calcule ni ne filtre rien lui-même : c'est
 * l'appelant (aujourd'hui, `ProjectAgent`) qui a déjà produit une liste
 * ENTIÈREMENT filtrée par permission via `SuggestionEngine.suggestForFactors()`
 * avant qu'elle n'arrive ici — même répartition des responsabilités que
 * `citations`/`toolCalls`, déjà pré-calculés par leur producteur respectif.
 * Ce champ ne contient jamais rien d'exécutable, seulement des données
 * descriptives : aucune action n'est — ni ne peut être — déclenchée par sa
 * seule présence dans une réponse.
 *
 * ## `explainability` — pourquoi, quelles données, quels Tools, quelles règles métier
 * PRÉSENT sur CHAQUE réponse (jamais `null`, y compris `mode: "error"`/
 * `"clarification"` — être transparent inclut d'expliquer un refus, pas
 * seulement un succès) — voir `explainabilityBuilder.js`/
 * `EXPLAINABILITY_ENGINE.md`. Distinct de `explanation` (conservé tel quel,
 * plus étroit : "quel Agent/Tool" seulement) : `explainability.reasoning`
 * répond au "pourquoi", `dataUsed` aux données consultées (résumé par Tool
 * réel), `toolsCalled` aux AI Tools appelés, `businessRules` aux règles
 * métier appliquées (relit les `toolSteps` marqués `synthetic: true` par
 * l'Agent — `analyze_project_attention`, `analyze_data_quality`,
 * `analyze_kpi_trends`, `analyze_business_domain`,
 * `generate_recommendations` — jamais recalculé ici).
 *
 * ## `pendingAction` — une action proposée par AutomationAgent, en attente de confirmation
 * Simplement PROJETÉ tel quel (`{id, steps: {tool, input, reason}[]} | null`),
 * même répartition des responsabilités que `suggestions`/`dataQuality` :
 * `AutomationAgent` (`agents/automationAgent.js`,
 * `orchestrator/pendingActionStore.js`) a déjà décidé QUOI proposer et l'a
 * déjà stocké pour le tour de confirmation suivant AVANT que
 * `ResponseBuilder` ne le mette en forme. `null` dans tous les autres cas
 * (aucune proposition en cours) — jamais un objet exécutable : ce champ ne
 * porte que du texte/des paramètres déjà décidés, la VRAIE exécution
 * n'intervient qu'au tour suivant, sur confirmation explicite (voir
 * `AUTOMATION_WORKFLOWS.md`).
 *
 * ## `mode: "clarification"` — gérer l'ambiguïté sans halluciner
 * Distinct de `mode: "error"` : ce n'est pas un dysfonctionnement, mais un
 * cas légitime où `ConversationContextResolver`
 * (`orchestrator/conversationContextResolver.js`, voir
 * `CONVERSATION_CONTEXT.md`) détecte qu'un message fait référence à quelque
 * chose ("lesquels", "celui-ci", ...) sans qu'aucun sujet antérieur ne soit
 * connu dans l'historique — plutôt que de deviner un Tool/une réponse RAG
 * au hasard, le Copilot demande explicitement une précision. `intent: null`
 * (aucune intention n'a même été détectée — la clarification intervient
 * AVANT cette étape du workflow), `answer` porte la question posée à
 * l'utilisateur.
 */
class ResponseBuilder {
  build({ conversationId = null, intent, mode, answer, citations = [], toolSteps = [], agentName = null, suggestions = [], dataQuality = [], pendingAction = null }) {
    return {
      conversationId,
      intent: intent.name,
      mode,
      answer,
      explanation: buildExplanation({ mode, agentName, toolSteps, citations }),
      explainability: buildExplainability({ mode, agentName, toolSteps, citations }),
      pendingAction,
      citations: citations.map((c) => ({
        index: c.index,
        title: c.title,
        sourceType: c.sourceType,
        path: c.path,
        excerpt: c.excerpt,
        score: c.score,
      })),
      toolCalls: toolSteps.map((s) => ({ tool: s.tool, input: s.input, output: s.output })),
      suggestions: suggestions.map((s) => ({ id: s.id, label: s.label, reason: s.reason })),
      dataQuality: dataQuality.map((d) => ({ projectId: d.projectId, projectName: d.projectName, warnings: d.warnings })),
      followUpQuestion: buildFollowUpQuestion(detectMissingFields(toolSteps)),
      agent: agentName,
      generatedAt: new Date().toISOString(),
    };
  }

  buildErrorResponse(error, { conversationId = null, intent = null } = {}) {
    const denied = isPermissionError(error);
    const message = denied ? PERMISSION_DENIED_MESSAGE : error instanceof AiError ? error.message : GENERIC_ERROR_MESSAGE;
    return {
      conversationId,
      intent: intent ? intent.name : null,
      mode: "error",
      answer: null,
      explanation: null,
      explainability: buildErrorExplainability(error),
      pendingAction: null,
      citations: [],
      toolCalls: [],
      suggestions: [],
      dataQuality: [],
      followUpQuestion: null,
      agent: null,
      error: denied ? { message, code: "PERMISSION_DENIED", retryable: false } : { message },
      generatedAt: new Date().toISOString(),
    };
  }

  // `options` (Phase 1, compréhension naturelle — voir semanticIntentResolver.js) :
  // choix proposés à l'utilisateur plutôt qu'un « je ne comprends pas ». Ajoutés
  // à la réponse sous forme de liste numérotée ET exposés dans `suggestions`
  // (format déjà existant {id, label, reason}) — jamais exécutés automatiquement.
  buildClarificationResponse({ conversationId = null, message = "Pouvez-vous préciser votre demande ?", options = [] } = {}) {
    const answer = options.length ? [message, ...options.map((o, i) => `${i + 1}. ${o.label}`)].join("\n") : message;
    return {
      conversationId,
      intent: null,
      mode: "clarification",
      answer,
      explanation: null,
      explainability: buildClarificationExplainability(),
      pendingAction: null,
      citations: [],
      toolCalls: [],
      suggestions: options.map((o) => ({ id: o.id, label: o.label, reason: o.reason || null })),
      dataQuality: [],
      followUpQuestion: null,
      agent: null,
      generatedAt: new Date().toISOString(),
    };
  }
}

module.exports = { ResponseBuilder, GENERIC_ERROR_MESSAGE };
