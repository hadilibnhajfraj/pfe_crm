"use strict";

const { tokenize } = require("../utils/tokenize");

/**
 * # industrialPromeshOverride — "fiche PROMESH" > industrial, sur ÉGALITÉ SEULEMENT
 *
 * ## Le bug corrigé (mission "CORRIGER DÉFINITIVEMENT LES REQUÊTES FICHES
 * PRO PROMESH / PRO PROBAR")
 * Reproduit en direct : "donner les fiche PRO PROMESH" contient à la fois
 * "fiche" (mot-clé RÉEL de `industrial`) et "promesh" (mot-clé RÉEL de
 * `por_promesh`) — une VRAIE égalité de score (1-1). `intentCatalog.js`
 * déclare `industrial` AVANT `por_promesh` : `LexicalIntentRouter`
 * (`score > bestScore`, jamais `>=`) départage donc en faveur de
 * `industrial` — la demande, qui porte pourtant sur des fiches POR PROMESH,
 * atterrit sur `industrial_agent`, qui doit alors deviner un `module` ENUM
 * ("probar"/"melange"/"maintenance") sans aucun signal réel dans le
 * message : reproduit en direct, il devine "probar" et retourne une fiche
 * PROBAR pour une demande PROMESH.
 *
 * ## Pourquoi pas simplement réordonner le catalogue
 * Même raisonnement que `commercialRelanceOverride.js`/`projectOwnershipOverride.js` :
 * réordonner changerait le comportement pour TOUTE égalité `industrial`
 * future, pas seulement celle-ci. Un changement local et explicite, limité à
 * cette seule ambiguïté, est plus sûr et plus auditable.
 *
 * ## La vraie règle — score RÉELLEMENT recalculé, jamais une simple présence
 * Contrairement à `commercialRelanceOverride.js` (dont la présence seule
 * d'un mot-clé suffit — vérifié n'apparaître dans AUCUN scénario `projects`
 * existant), "promesh" PEUT légitimement apparaître dans un message qui
 * gagne `industrial` par une marge NETTE (ex. scénario réel du corpus,
 * ind-09 : "Crée un enregistrement de production industrielle pour la ligne
 * PROMESH." — score industrial=3 via enregistrement+production+industrielle,
 * score por_promesh=1 via promesh seul — `industrial` doit gagner, jamais
 * réécrit). Ce module recalcule donc RÉELLEMENT les deux scores (mêmes
 * mots-clés que le catalogue, jamais dupliqués/inventés) et ne réécrit que
 * sur une VRAIE égalité (score égal), jamais sur la simple présence du mot
 * "promesh". Une mention explicite d'un domaine industriel réel
 * ("probar"/"melange"/"mélange" — les 3 vraies valeurs de l'ENUM
 * IndustrialRecord.module) gagne toujours, même à égalité.
 *
 * ## Portée délibérément étroite
 * Ne s'applique QUE quand le routeur a choisi `industrial` ET que
 * `por_promesh` existe dans le catalogue fourni.
 */
function score(message, keywords) {
  const terms = new Set(tokenize(message));
  return keywords.reduce((sum, kw) => sum + (terms.has(kw.toLowerCase()) ? 1 : 0), 0);
}

function mentionsIndustrialDomain(message) {
  const terms = new Set(tokenize(message));
  return terms.has("probar") || terms.has("melange") || terms.has("mélange");
}

// `key` est la clé DÉJÀ choisie par le vrai routeur — jamais recalculée
// depuis zéro pour décider QUI gagne globalement (ça reste le rôle du
// routeur) ; seulement pour DÉTECTER si CETTE victoire précise d'`industrial`
// était une égalité avec `por_promesh`, la seule situation corrigée ici.
function applyIndustrialPromeshOverride(message, key, catalogByKey) {
  if (key !== "industrial") return key;
  const porPromeshEntry = catalogByKey.get("por_promesh");
  const industrialEntry = catalogByKey.get("industrial");
  if (!porPromeshEntry || !industrialEntry) return key;
  if (mentionsIndustrialDomain(message)) return key;

  const industrialScore = score(message, industrialEntry.keywords || []);
  const porPromeshScore = score(message, porPromeshEntry.keywords || []);
  if (porPromeshScore === 0) return key;
  return porPromeshScore >= industrialScore ? "por_promesh" : key;
}

module.exports = { applyIndustrialPromeshOverride, mentionsIndustrialDomain };
