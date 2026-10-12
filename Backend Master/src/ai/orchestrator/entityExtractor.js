"use strict";

const { KNOWN_STATUS_VALUES, normalizeAccents } = require("../reasoning/projectStatuses");

/**
 * # entityExtractor — entités et paramètres d'un message (Phase 1, compréhension naturelle)
 *
 * ## Rôle
 * Transforme un message libre en une structure INTERNE d'orchestration
 * (jamais montrée à l'utilisateur) :
 *
 *   « Montre-moi les projets PROBAR créés ce mois-ci par Ahmed »
 *   → { entityType: "project", product: "PROBAR", period: {key:"this_month", …}, person: "Ahmed", … }
 *
 * Entièrement DÉTERMINISTE (expressions régulières sur un texte normalisé),
 * jamais un appel LLM : rapide, testable, et surtout incapable d'inventer une
 * valeur. Toute valeur métier renvoyée est soit un littéral du message
 * (nom de personne, nom de fichier, référence), soit une valeur RÉELLE du CRM
 * (statut projet : l'une des 11 valeurs de `reasoning/projectStatuses.js`,
 * jamais une variante devinée). Un champ non détecté vaut `null`.
 *
 * ## Ce que ce module ne fait JAMAIS
 * - Décider d'une permission (le RBAC reste dans McpServer/PermissionManager).
 * - Lire un identifiant technique (UUID) comme une autorisation : `recordRef`
 *   n'est qu'un indice textuel, toujours revérifié par un Tool scopé.
 * - Choisir l'intention : il ENRICHIT l'intention déjà détectée
 *   (IntentDetector) et alimente le ContextManager / SemanticIntentResolver.
 */

// Période « récemment » par défaut : aucune définition métier n'existe dans le
// CRM — la valeur est donc un choix d'interface EXPLICITE, toujours rappelé à
// l'utilisateur dans la réponse (« depuis plus de 30 jours »), jamais caché.
const RECENT_DAYS = 30;

// Nom d'entité → type canonique. Synonymes courants inclus (« dossier »,
// « affaire » désignent un projet dans le vocabulaire commercial du CRM).
const ENTITY_PATTERNS = [
  { type: "project", pattern: /\b(projets?|dossiers?|affaires?|chantiers?)\b/ },
  { type: "commercial_contact", pattern: /\b(contacts?|clients?)\b/ },
  { type: "relance", pattern: /\b(relances?)\b/ },
  { type: "meeting", pattern: /\b(rendez[- ]vous|rdv|reunions?)\b/ },
  { type: "machine", pattern: /\b(machines?)\b/ },
  { type: "production_record", pattern: /\b(fiches?(?: de production)?)\b/ },
  { type: "por_promesh", pattern: /\b(por)\b/ },
  { type: "hr_request", pattern: /\b(demandes? rh|conges?|autorisations? de sortie)\b/ },
  { type: "maintenance_request", pattern: /\b(maintenance|pannes?)\b/ },
  { type: "document", pattern: /\b(documents?|fichiers?|rapports?|pdf)\b/ },
  // Ingénieur (table `engineers`, lié aux projets par Project.engineerId).
  // EN DERNIER : une phrase qui nomme aussi un projet reste « projet »
  // (« l'ingénieur du projet X » est une question sur un projet).
  // Le cyrillique n'a pas de \b (ASCII uniquement) : délimité explicitement.
  { type: "engineer", pattern: /\b(ingenieure?s?|engineers?|responsables? techniques?)\b|(?:^|[^а-яё])инженер/ },
];

// « mes projets », « dont je m'occupe », « à ma charge », « que je suis »…
const OWNERSHIP_PATTERN =
  /\b(mes|mon|ma)\b|\bje (?:suis|gere|m'occupe|m’occupe|travaille|pilote)\b|\bdont je m['’]occupe\b|\ba ma charge\b|\bsous ma responsabilite\b|\bme concernent\b|\bmoi-meme\b/;

