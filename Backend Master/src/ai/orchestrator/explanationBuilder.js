"use strict";

/**
 * # buildExplanation — étape "ajouter des explications si nécessaire"
 *
 * ## Rôle
 * Complète `ResponseBuilder` avec une courte phrase en langage naturel qui
 * explique COMMENT la réponse a été construite (quels Tools appelés, quel
 * Agent a traité la demande, sur combien de sources documentaires elle
 * s'appuie) — distinct des `citations` (qui documentent QUOI, pas COMMENT)
 * et du `toolCalls` brut de la réponse (données structurées, pas une phrase
 * lisible). Volontairement **déterministe et hors-ligne** (pas un second
 * appel au modèle) : même philosophie que `LexicalIntentRouter`/
 * `HashingEmbeddingProvider` — un texte utile sans dépendance à un
 * fournisseur LLM, cohérent que celui-ci soit branché ou non.
 *
 * "Si nécessaire" : renvoie `null` quand il n'y a rien d'utile à expliquer
 * (réponse RAG sans citation, mode "error") — une explication qui ne dirait
 * rien de plus que l'existence de la réponse ne mérite pas d'exister.
 *
 * ## Entrée
 * `{ mode, agentName?, toolSteps?, citations? }` — la même forme que
 * `ResponseBuilder.build()` reçoit déjà.
 *
 * ## Sortie
 * `string | null`
 */
function buildExplanation({ mode, agentName = null, toolSteps = [], citations = [] }) {
  if (mode === "agent" && agentName) {
    const base = `Traité par l'agent spécialisé "${agentName}".`;
    if (toolSteps.length === 0) return base;
    const toolNames = [...new Set(toolSteps.map((s) => s.tool))].join(", ");
    return `${base} Outils consultés : ${toolNames}.`;
  }

  if (mode === "tool_calling" && toolSteps.length > 0) {
    const toolNames = [...new Set(toolSteps.map((s) => s.tool))].join(", ");
    return `Réponse construite à partir de l'outil (ou des outils) : ${toolNames}.`;
  }

  if (mode === "qa" && citations.length > 0) {
    const count = citations.length;
    return `Réponse basée sur ${count} ${count > 1 ? "sources documentaires" : "source documentaire"} du CRM.`;
  }

  return null;
}

module.exports = { buildExplanation };
