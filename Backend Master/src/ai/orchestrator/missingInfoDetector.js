"use strict";

/**
 * # missingInfoDetector — étape 11 : poser une question complémentaire si des informations sont manquantes
 *
 * ## Rôle
 * Ferme un écart réel : avant cette passe, un appel de Tool refusé par
 * `ValidationManager` (`mcp/validationManager.js`, champ requis absent —
 * `Joi`) devenait simplement une chaîne `"Error: ..."` réinjectée dans la
 * boucle du modèle (`langchain/chains/toolCallingChain.js`) — rien ne
 * GARANTISSAIT que la réponse finale demande clairement l'information
 * manquante à l'utilisateur ; cela dépendait entièrement du bon vouloir du
 * modèle à suivre le principe déjà posé dans
 * `langchain/prompts/responsePrompts.js` ("dis-le explicitement" si une
 * information manque). Ce module ajoute un filet de sécurité **hors
 * modèle, déterministe et testable** : il détecte le motif d'erreur Joi
 * `"<champ>" is required` dans les `toolSteps` déjà produits par n'importe
 * quel Agent/Workflow, et construit une question de relance en français —
 * indépendamment de ce que le modèle a effectivement écrit dans `answer`.
 *
 * ## Pourquoi générique (pas propre à un Agent)
 * Contrairement à `SuggestionEngine`/`ProjectAttentionAnalyzer` (spécifiques
 * au domaine "projects"), `toolSteps` a EXACTEMENT la même forme
 * `{tool, input, output}` pour les 11 Agents et le chemin `WorkflowManager`
 * — ce détecteur s'applique donc à toute la conversation, câblé une seule
 * fois dans `ResponseBuilder.build()` (comme `explanationBuilder.js`),
 * jamais par Agent individuellement.
 *
 * ## Entrée
 * `detectMissingFields(toolSteps: {tool, input, output}[])`
 * `buildFollowUpQuestion(missingFields: string[])`
 *
 * ## Sortie
 * `detectMissingFields` → `string[]` (noms de champs, dédupliqués, dans
 * l'ordre de première apparition). `buildFollowUpQuestion` → `string|null`
 * (`null` si `missingFields` est vide — rien à demander).
 *
 * ## Limite assumée
 * Ne reconnaît que le message d'erreur PRODUIT PAR JOI pour un champ requis
 * absent (`ValidationManager.validateToolInput()`, `abortEarly: false`) —
 * pas les erreurs de TYPE ("doit être un nombre") ni les échecs métier
 * renvoyés par un service CRM (`throw {status, message}`) : ce ne sont pas
 * des informations "manquantes" au même sens, une confusion aurait produit
 * de faux positifs (voir `SMART_SUGGESTIONS.md`/`BUSINESS_REASONING.md`
 * pour la même discipline : ne signaler que ce qui est réellement vérifiable).
 */

// Le message exact traverse trois couches sans jamais être reformulé :
// ValidationManager.validateToolInput() -> `ToolValidationError` (mcp/errors.js,
// `Invalid input for tool "X": <détail Joi>`) -> ErrorHandler.toResponse()
// (JSON-RPC, message inchangé) -> mcpToolAdapter.js (`throw new Error(response.error.message)`)
// -> ToolCallingChain (`Error: ${err.message}`). Le détail Joi lui-même, avec
// `abortEarly:false`, contient une occurrence de ce motif par champ requis
// manquant : `"summary" is required`, `"startDateTime" is required`, ...
const MISSING_FIELD_PATTERN = /"([^"]+)"\s+is required/g;

function detectMissingFields(toolSteps = []) {
  const fields = [];
  const seen = new Set();

  for (const step of toolSteps) {
    if (typeof step.output !== "string" || !step.output.startsWith("Error: ")) continue;

    MISSING_FIELD_PATTERN.lastIndex = 0;
    let match;
    while ((match = MISSING_FIELD_PATTERN.exec(step.output)) !== null) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        fields.push(match[1]);
      }
    }
  }

  return fields;
}

function buildFollowUpQuestion(missingFields) {
  if (!missingFields || missingFields.length === 0) return null;

  const plural = missingFields.length > 1;
  const list = missingFields.map((field) => `« ${field} »`).join(", ");
  return `Il me manque ${plural ? "les informations suivantes" : "l'information suivante"} pour continuer : ${list}. Pouvez-vous ${plural ? "les préciser" : "la préciser"} ?`;
}

module.exports = { detectMissingFields, buildFollowUpQuestion, MISSING_FIELD_PATTERN };