// Ordinaux (1-based) — « le deuxième », « la 3e », « le n°2 », « le dernier » (-1).
const ORDINAL_WORDS = {
  premier: 1, premiere: 1,
  deuxieme: 2, second: 2, seconde: 2,
  troisieme: 3, quatrieme: 4, cinquieme: 5, sixieme: 6,
  septieme: 7, huitieme: 8, neuvieme: 9, dixieme: 10,
  dernier: -1, derniere: -1,
};
const ORDINAL_WORD_PATTERN = new RegExp(`\\b(?:le|la|l')\\s*(${Object.keys(ORDINAL_WORDS).join("|")})\\b`);
const ORDINAL_NUMBER_PATTERN = /\b(?:le|la)\s+(\d{1,2})\s*(?:e|eme|er|ere)\b|\b(?:n°|no|numero)\s*(\d{1,2})\b/;

// Références contextuelles — UNE entité précise (« celui-ci ») ou un ENSEMBLE
// déjà affiché (« ceux-ci », « les précédents », « les projets concernés »).
const SINGLE_REFERENCE_PATTERN =
  /\b(celui[- ](?:ci|la)|celle[- ](?:ci|la)|ce (?:projet|dossier|contact|client|document|fichier|rapport)|cette (?:fiche|affaire|demande|relance)|le projet actuel|ce dernier|cette derniere)\b/;
const SET_REFERENCE_PATTERN =
  /\b(ceux[- ](?:ci|la)|celles[- ](?:ci|la)|les precedents|les precedentes|les (?:projets|contacts|dossiers|fiches) concerne(?:e)?s|ces (?:projets|contacts|dossiers|fiches|demandes|relances)|lesquels|lesquelles|ceux (?:qui|que|de|dont|du|des|sans|avec)|celles (?:qui|que|de|dont|du|des|sans|avec)|parmi (?:eux|elles|ceux|celles))\b/;

// Relance NON faite : « n'ont pas été relancés récemment », « sans relance
// depuis 30 jours », « jamais relancés », « non relancés ».
const NOT_RELANCED_PATTERN = /\b(?:pas|jamais|non|sans|aucune?)\b[^.?!]{0,30}?\brelanc/;

// Statuts projet — chaque valeur réelle, tolérante au pluriel/accord.
const STATUS_PATTERNS = KNOWN_STATUS_VALUES.map((value) => {
  const base = normalizeAccents(value).replace(/\s+/g, "\\s+");
  return { value, pattern: new RegExp(`\\b${base}(?:e|s|es)?\\b`) };
});

