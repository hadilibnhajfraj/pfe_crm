"use strict";

// Règles communes aux fiches de production PROMESH (por_promesh) et PROBAR
// (industrial_records, module "probar") : date de création, cohérence des
// heures à la validation, détection d'un brouillon resté vide.
//
// RÈGLES MÉTIER NON DÉFINIES AILLEURS — à confirmer avec l'atelier :
// - aucun horaire de poste n'existe dans le code ni dans la base. Rien n'est
//   donc supposé sur les heures de début et de fin d'un poste ; seule est
//   retenue l'évidence suivante : un poste "nuit" peut finir le lendemain, un
//   poste "matin" non (POSTES_CROSSING_MIDNIGHT) ;
// - une fiche créée après minuit pendant un poste de nuit prend la date du
//   jour calendaire de sa création, pas celle du début du poste.

// Fuseau des dates et heures métier — le même que celui des tâches planifiées.
const BUSINESS_TIMEZONE = process.env.APP_TIMEZONE || "Africa/Tunis";

// Postes dont l'heure de fin peut être, le lendemain, antérieure à l'heure de début.
const POSTES_CROSSING_MIDNIGHT = ["nuit"];

// Date (YYYY-MM-DD) et heure (HH:MM:SS) d'un même instant, dans le fuseau
// métier. Les deux viennent du MÊME calcul : une fiche créée à 00 h 04 est
// datée du jour qui commence, jamais de la veille.
function businessDateTime(now = new Date(), timeZone = BUSINESS_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}:${get("second")}` };
}

// "HH:MM" ou "HH:MM:SS" → secondes depuis minuit ; null si absent ou illisible.
function timeToSeconds(value) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(String(value == null ? "" : value).trim());
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0) : null;
}

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value));
  return m ? m[1] : null;
}

// Contrôle fait UNIQUEMENT à la validation définitive d'une fiche — jamais à
// l'enregistrement d'un brouillon, qui naît avec heure de fin = heure de début.
// Retourne la liste des messages d'erreur (vide si tout est cohérent).
// `heuresObligatoires` : false quand la fiche peut être validée sans heures
// (PROBAR) ; les heures ne sont alors contrôlées que si les deux sont saisies.
function validateFicheTimes({ date, heureDebut, heureFin, poste, heuresObligatoires = true }, now = new Date()) {
  const errors = [];

  const day = dateOnly(date);
  if (day && day > businessDateTime(now).date) errors.push("la date de production est dans le futur");

  const start = timeToSeconds(heureDebut);
  const end = timeToSeconds(heureFin);
  const blank = (v) => v == null || String(v).trim() === "";
  if (blank(heureDebut) && blank(heureFin) && !heuresObligatoires) return errors;
  if (start == null || end == null) {
    if (heuresObligatoires || !blank(heureDebut) || !blank(heureFin)) errors.push("l'heure de début et l'heure de fin doivent être renseignées (HH:MM)");
    return errors;
  }

  if (end === start) {
    errors.push("l'heure de fin doit être différente de l'heure de début");
  } else if (end < start && !POSTES_CROSSING_MIDNIGHT.includes(poste)) {
    errors.push(`l'heure de fin (${String(heureFin).slice(0, 5)}) est antérieure à l'heure de début (${String(heureDebut).slice(0, 5)}) : seul un poste de nuit peut se terminer le lendemain`);
  }
  return errors;
}

// Durée de la fiche en minutes, en tenant compte d'une fin le lendemain.
function ficheDurationMinutes({ heureDebut, heureFin }) {
  const start = timeToSeconds(heureDebut);
  const end = timeToSeconds(heureFin);
  if (start == null || end == null || start === end) return null;
  return Math.round(((end > start ? end - start : end + 86400 - start) / 60) * 100) / 100;
}

function isBlankValue(value) {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.every(isBlankValue);
  if (typeof value === "object") return Object.values(value).every(isBlankValue);
  return false; // nombre ou booléen : une valeur saisie
}

module.exports = {
  BUSINESS_TIMEZONE,
  POSTES_CROSSING_MIDNIGHT,
  businessDateTime,
  timeToSeconds,
  dateOnly,
  validateFicheTimes,
  ficheDurationMinutes,
  isBlankValue,
};
