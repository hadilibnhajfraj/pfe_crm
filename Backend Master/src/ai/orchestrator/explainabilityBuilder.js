"use strict";

/**
 * # explainabilityBuilder — pourquoi, quelles données, quels Tools, quelles règles métier
 *
 * ## Rôle
 * Calcule `response.explainability`, PRÉSENT sur CHAQUE réponse (jamais
 * `null`, contrairement à `explanation` — voir `explanationBuilder.js`,
 * conservé tel quel pour compatibilité, volontairement plus étroit :
 * seulement "quel Agent/Tool", pas "pourquoi"/"quelles règles"). Distingue
 * explicitement deux natures de `toolSteps` (voir `agents/*.js`) :
 * - les Tools MCP RÉELS (`{tool, input, output}`, aucun marqueur) — CE que
 *   le Copilot est allé chercher dans le CRM ;
 * - les étapes de RAISONNEMENT synthétiques (`{tool, synthetic: true,
 *   description, input, output}`, ex. `analyze_project_attention`,
 *   `analyze_data_quality`) — COMMENT il a interprété ces données, la règle
 *   métier appliquée. `description` (une phrase française déjà écrite par
 *   l'Agent qui connaît le sens métier exact de son propre calcul) est
 *   TOUJOURS préférée à un résumé générique — jamais reformulée ni
 *   réinterprétée ici, seulement recopiée.
 *
 * ## Jamais rien d'inventé
 * `dataUsed`/`businessRules` ne font QUE relire des `toolSteps` déjà
 * produits par l'Agent — cette fonction ne recalcule, ne devine et
 * n'enrichit RIEN ; elle relie des faits déjà réels entre eux (même
 * discipline que `ResponseBuilder` pour `suggestions`/`dataQuality`,
 * "simplement projetés tels quels").
 *
 * ## Entrée
 * `buildExplainability({ mode, agentName, toolSteps, citations })`
 *
 * ## Sortie
 * `{ reasoning: string, dataUsed: {tool,summary}[], toolsCalled: string[],
 *    businessRules: {rule,description}[] }` — jamais `null`.
 */
function summarizeToolOutput(output) {
  if (output === null || output === undefined) return "Aucune donnée retournée.";
  if (typeof output === "string") {
    if (output.length === 0) return "Résultat vide.";
    if (output.startsWith("Error:")) return `Échec : ${output.slice(6).trim()}`;
    // Plusieurs Agents (ProjectAgent, DataQualityAgent, RecommendationAgent)
    // résument déjà eux-mêmes leur toolStep en une phrase humaine (ex. "12
    // projet(s) analysé(s)") plutôt que de garder l'objet brut — cette
    // phrase EST le résumé le plus honnête possible, jamais remplacée par
    // un texte générique qui en dirait moins.
    return output;
  }
  if (Array.isArray(output)) return `${output.length} élément(s) retourné(s).`;
  if (typeof output === "object") {
    if (Array.isArray(output.data)) {
      const totalText = typeof output.total === "number" && output.total !== output.data.length ? ` (sur ${output.total} au total)` : "";
      return `${output.data.length} enregistrement(s) récupéré(s)${totalText}.`;
    }
    const keys = Object.keys(output);
    if (keys.length === 0) return "Résultat vide.";
    const shown = keys.slice(0, 5).join(", ");
    return `Données récupérées (champ(s) : ${shown}${keys.length > 5 ? ", ..." : ""}).`;
  }
  return "Résultat récupéré.";
}

function buildExplainability({ mode, agentName = null, toolSteps = [], citations = [] } = {}) {
  const realSteps = toolSteps.filter((s) => !s.synthetic);
  const ruleSteps = toolSteps.filter((s) => s.synthetic);

  const toolsCalled = [...new Set(realSteps.map((s) => s.tool))];
  const dataUsed = realSteps.map((s) => ({ tool: s.tool, summary: summarizeToolOutput(s.output) }));
  const businessRules = ruleSteps.map((s) => ({ rule: s.tool, description: s.description || summarizeToolOutput(s.output) }));

  const reasoningParts = [];
  if (mode === "agent" && agentName) {
    reasoningParts.push(`Traité par l'agent spécialisé "${agentName}".`);
  } else if (mode === "tool_calling") {
    reasoningParts.push("Traité par le chemin générique d'appel d'outils (aucun Agent spécialisé dédié à cette intention).");
  } else if (mode === "qa") {
    reasoningParts.push("Traité par recherche documentaire (RAG), sans appel à un AI Tool.");
  }

  if (toolsCalled.length > 0) {
    reasoningParts.push(`Données interrogées via : ${toolsCalled.join(", ")}.`);
  }
  if (businessRules.length > 0) {
    reasoningParts.push(`Règle(s) métier appliquée(s) : ${businessRules.map((r) => r.description).join(" ")}`);
  }
  if (citations.length > 0) {
    const count = citations.length;
    reasoningParts.push(`Réponse appuyée sur ${count} ${count > 1 ? "sources documentaires" : "source documentaire"} du CRM.`);
  }
  if (reasoningParts.length === 0) {
    reasoningParts.push("Réponse générée sans consulter de donnée ni de règle métier spécifique.");
  }

  return {
    reasoning: reasoningParts.join(" "),
    dataUsed,
    toolsCalled,
    businessRules,
  };
}

// Pour `ResponseBuilder.buildErrorResponse()` : être transparent inclut
// d'expliquer un REFUS/ÉCHEC, pas seulement un succès — jamais un champ
// vide sans justification.
function buildErrorExplainability(error) {
  const message = error && error.message ? error.message : "une erreur interne";
  return {
    reasoning: `Aucune donnée exploitée : le tour a échoué avant de produire une réponse (${message}).`,
    dataUsed: [],
    toolsCalled: [],
    businessRules: [],
  };
}

// Pour `ResponseBuilder.buildClarificationResponse()` : la transparence sur
// UNE ambiguïté détectée (voir CONVERSATION_CONTEXT.md) plutôt qu'un champ
// vide.
function buildClarificationExplainability() {
  return {
    reasoning: "Aucune donnée exploitée : une référence ou une correction a été détectée sans sujet antérieur connu — une clarification a été demandée plutôt qu'une réponse devinée.",
    dataUsed: [],
    toolsCalled: [],
    businessRules: [],
  };
}

module.exports = { buildExplainability, buildErrorExplainability, buildClarificationExplainability, summarizeToolOutput };
