"use strict";

const { extractDate, extractEmail } = require("./meetingSlotExtractor");

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "CORRIGER
// LES ACTIONS COMMERCIALES DEPUIS LA LISTE DES CONTACTS".
//
// Même discipline que meetingSlotExtractor.js : extraction 100%
// déterministe (regex, jamais un second appel LLM) d'un NOM DE CONTACT
// mentionné dans une demande d'action ("relancer X pour le 21/08",
// "affecter X à commercial@email.com", ...). Le nom capturé n'est JAMAIS
// utilisé tel quel comme identifiant — commercialAgent.js le résout
// ENSUITE contre la vraie base via get_my_commercial_contacts (recherche
// serveur), exactement comme ProjectAgent résout un nom de projet/
// propriétaire (voir projectAgent.js::_matchProjectsByName).
//
// Portée volontairement étroite : 5 formes vérifiées SANS collision contre
// le corpus de validation (aucun scénario "projects"/"maintenance"/
// "automation" existant ne contient à la fois un verbe d'affectation ET une
// adresse email — voir test/ai.agents.commercialActionSlotExtractor.test.js).
// Essayées dans cet ordre ; la première qui capture un nom l'emporte :
//   1. "(le) contact X (pour|à|au|avec|et ...)"
//   2. "affecter/affecte/assigner/assigne X à/au ..."      (sans "contact")
//   3. "relancer X pour ..."                                (sans "contact")
//   4. "... pour X"                                         (X en fin, ex. "programme une relance demain pour X")
//   5. "(commercial) responsable de X"
const CONTACT_KEYWORD_RE = /\bcontact\s+([A-ZÀ-Ý][^?.!,;]*?)(?=\s+(?:pour|à|au|avec|et)\b|[.,;!?]|$)/i;
const AFFECT_TO_RE = /\b(?:affecter|affecte|assigner|assigne)\s+(?:le\s+contact\s+)?([A-ZÀ-Ý][^?.!,;]*?)\s+(?:à|au)\s+/i;
const RELANCER_POUR_RE = /\brelancer\s+(?:le\s+contact\s+)?([A-ZÀ-Ý][^?.!,;]*?)\s+pour\b/i;
const POUR_NAME_RE = /\bpour\s+([A-ZÀ-Ý][^?.!,;]*?)(?:\s+(?:et|à|au)\b|[.,;!?]|$)/i;
const RESPONSABLE_DE_RE = /\b(?:commercial\s+responsable\s+de|responsable\s+de)\s+([A-ZÀ-Ý][^?.!,;]*)/i;

const NAME_PATTERNS = [CONTACT_KEYWORD_RE, AFFECT_TO_RE, RELANCER_POUR_RE, POUR_NAME_RE, RESPONSABLE_DE_RE];

// Filet de sécurité : un nom de contact réel ne s'étend pas sur une phrase
// entière (même discipline que ProjectAgent::_extractOwnerName/_extractProjectName).
const MAX_NAME_TOKENS = 8;

function extractContactName(text) {
  for (const re of NAME_PATTERNS) {
    const m = text.match(re);
    if (m && m[1]) {
      const candidate = m[1].trim().replace(/\s+/g, " ");
      if (candidate && candidate.split(" ").length <= MAX_NAME_TOKENS) return candidate;
    }
  }
  return null;
}

function emptyActionSlots() {
  return { contactName: null, dateRelance: null, commercialEmail: null };
}

// Fusionne les champs extraits de CHAQUE message utilisateur, dans l'ordre
// chronologique — même principe cumulatif que extractMeetingSlots() : un
// champ déjà connu n'est jamais effacé par un tour suivant qui ne le
// mentionne pas (permet de répondre "quelle date ?" puis de compléter au
// tour suivant sans reperdre le nom du contact déjà identifié).
function extractCommercialActionSlots(userMessages, referenceDate = new Date()) {
  const slots = emptyActionSlots();
  for (const text of userMessages || []) {
    if (!text || typeof text !== "string") continue;

    const name = extractContactName(text);
    if (name) slots.contactName = name;

    const date = extractDate(text, referenceDate);
    if (date) slots.dateRelance = date;

    const email = extractEmail(text);
    if (email) slots.commercialEmail = email;
  }
  return slots;
}

// Un contact NOMMÉ est le seul signal structurel fiable qu'il s'agit d'une
// demande d'ACTION plutôt que d'une question de lecture (voir
// commercialAgent.js — aucune des formulations READ existantes, "Quels
// clients dois-je relancer ?" etc., ne nomme jamais un contact précis).
function isCommercialActionRequest(slots) {
  return Boolean(slots && slots.contactName);
}

module.exports = {
  extractCommercialActionSlots,
  emptyActionSlots,
  isCommercialActionRequest,
  extractContactName,
};
