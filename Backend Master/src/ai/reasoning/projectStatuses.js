"use strict";

// Les 11 valeurs RÉELLES et STABLES de Project.statut — déplacées telles
// quelles depuis agents/projectAgent.js (mission "CORRIGER LE FILTRAGE DES
// PROJETS PAR STATUT") pour être partagées avec orchestrator/entityExtractor.js
// (compréhension naturelle, Phase 1) : une seule liste, jamais deux copies à
// garder synchronisées. Vérifiées en direct (décompte par valeur de la colonne
// statut, table projects) — jamais devinées.
const KNOWN_STATUS_VALUES = [
  "Identification",
  "Préparation",
  "Proposition technique",
  "Proposition commerciale",
  "Négociation",
  "En cours",
  "Livraison",
  "Fidélisation",
  "Terminé",
  "Plan technique",
  "Prospect",
];

// Insensible aux accents ET à la casse (NFD + suppression des diacritiques).
function normalizeAccents(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

module.exports = { KNOWN_STATUS_VALUES, normalizeAccents };
