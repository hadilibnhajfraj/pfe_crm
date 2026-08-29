"use strict";

const { tokenize } = require("../utils/tokenize");

/**
 * # searchQueryParser — comprendre une recherche complexe en langage naturel
 *
 * ## Rôle
 * Fonctions pures et déterministes (même philosophie que
 * `businessAnalyzer.js`/`kpiInsights.js` : hors-ligne, aucun appel modèle),
 * consommées par `AdvancedSearchAgent` (`agents/advancedSearchAgent.js`)
 * pour transformer une phrase ("projets créés en juin", "devis qui
 * dépassent 50 000 €") en un critère structuré (plage de dates, seuil
 * numérique) — jamais un critère fabriqué : si rien de reconnaissable n'est
 * trouvé, `supported: false`.
 */

const MONTHS_FR = {
  janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, décembre: 12,
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Un mois français reconnu dans le message (+ année optionnelle, sinon
// l'année en cours) → une plage {dateFrom, dateTo} au format attendu par
// `list_projects` (filtre RÉEL sur `createdAt`, voir ADVANCED_SEARCH_AGENT.md).
function parseMonthDateRange(message, { now = new Date() } = {}) {
  const terms = tokenize(message);
  const monthTerm = terms.find((t) => MONTHS_FR[t] !== undefined);
  if (!monthTerm) {
    return { supported: false, note: "Aucun mois reconnu dans la demande." };
  }

  const month = MONTHS_FR[monthTerm];
  const yearTerm = terms.find((t) => /^\d{4}$/.test(t));
  const year = yearTerm ? parseInt(yearTerm, 10) : now.getFullYear();
  const lastDay = new Date(year, month, 0).getDate();

  return {
    supported: true,
    month,
    year,
    dateFrom: `${year}-${pad2(month)}-01`,
    dateTo: `${year}-${pad2(month)}-${pad2(lastDay)}`,
    label: `${monthTerm} ${year}`,
  };
}

const LT_WORDS = ["inferieur", "inférieur", "inferieurs", "inférieurs", "dessous", "moins"];

// Un montant en euros ("50 000 €", "50000€") + un sens de comparaison
// (par défaut "dépasse", sauf mot indiquant l'inverse) — jamais un seuil
// inventé : sans motif monétaire reconnu, `supported: false`.
function parseAmountThreshold(message) {
  const text = String(message || "").toLowerCase();
  const match = text.match(/(\d[\d\s]{0,10}\d|\d)\s*(?:€|euros?)/);
  if (!match) return { supported: false, note: "Aucun montant en euros reconnu dans la demande." };

  const amount = parseInt(match[1].replace(/\s+/g, ""), 10);
  if (!Number.isFinite(amount)) return { supported: false, note: "Aucun montant en euros reconnu dans la demande." };

  const terms = tokenize(text);
  const operator = LT_WORDS.some((w) => terms.includes(w)) ? "lt" : "gt";
  return { supported: true, amount, operator, operatorLabel: operator === "lt" ? "inférieur à" : "supérieur à" };
}

// Lundi 00:00 de la semaine de `now` (convention française).
function computeStartOfWeek(now = new Date()) {
  const date = new Date(now);
  const day = date.getDay(); // 0 = dimanche .. 6 = samedi
  const diffToMonday = day === 0 ? 6 : day - 1;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - diffToMonday);
  return date;
}

// Filtre des enregistrements déjà réels (renvoyés par un Tool) sur un champ
// numérique — un post-traitement de données réelles, jamais une invention.
function filterByThreshold(items, field, operator, threshold) {
  return (items || []).filter((item) => {
    const value = item && item[field];
    if (typeof value !== "number") return false;
    return operator === "lt" ? value < threshold : value > threshold;
  });
}

// Utilisateurs dont `lastActivity` (déjà réel, voir get_commercial_contact_kpi)
// est absent ou antérieur à `sinceDate` — un PROXY documenté explicitement
// (dernière mise à jour d'une fiche contact, pas "toute activité" au sens
// large) — voir ADVANCED_SEARCH_AGENT.md.
function usersWithNoActivitySince(usersPerformance, sinceDate) {
  return (usersPerformance || []).filter((u) => !u.lastActivity || new Date(u.lastActivity) < sinceDate);
}

module.exports = {
  parseMonthDateRange,
  parseAmountThreshold,
  computeStartOfWeek,
  filterByThreshold,
  usersWithNoActivitySince,
  MONTHS_FR,
};