const PERSON_PATTERN = /\b(?:cr[ée]{1,2}[es]*\s+par|par|de la part de|assign[ée]s?\s+[àa])\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+)?)/;
const PERSON_STOPWORDS = new Set(["mail", "email", "téléphone", "telephone", "semaine", "mois", "jour", "exemple"]);
const RECORD_REF_PATTERN = /\b((?:PR|PRJ|PROJ)[- ]?\d{1,6})\b|#(\d{1,6})\b/i;
const QUANTITY_PATTERN = /\b(?:les\s+)?(\d{1,3})\s+(?:premiers?|premieres?|derniers?|dernieres?|plus)\b/;
const FILENAME_PATTERN = /\b([\w.-]+\.(?:pdf|docx?|xlsx?|csv|txt|png|jpe?g))\b/i;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function extractPeriod(text, now) {
  const today = startOfDay(now);
  const lastNDays = text.match(/\b(?:depuis|ces|les)\s+(\d{1,3})\s+(?:derniers\s+)?jours?\b|\b(\d{1,3})\s+derniers\s+jours\b/);
  if (lastNDays) {
    const days = Number(lastNDays[1] || lastNDays[2]);
    return { key: "last_n_days", days, from: new Date(today.getTime() - days * 86400000), to: now };
  }
  if (/\baujourd['’]?hui\b/.test(text)) return { key: "today", from: today, to: now };
  if (/\bcette semaine\b/.test(text)) {
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return { key: "this_week", from: monday, to: now };
  }
  if (/\bce mois(?:[- ]ci)?\b/.test(text)) {
    return { key: "this_month", from: new Date(today.getFullYear(), today.getMonth(), 1), to: now };
  }
  if (/\bcette annee\b/.test(text)) {
    return { key: "this_year", from: new Date(today.getFullYear(), 0, 1), to: now };
  }
  if (/\brecemment\b|\brecents?\b|\brecentes?\b|\bdernierement\b/.test(text)) {
    return { key: "recent", days: RECENT_DAYS, from: new Date(today.getTime() - RECENT_DAYS * 86400000), to: now };
  }
  return null;
}

function extractOrdinal(text) {
  const word = text.match(ORDINAL_WORD_PATTERN);
  if (word) return ORDINAL_WORDS[word[1]];
  const number = text.match(ORDINAL_NUMBER_PATTERN);
  if (number) return Number(number[1] || number[2]);
  return null;
}

function extractStatus(text) {
  for (const { value, pattern } of STATUS_PATTERNS) {
    if (pattern.test(text)) return value;
  }
  return null;
}

/**
 * @param {string} message
 * @param {{ now?: Date }} [options]
 * @returns {{
 *   entityType: string|null, ownership: "mine"|null, status: string|null,
 *   period: object|null, relance: {notRelancedWithinDays:number}|null,
 *   product: "PROBAR"|"PROMESH"|null, person: string|null, ordinal: number|null,
 *   reference: {kind:"single"|"set", marker:string}|null, recordRef: string|null,
 *   quantity: number|null, filename: string|null, hasFilters: boolean
 * }}
 */
function extractEntities(message, { now = new Date() } = {}) {
  const raw = String(message || "");
  // Texte normalisé (minuscules, sans accents) pour la détection ; le texte
  // BRUT est gardé pour ce qui doit conserver sa casse (nom propre, fichier).
  const text = normalizeAccents(raw).replace(/[’]/g, "'");

  const entityMatch = ENTITY_PATTERNS.find(({ pattern }) => pattern.test(text));
  const period = extractPeriod(text, now);
  const notRelanced = NOT_RELANCED_PATTERN.test(text);
  const personMatch = raw.match(PERSON_PATTERN);
  const person = personMatch && !PERSON_STOPWORDS.has(personMatch[1].toLowerCase()) ? personMatch[1].trim() : null;
  const recordMatch = raw.match(RECORD_REF_PATTERN);
  const quantityMatch = text.match(QUANTITY_PATTERN);
  const filenameMatch = raw.match(FILENAME_PATTERN);

  let reference = null;
  const single = text.match(SINGLE_REFERENCE_PATTERN);
  const set = text.match(SET_REFERENCE_PATTERN);
  if (single) reference = { kind: "single", marker: single[1] };
  else if (set) reference = { kind: "set", marker: set[1] };

  const product = /\bprobar\b/.test(text) ? "PROBAR" : /\bpromesh\b/.test(text) ? "PROMESH" : null;

  const result = {
    entityType: entityMatch ? entityMatch.type : null,
    ownership: OWNERSHIP_PATTERN.test(text) ? "mine" : null,
    status: extractStatus(text),
    // Une période qui accompagne « pas relancé » décrit le délai de relance,
    // pas une date de création : elle est alors portée par `relance`.
    period: notRelanced ? null : period,
    relance: notRelanced ? { notRelancedWithinDays: period && period.days ? period.days : RECENT_DAYS } : null,
    product,
    person,
    ordinal: extractOrdinal(text),
    reference,
    recordRef: recordMatch ? (recordMatch[1] || `#${recordMatch[2]}`).toUpperCase().replace(/\s+/g, "-") : null,
    quantity: quantityMatch ? Number(quantityMatch[1]) : null,
    filename: filenameMatch ? filenameMatch[1] : null,
  };
  result.hasFilters = Boolean(result.status || result.period || result.relance || result.product || result.person || result.ordinal);
  return result;
}

module.exports = { extractEntities, RECENT_DAYS };
