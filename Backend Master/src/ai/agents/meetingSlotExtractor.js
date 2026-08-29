"use strict";

const dayjs = require("dayjs");

// AI-Business-Copilot/27_MEETING_AGENT_SLOT_ACCUMULATION.md
//
// ## Le problème reproduit en direct (avec le VRAI modèle Ollama qwen3:8b)
// meeting_agent n'a jamais eu d'état structuré : à chaque tour,
// `BaseAgent._buildInstruction()` (baseAgent.js) se contente de coller le
// texte brut de l'historique de conversation devant le nouveau message, et
// laisse le modèle de langage seul responsable de relire TOUT ce texte et
// d'en reconstruire, de zéro, l'état complet de la réunion (email/sujet/
// date/heures/durée) — à chaque tour, sans aide. Vérifié en direct : un
// message tour 2 contenant explicitement une date, une heure et un email
// ("hadil.ibnhajfraj@gmail.com et programmer le projet cbi10 pour une date
// le 17/08/2026 à 12h") a quand même produit une réponse affirmant que la
// date/l'heure manquaient encore — le modèle local (8B, contrainte de
// taille) ne recombine pas fiablement un état à partir d'un historique brut,
// même court.
//
// ## La correction : extraction déterministe + fusion cumulative
// Ce module ne remplace PAS le LLM (qui continue de décider quoi répondre,
// quand appeler un Tool, comment demander une confirmation — voir
// meetingAgent.js) : il calcule un état FIABLE, déterministe (regex, jamais
// un second appel LLM), à partir de TOUS les messages utilisateur de la
// conversation (passés + le tour courant), et le fournit au modèle comme un
// fait déjà établi plutôt que comme quelque chose qu'il doit lui-même
// redéduire. "Cumulatif" veut dire : un champ trouvé à un tour N reste connu
// aux tours suivants même s'il n'est pas répété — jamais réinitialisé à
// `null` simplement parce qu'absent d'un message plus récent (voir
// `extractMeetingSlots`).
//
// ## Portée volontairement étroite
// Couvre exactement les formats démontrés nécessaires par les scénarios
// obligatoires (dates numériques jj/mm/aaaa, dates en toutes lettres "17
// août"[ aaaa], "demain"/"aujourd'hui", heures "12h"/"12h30"/"12:30",
// "midi"/"minuit", un email, un sujet explicite ou une mention "projet
// X") — jamais une tentative de parser exhaustif du langage naturel. Un
// champ non reconnu reste `null`, JAMAIS deviné (voir `extractDuration`/
// `extractEndTime`, déclenchés uniquement par un marqueur explicite, pour ne
// jamais confondre une heure de début avec une heure de fin par erreur).

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

const EXPLICIT_SUBJECT_RE = /\bsujet\s*[:\-]?\s*(.+?)(?:[.,;]|$)/i;
const PROJECT_MENTION_RE = /\bprojet\s+([a-zA-Z0-9][a-zA-Z0-9\-_]*)/i;

const NUMERIC_DATE_RE = /\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/;

const FRENCH_MONTHS = {
  janvier: 1,
  février: 2,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  août: 8,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  décembre: 12,
  decembre: 12,
};
const FRENCH_DATE_RE = new RegExp(`\\b(\\d{1,2})\\s+(${Object.keys(FRENCH_MONTHS).join("|")})\\b(?:\\s+(\\d{4}))?`, "i");

