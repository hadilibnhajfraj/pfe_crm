"use strict";

const { tokenize } = require("../utils/tokenize");
const { DEFAULT_INTENT_CATALOG } = require("./intentCatalog");
const { CORRECTION_MARKERS } = require("./conversationContextResolver");
// AI-Business-Copilot/27_MEETING_AGENT_SLOT_ACCUMULATION.md — réutilisé (pas
// dupliqué) : le MÊME heuristique "sujet" que meeting_agent utilise déjà
// pour fusionner ses propres informations (voir meetingSlotExtractor.js).
// Reproduit en direct (Ollama réel) : « sujet : réunion projet cbi10 » (un
// tour qui ne répond QUE le sujet, sans email/date/heure) échappait à
// `looksLikeSlotAnswer` — aucun des 3 signaux existants ne le reconnaît — et
// se faisait reclasser vers `projects` (mot-clé "projet") sans jamais être
// retenu par le repli confiance (le mot-clé du catalogue donne une victoire
// nette, pas une égalité). Import orchestrator -> agents déjà établi
// ailleurs dans ce dossier (voir orchestrator/pipeline.js -> ../agents),
// jamais un cycle (meetingSlotExtractor.js ne dépend que de dayjs).
const { extractSubject } = require("../agents/meetingSlotExtractor");
// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "CORRIGER
// LES ACTIONS COMMERCIALES DEPUIS LA LISTE DES CONTACTS". Réutilisé (pas
// dupliqué) : la MÊME classification confirmer/annuler/ambigu que
// MeetingAgent utilise déjà pour son propre cycle PendingAction — voir
// `looksLikeBareConfirmation` ci-dessous.
const { classifyConfirmation } = require("../agents/meetingAgent");

