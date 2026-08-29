"use strict";

/**
 * # buildSearchAnswer — met en mots les résultats d'une recherche complexe
 *
 * Même choix que les autres `*AnswerBuilder.js` de `reasoning/` : aucun
 * second appel au modèle — chaque section vient déjà d'un résultat calculé
 * (voir `agents/advancedSearchAgent.js`). Une recherche non supportée
 * (donnée manquante, ex. "devis") reste PRÉSENTE dans la réponse, avec une
 * note honnête, jamais masquée en silence.
 *
 * ## Entrée
 * `buildSearchAnswer(results)` — `results` un tableau de
 * `{ label: string, supported: boolean, lines: string[], note?: string }`.
 */
function formatResult({ label, supported, lines, note }) {
  if (!supported) return `### ${label}\n${note}`;
  if (lines.length === 0) return `### ${label}\nAucun résultat.`;
  return `### ${label}\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

const CAPABILITIES_MENU = [
  "Projets créés sur une période (ex. « Recherche les projets créés en juin. »)",
  "Projets/marché au-dessus ou en-dessous d'un montant (ex. « Cherche les projets dont le montant du marché dépasse 50 000 €. »)",
  "Commerciaux sans activité récente cette semaine (ex. « Trouve les commerciaux qui n'ont aucune activité cette semaine. »)",
].join("\n- ");

function buildSearchAnswer(results) {
  if (!results || results.length === 0) {
    return `Je n'ai pas reconnu de critère de recherche précis dans votre question. Voici ce que je sais chercher aujourd'hui :\n- ${CAPABILITIES_MENU}`;
  }
  return results.map(formatResult).join("\n\n");
}

module.exports = { buildSearchAnswer, CAPABILITIES_MENU };