const RELATIVE_DATE_RE = /\b(aujourd'?hui|après[- ]demain|apres[- ]demain|demain)\b/i;

const TIME_HM_RE = /\b(\d{1,2})\s*[h:]\s*(\d{1,2})?\b/i;
const MIDI_RE = /\bmidi\b/i;
const MINUIT_RE = /\bminuit\b/i;

const DURATION_RE = /\bdur[ée]e\s*[:\-]?\s*(\d+)\s*(heures?|h\b|minutes?|min)/i;
const END_MARKER_RE = /\b(heure de fin|jusqu'?à|se termine|fin\s*[:\-])/i;

// Un même message peut porter un début ET une fin ("...à 12h, jusqu'à
// 13h") : sans ce découpage, `END_MARKER_RE.test()` sur le texte ENTIER
// ferait passer le début (12h) pour une fin, perdant l'heure de début.
// Tout ce qui précède le marqueur reste "début" ; tout ce qui le suit (marqueur
// inclus) est "fin" — jamais l'inverse.
function splitOnEndMarker(text) {
  const m = text.match(END_MARKER_RE);
  if (!m) return { startSegment: text, endSegment: null };
  return { startSegment: text.slice(0, m.index), endSegment: text.slice(m.index) };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Une date jj/mm sans année tombée dans le passé (par rapport à
// `referenceDate`) désigne sa PROCHAINE occurrence future, jamais une date
// déjà passée — comportement attendu d'un agent qui PROGRAMME une réunion.
function resolveYearForDayMonth(day, month, referenceDate) {
  const ref = dayjs(referenceDate);
  let candidate = dayjs(`${ref.year()}-${pad2(month)}-${pad2(day)}`);
  if (candidate.isValid() && candidate.isBefore(ref, "day")) {
    candidate = candidate.add(1, "year");
  }
  return candidate;
}

function extractNumericDate(text, referenceDate) {
  const m = text.match(NUMERIC_DATE_RE);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year = m[3] ? Number(m[3]) : null;
  if (year !== null && year < 100) year += 2000;
  const d = year ? dayjs(`${year}-${pad2(month)}-${pad2(day)}`) : resolveYearForDayMonth(day, month, referenceDate);
  return d.isValid() ? d.format("YYYY-MM-DD") : null;
}

function extractFrenchDate(text, referenceDate) {
  const m = text.match(FRENCH_DATE_RE);
  if (!m) return null;
  const day = Number(m[1]);
  const month = FRENCH_MONTHS[m[2].toLowerCase()];
  const year = m[3] ? Number(m[3]) : null;
  const d = year ? dayjs(`${year}-${pad2(month)}-${pad2(day)}`) : resolveYearForDayMonth(day, month, referenceDate);
  return d.isValid() ? d.format("YYYY-MM-DD") : null;
}

function extractRelativeDate(text, referenceDate) {
  const m = text.match(RELATIVE_DATE_RE);
  if (!m) return null;
  const word = m[1].toLowerCase().replace("’", "'");
  const ref = dayjs(referenceDate);
  if (word.startsWith("aujourd")) return ref.format("YYYY-MM-DD");
  if (word.startsWith("après") || word.startsWith("apres")) return ref.add(2, "day").format("YYYY-MM-DD");
  return ref.add(1, "day").format("YYYY-MM-DD");
}

function extractDate(text, referenceDate) {
  return extractNumericDate(text, referenceDate) || extractFrenchDate(text, referenceDate) || extractRelativeDate(text, referenceDate);
}

function extractTime(text) {
  if (MIDI_RE.test(text)) return "12:00";
  if (MINUIT_RE.test(text)) return "00:00";
  const m = text.match(TIME_HM_RE);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  return `${pad2(hour)}:${pad2(minute)}`;
}

function extractEmail(text) {
  const m = text.match(EMAIL_RE);
  return m ? m[0] : null;
}

function extractSubject(text) {
  const explicit = text.match(EXPLICIT_SUBJECT_RE);
  if (explicit && explicit[1] && explicit[1].trim()) return explicit[1].trim();
  const project = text.match(PROJECT_MENTION_RE);
  if (project) return `projet ${project[1]}`;
  return null;
}

function extractDuration(text) {
  const m = text.match(DURATION_RE);
  if (!m) return null;
  const value = Number(m[1]);
  const unit = /^h/i.test(m[2]) ? "heures" : "minutes";
  return `${value} ${unit}`;
}

function emptySlots() {
  return { email: null, subject: null, startDate: null, startTime: null, endDate: null, endTime: null, duration: null };
}

// Fusionne les champs extraits de CHAQUE message utilisateur, dans l'ordre
// chronologique — un champ déjà connu n'est JAMAIS effacé par un tour
// suivant qui ne le mentionne pas (cumulatif) ; il peut en revanche être mis
// à jour si le même champ est mentionné à nouveau (l'utilisateur corrige/
// précise). `referenceDate` (défaut : maintenant) sert uniquement à
// résoudre une date relative ("demain") ou une date jj/mm sans année.
function extractMeetingSlots(userMessages, referenceDate = new Date()) {
  const slots = emptySlots();
  for (const text of userMessages || []) {
    if (!text || typeof text !== "string") continue;

    const email = extractEmail(text);
    if (email) slots.email = email;

    const subject = extractSubject(text);
    if (subject) slots.subject = subject;

    const duration = extractDuration(text);
    if (duration) slots.duration = duration;

    const { startSegment, endSegment } = splitOnEndMarker(text);

    const startDate = extractDate(startSegment, referenceDate);
    const startTime = extractTime(startSegment);
    if (startDate) slots.startDate = startDate;
    if (startTime) slots.startTime = startTime;

    if (endSegment) {
      const endDate = extractDate(endSegment, referenceDate);
      const endTime = extractTime(endSegment);
      if (endDate) slots.endDate = endDate;
      if (endTime) slots.endTime = endTime;
    }
  }
  return slots;
}

// Champs RÉELLEMENT requis (voir meetingAgent.js::SYSTEM_PROMPT) : sujet +
// début + (fin OU durée) — jamais l'email (informatif seulement, voir
// formatSlotsForInstruction). Source UNIQUE de cette règle — réutilisée par
// `isMeetingComplete`/`formatSlotsForInstruction` ET par
// meetingAgent.js::MeetingAgent (décider quand proposer un PendingAction),
// jamais dupliquée.
function missingMeetingFields(slots) {
  const missing = [];
  if (!slots.subject) missing.push("le sujet");
  if (!slots.startDate) missing.push("la date de la réunion");
  if (!slots.startTime) missing.push("l'heure de début");
  if (!slots.endTime && !slots.duration) missing.push("l'heure de fin (ou une durée)");
  return missing;
}

function isMeetingComplete(slots) {
  return missingMeetingFields(slots).length === 0;
}

function combineDateTime(date, time) {
  if (!date || !time) return null;
  return `${date}T${time}:00`;
}

function parseDurationMinutes(durationStr) {
  const m = String(durationStr || "").match(/(\d+)\s*(heures?|minutes?)/i);
  if (!m) return null;
  const value = Number(m[1]);
  return /^heure/i.test(m[2]) ? value * 60 : value;
}

// AI-Business-Copilot/29_MEETING_AGENT_CRM_CALENDAR_LINK.md — construit les
// deux horodatages (`startDateTime`/`endDateTime`, format que
// create_calendar_event exige déjà — voir createCalendarEventTool.js)
// EXCLUSIVEMENT à partir de l'état déjà fusionné, jamais du texte du LLM.
// Consommé par MeetingAgent._proposeMeeting() pour construire le payload du
// PendingAction UNE SEULE fois, avant toute confirmation — jamais
// recalculé au moment de l'exécution. Retourne `null` si `slots` n'est pas
// complet (voir `isMeetingComplete`) — l'appelant ne doit jamais y arriver
// dans ce cas, ce n'est qu'un garde-fou défensif.
function buildMeetingDateTimes(slots) {
  const startDateTime = combineDateTime(slots.startDate, slots.startTime);
  if (!startDateTime) return null;

  if (slots.endDate || slots.endTime) {
    const endDateTime = combineDateTime(slots.endDate || slots.startDate, slots.endTime || slots.startTime);
    if (endDateTime) return { startDateTime, endDateTime };
  }
  if (slots.duration) {
    const minutes = parseDurationMinutes(slots.duration);
    if (minutes) {
      const endDateTime = dayjs(startDateTime).add(minutes, "minute").format("YYYY-MM-DDTHH:mm:ss");
      return { startDateTime, endDateTime };
    }
  }
  return null;
}

// Traduit l'état déjà fusionné en un bloc de texte injecté dans
// l'instruction envoyée au modèle (voir meetingAgent.js::MeetingAgent) —
// jamais un second appel LLM, un simple résumé déterministe que le modèle
// n'a plus qu'à respecter tel quel plutôt qu'à redéduire.
function formatSlotsForInstruction(slots) {
  const known = [];
  if (slots.email) known.push(`- Email mentionné par l'utilisateur : ${slots.email} (informatif seulement — jamais un champ "participant", cette fonctionnalité n'existe pas dans le Tool réel)`);
  if (slots.subject) known.push(`- Sujet : ${slots.subject}`);
  if (slots.startDate) known.push(`- Date de début : ${slots.startDate}`);
  if (slots.startTime) known.push(`- Heure de début : ${slots.startTime}`);
  if (slots.endDate) known.push(`- Date de fin : ${slots.endDate}`);
  if (slots.endTime) known.push(`- Heure de fin : ${slots.endTime}`);
  if (slots.duration) known.push(`- Durée : ${slots.duration}`);

  const missing = missingMeetingFields(slots);

  const lines = [
    "\n\nInformations déjà extraites de cette conversation pour cette réunion (déjà fusionnées à partir de TOUS les tours précédents — ne les redemande JAMAIS, ne dis JAMAIS qu'elles sont absentes) :",
    known.length ? known.join("\n") : "(aucune pour le moment)",
  ];
  if (missing.length) {
    lines.push(`\nInformations encore réellement manquantes, à demander UNE SEULE à la fois : ${missing.join(", ")}.`);
  } else {
    // AI-Business-Copilot/29_MEETING_AGENT_CRM_CALENDAR_LINK.md — le modèle
    // ne cherche/n'appelle plus jamais create_calendar_event lui-même
    // (voir meetingAgent.js::MeetingAgent._run) : dès que tout est connu,
    // c'est l'agent — pas le LLM — qui propose un PendingAction et compose
    // le récapitulatif+confirmation. Ce texte ne devrait donc plus jamais
    // atteindre le modèle en pratique ; conservé par prudence si jamais cet
    // état est atteint par un autre chemin.
    lines.push("\nToutes les informations requises sont connues.");
  }
  return lines.join("\n");
}

module.exports = {
  extractMeetingSlots,
  formatSlotsForInstruction,
  missingMeetingFields,
  isMeetingComplete,
  buildMeetingDateTimes,
  emptySlots,
  // Exportées pour les tests unitaires ciblés (voir
  // test/ai.agents.meetingSlotExtractor.test.js) — jamais réimplémentées
  // ailleurs.
  extractEmail,
  extractSubject,
  extractDate,
  extractTime,
  extractDuration,
};