// AI-Business-Copilot/26_MEETING_AGENT_CONTINUITY.md
//
// ## Le problème reproduit en direct
// `IntentDetector` reclasse CHAQUE message indépendamment — aucune mémoire
// de "quel Agent est en train de collecter des informations" n'existe entre
// deux tours. Au milieu d'une collecte meeting_agent (email/sujet/date/
// heure), un message de réponse comme "...pour le projet cbi10 le
// 17/08/2026 à 12h" contient le mot "projet" et se fait reclasser vers
// `projects` → project_agent → `requireToolUse` (garde anti-fabrication,
// intacte, non modifiée ici) refuse honnêtement de répondre puisqu'aucune
// donnée CRM n'a de sens pour cette question → fallback visible par
// l'utilisateur.
//
// ## Pourquoi la seule confiance ne suffit pas
// Deux messages peuvent obtenir EXACTEMENT la même confiance (0.9, un
// gagnant net sur "projet") tout en devant être traités différemment :
// - "...pour le projet cbi10 le 17/08/2026 à 12h" → doit RESTER
//   meeting_agent (répond aux informations demandées).
// - "finalement je veux plutôt voir mes projets critiques" → doit
//   BASCULER vers project_agent (nouveau sujet explicite).
// Se fier uniquement à un mot ("projet") ou uniquement à la confiance ne
// distingue pas ces deux cas — voir plus bas les deux signaux combinés.
//
// ## Deux signaux, jamais un simple mot-clé
// 1. **Le message RESSEMBLE à une réponse aux informations demandées** —
//    présence d'un email, d'une date, d'une heure OU d'un sujet reconnu par
//    `meetingSlotExtractor.js::extractSubject` (les champs RÉELS que
//    meeting_agent demande, voir meetingAgent.js::SYSTEM_PROMPT — un tour
//    qui ne répond QUE "sujet : ..." doit rester aussi collant qu'un tour
//    qui ne répond qu'un email/une date, voir AI-Business-Copilot/
//    27_MEETING_AGENT_SLOT_ACCUMULATION.md) : un signal structurel, pas un
//    mot-clé isolé.
// 2. **Aucun marqueur de correction/reformulation explicite** — réutilise
//    EXACTEMENT `CORRECTION_MARKERS` déjà défini et testé dans
//    `conversationContextResolver.js` ("plutôt", "finalement",
//    "correction", "non" en tête de phrase) : un utilisateur qui change
//    explicitement de sujet le signale déjà avec ce vocabulaire, jamais
//    réinterprété différemment ici.
// Si le signal 1 est présent, OU si le signal 2 est absent alors que la
// nouvelle intention n'est pas confiante (< 0.9, voir intentConfidence.js),
// le sujet actif est conservé. Sinon, le routage normal (IntentDetector +
// AgentRouter, tous deux inchangés) reprend la main sans aucune
// intervention de ce module.
//
// ## Portée volontairement étroite
// Seules les intentions marquées `conversational: true` dans le catalogue
// (aujourd'hui : `meetings`/`reminders`, voir intentCatalog.js) peuvent
// devenir un "sujet actif" au sens de ce module — une question
// documentaire ou une question projet ordinaire (`documentation_question`/
// `projects`) ne "colle" JAMAIS à la conversation suivante, exactement
// comme demandé ("le TEST 3 doit rester project_agent").
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const DATE_PATTERN = /\b\d{1,2}[/\-.]\d{1,2}([/\-.]\d{2,4})?\b|\b(demain|aujourd'?hui|après[- ]demain|apres[- ]demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i;
const TIME_PATTERN = /\b\d{1,2}\s*[h:]\s*\d{0,2}\b/i;

// Seuil de confiance à partir duquel un NOUVEAU sujet est considéré assez
// net pour l'emporter même sans marqueur de correction explicite — même
// palier "FORTE"/"PRIORITÉ PROCÉDURALE" que intentConfidence.js (0.9/0.95),
// jamais un nombre inventé pour ce module précis.
const CONFIDENT_TOPIC_CHANGE_THRESHOLD = 0.9;

function looksLikeSlotAnswer(message) {
  return EMAIL_PATTERN.test(message) || DATE_PATTERN.test(message) || TIME_PATTERN.test(message) || Boolean(extractSubject(message));
}

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "CORRIGER
// LES ACTIONS COMMERCIALES DEPUIS LA LISTE DES CONTACTS". Un troisième
// signal structurel, au même titre que `looksLikeSlotAnswer` : un message
// COURT qui n'est RIEN d'autre qu'une confirmation/annulation ("oui",
// "confirme", "non", "annule"...) EST, par construction, une réponse à la
// proposition en attente du sujet actif — jamais une nouvelle demande. Sans
// ce signal, "confirme" (mot-clé RÉEL, sans concurrent, de l'intention
// `automation` — voir intentCatalog.js) se faisait reclasser vers
// `automation_agent` au lieu de rester sur l'Agent qui a RÉELLEMENT la
// proposition en attente (meeting_agent/commercial_agent) — corrige au
// passage le même risque pour "non"/"annule" (jusqu'ici court-circuités par
// `_hasCorrectionMarker`, qui traite tout "non" en tête de message comme un
// changement de sujet, y compris pour annuler une proposition en cours).
// Borné à un message COURT (même seuil que `WEAK_CONFIRM_MAX_TOKENS` de
// meetingAgent.js) : un "non" perdu au milieu d'une phrase plus longue qui
// change réellement de sujet reste traité comme avant (jamais ce signal).
const BARE_CONFIRMATION_MAX_TOKENS = 3;

function looksLikeBareConfirmation(message) {
  if (tokenize(message).length > BARE_CONFIRMATION_MAX_TOKENS) return false;
  const decision = classifyConfirmation(message);
  return decision === "confirm" || decision === "cancel";
}

class ConversationContinuityResolver {
  constructor({ catalog = DEFAULT_INTENT_CATALOG, correctionMarkers = CORRECTION_MARKERS } = {}) {
    this.catalogByKey = new Map(catalog.map((entry) => [entry.key, entry]));
    this.correctionMarkers = correctionMarkers.map((m) => m.toLowerCase());
  }

  _hasCorrectionMarker(message) {
    const terms = tokenize(message);
    const termSet = new Set(terms);
    return this.correctionMarkers.some((marker) => termSet.has(marker)) || terms[0] === "non";
  }

  // `freshIntent` = ce que IntentDetector.detect() vient de résoudre pour
  // CE tour. `activeTopic` = ConversationManager.getCurrentTopic(conversationId)
  // (peut survivre au-delà de la fenêtre d'historique — voir
  // conversationManager.js). Retourne soit `freshIntent` INCHANGÉ (aucune
  // intervention), soit un intent reconstruit depuis le catalogue pour le
  // sujet actif — jamais un intent inventé, toujours une entrée réelle.
  resolve({ message, freshIntent, activeTopic }) {
    if (!activeTopic) return freshIntent;
    const activeEntry = this.catalogByKey.get(activeTopic);
    if (!activeEntry || !activeEntry.conversational) return freshIntent;
    if (freshIntent.name === activeTopic) return freshIntent;

    const hasCorrection = this._hasCorrectionMarker(message);
    const shouldStay = looksLikeSlotAnswer(message) || looksLikeBareConfirmation(message) || (!hasCorrection && freshIntent.confidence < CONFIDENT_TOPIC_CHANGE_THRESHOLD);
    if (!shouldStay) return freshIntent;

    return {
      name: activeEntry.key,
      moduleKey: activeEntry.moduleKey,
      requiresRag: activeEntry.requiresRag,
      requiresTools: activeEntry.requiresTools,
      description: activeEntry.description,
      requiredRoles: activeEntry.requiredRoles || [],
      allowedEmails: activeEntry.allowedEmails || [],
      relatedModules: activeEntry.relatedModules || [],
      conversational: true,
      confidence: freshIntent.confidence,
      entities: freshIntent.entities,
      ambiguous: false,
      alternateIntent: null,
      continuedFrom: freshIntent.name,
    };
  }
}

module.exports = { ConversationContinuityResolver, looksLikeSlotAnswer, looksLikeBareConfirmation, CONFIDENT_TOPIC_CHANGE_THRESHOLD };
