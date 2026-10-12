"use strict";

/**
 * # Détection de langue FR / EN / RU — déterministe, sans modèle
 *
 * Utilisée par l'analytique CRM (PROBAR ASSISTANT) pour répondre dans la
 * langue du message. Volontairement minimale (écriture + mots fréquents) ;
 * elle sera réutilisée par le chantier multilingue complet.
 *
 * - Majorité de lettres cyrilliques → « ru » (y compris message mixte
 *   « Покажи мои projects »).
 * - Sinon, mots fréquents anglais vs français (+ accents français).
 * - Par défaut (message trop court, ambigu) : `fallback` (« fr »).
 */

const EN_WORDS = new Set([
  "the", "my", "me", "show", "what", "which", "who", "how", "many", "much", "is", "are", "with", "most", "least",
  "of", "by", "per", "each", "every", "give", "list", "number", "and", "in", "this", "that", "month", "year",
  "last", "do", "does", "have", "has", "assigned", "working", "work", "projects", "project", "engineer", "engineers",
  "customer", "customers", "sales", "records", "follow", "ups", "top", "ranking", "average", "total", "our", "we",
  "made", "been", "not", "never", "without", "get", "tell", "find", "whose", "biggest", "highest",
  "about", "latest", "news", "more", "his", "her", "their", "developer",
]);

const FR_WORDS = new Set([
  "le", "la", "les", "de", "des", "du", "mes", "mon", "ma", "quel", "quelle", "quels", "quelles", "est", "sont",
  "plus", "moins", "combien", "projets", "projet", "ingenieur", "ingenieurs", "par", "chaque", "donne", "moi",
  "avons", "nous", "avec", "pour", "dans", "ce", "cette", "mois", "annee", "qui", "que", "classement", "fiches",
  "relances", "commercial", "commerciaux", "ont", "montre", "travaille", "possede", "utilise", "un", "une", "au",
  "aux", "sur", "l", "d", "ai", "je", "tous", "toutes", "leur", "gere",
]);

const CYRILLIC = /[Ѐ-ӿ]/g;
const LATIN = /[a-zà-ÿ]/gi;
const FRENCH_ACCENTS = /[éèêëàâùûçôîï]/;

function foldLatin(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[àâäáã]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[îïí]/g, "i")
    .replace(/[ôöó]/g, "o")
    .replace(/[ùûüú]/g, "u")
    .replace(/ç/g, "c");
}

/**
 * @returns {{ language: "fr"|"en"|"ru", confidence: number }}
 */
function detectLanguage(text, { fallback = "fr" } = {}) {
  const raw = String(text || "");
  const cyrillic = (raw.match(CYRILLIC) || []).length;
  const latin = (raw.match(LATIN) || []).length;
  if (cyrillic > 0 && cyrillic >= latin * 0.5) {
    return { language: "ru", confidence: cyrillic / Math.max(1, cyrillic + latin) };
  }
  const words = foldLatin(raw).match(/[a-z]+/g) || [];
  let en = 0;
  let fr = FRENCH_ACCENTS.test(raw.toLowerCase()) ? 1 : 0;
  for (const w of words) {
    if (EN_WORDS.has(w)) en += 1;
    if (FR_WORDS.has(w)) fr += 1;
  }
  if (en === 0 && fr === 0) return { language: fallback, confidence: 0 };
  if (en > fr) return { language: "en", confidence: en / (en + fr) };
  if (fr > en) return { language: "fr", confidence: fr / (en + fr) };
  return { language: fallback, confidence: 0.5 };
}

module.exports = { detectLanguage, foldLatin };
