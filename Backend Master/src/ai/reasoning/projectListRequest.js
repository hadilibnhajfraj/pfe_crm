"use strict";

// Reconnaît, sans modèle de langage, une demande SIMPLE portant sur l'ensemble
// des projets : liste, nombre ou analyse (français, anglais, russe).
//
// S'appuie sur EntityNormalizer.detectList() — même définition d'une « liste
// simple » que le routeur : dès que la phrase porte un filtre, un nom propre
// ou un statut (« projets en retard », « analyse du projet Sfax », « combien
// de projets a Hadil »), le résultat est `null` et les chemins existants de
// ProjectAgent s'appliquent sans changement.

const { detectLanguage, foldLatin } = require("../language/languageDetector");
const { EntityNormalizer } = require("../routing/entityNormalizer");

const entityNormalizer = new EntityNormalizer();

const COUNT = /\bcombien\b|\bnombre(?:\s+total)?\b|\bhow many\b|\bnumber of\b|\bcount\b|сколько|количеств\S*/g;
const ANALYSIS =
  /\banalyse[rsz]?\b|\banaly[sz]e\b|\banalysis\b|\bsynthese\b|\bbilan\b|\bresume[rz]?\b|\boverview\b|\bsummar(?:y|ize|ise)\b|\S*анализ\S*|обзор\S*|сводк\S*/g;
// « ai-je », « do I have », « у меня » : les projets de la personne qui parle.
const SPEAKER = /\bai je\b|\bj ai\b|\bdo i have\b|\bi have\b|у меня/g;
// Mots sans contenu propres à ces formulations (en plus de ceux du routeur).
const EXTRA_FILLERS = /\b(?:fais|faire|fait|total|totale|actuellement|maintenant|make|an|currently|now|pour|for)\b|сделай|сейчас|всего|для/g;

function normalize(text) {
  return foldLatin(String(text || "")).replace(/[’`'‐-]/g, " ").replace(/[?.!,;:«»"()]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * @returns {null | { kind: "list"|"count"|"analysis", mine: boolean, language: "fr"|"en"|"ru" }}
 */
function detectProjectListRequest(message) {
  const raw = String(message || "").trim();
  if (!raw || raw.length > 160) return null;
  const t = normalize(raw);
  const isCount = t.search(COUNT) !== -1;
  const isAnalysis = !isCount && t.search(ANALYSIS) !== -1;
  const speaker = t.search(SPEAKER) !== -1;
  const stripped = t.replace(COUNT, " ").replace(ANALYSIS, " ").replace(SPEAKER, " ").replace(EXTRA_FILLERS, " ").replace(/\s+/g, " ").trim();
  // Le mot de comptage ou d'analyse retiré tenait lieu de verbe : « liste »
  // le remplace pour que la phrase reste lue comme une demande simple.
  const list = entityNormalizer.detectList(isCount || isAnalysis ? `liste ${stripped}` : stripped);
  if (!list || list.entity !== "project") return null;
  return {
    kind: isCount ? "count" : isAnalysis ? "analysis" : "list",
    mine: list.mine || speaker,
    // Langue lue sur le message d'origine (le texte épuré est trop court).
    language: detectLanguage(raw).language,
  };
}

module.exports = { detectProjectListRequest };
