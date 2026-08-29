"use strict";

// Context Awareness — traduit le "pageContext" envoyé par le client Flutter
// (voir Dash Master Toolkit/lib/ai/models/copilot_page_context.dart) en une
// phrase factuelle française préfixée au message avant qu'il n'atteigne
// AIManager.handleMessage() — voir aiCopilotBridge.service.js. Fonction
// PURE, aucune I/O, testée en isolation (test/aiCopilot.pageContextFormatter.test.js).
//
// Pourquoi un préfixe de MESSAGE plutôt qu'un nouveau paramètre
// d'AIManager : garde l'orchestrateur (déjà validé par le corpus de 500
// scénarios, voir COPILOT_VALIDATION.md) totalement inchangé — la
// "connaissance du contexte" reste un souci de la couche de LIVRAISON
// (modules/ai-copilot/), jamais du noyau de raisonnement. Contrepartie
// assumée : l'historique de conversation (ConversationManager) mémorise le
// message AVEC son préfixe de contexte, pas le texte brut de l'utilisateur
// — un peu plus verbeux en relecture d'historique, documenté ici plutôt que
// caché.

// "la fiche d'un projet"/"la fiche d'un client" auraient semblé plus
// naturels, mais "fiche" est EXACTEMENT un mot-clé de l'intention
// `industrial` (voir intentCatalog.js) — un projet/client consulté
// détournait alors le classement lexical vers `industrial` dès que le
// message lui-même ne contenait pas de mot-clé net pour sa propre intention
// (voir pageContextFormatter.test.js pour la régression correspondante).
// "page" reste un mot générique absent de tout catalogue d'intentions.
const SCREEN_LABELS = {
  project: "la page d'un projet",
  client: "la page d'un client",
  dashboard: "le tableau de bord",
  industrial: "une fiche industrielle (Probar/Promesh)",
};

// Borne haute délibérément généreuse mais finie — un pageContext mal formé
// ou anormalement volumineux (bug client, ou tentative d'abus) ne doit
// jamais gonfler chaque tour de conversation de façon incontrôlée. Le
// PromptInjectionGuard d'AIManager scanne de toute façon le message final
// (préfixe inclus, voir aiCopilotBridge.service.js) — cette borne est une
// protection de TAILLE, pas de contenu.
const MAX_PREFIX_LENGTH = 800;
const MAX_DATA_ENTRIES = 12;
const MAX_VALUE_LENGTH = 120;

function formatValue(value) {
  if (Array.isArray(value)) {
    return value
      .slice(0, 8)
      .map((v) => String(v))
      .join(", ");
  }
  return String(value);
}

/**
 * `pageContext` attendu : `{ screen: string, label?: string, data?: object }`
 * (voir CopilotPageContext.toJson() côté Flutter). Retourne `null` si
 * absent/malformé — jamais une exception, jamais un préfixe fabriqué à
 * partir de rien.
 */
function formatPageContext(pageContext) {
  if (!pageContext || typeof pageContext !== "object") return null;

  const { screen, label, data } = pageContext;
  if (!screen || typeof screen !== "string") return null;

  const screenLabel = SCREEN_LABELS[screen] || screen;
  const labelText = label && typeof label === "string" && label.trim() ? ` (${label.trim()})` : "";

  const parts = [];
  if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data)) {
      if (parts.length >= MAX_DATA_ENTRIES) break;
      if (value === null || value === undefined || value === "") continue;
      const formatted = formatValue(value).slice(0, MAX_VALUE_LENGTH);
      if (!formatted) continue;
      parts.push(`${key} : ${formatted}`);
    }
  }

  const detailsText = parts.length ? ` — ${parts.join(" ; ")}` : "";
  // Jamais "l'utilisateur consulte actuellement" : "utilisateur" est
  // EXACTEMENT un mot-clé de l'intention `users` (voir intentCatalog.js) —
  // cette formule aurait fait gagner un point gratuit à `users` sur CHAQUE
  // message accompagné d'un contexte d'écran, assez pour l'emporter par
  // égalité (ordre du catalogue) dès que le message lui-même ne comportait
  // qu'un seul mot-clé net pour sa propre intention. Voir
  // pageContextFormatter.test.js pour la régression correspondante.
  const prefix = `[Contexte d'écran actuellement affiché : ${screenLabel}${labelText}${detailsText}.]`;

  return prefix.length > MAX_PREFIX_LENGTH ? `${prefix.slice(0, MAX_PREFIX_LENGTH - 2)}…]` : prefix;
}

module.exports = { formatPageContext };
