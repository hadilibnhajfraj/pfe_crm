"use strict";

const crypto = require("crypto");
const { BaseAgent } = require("./baseAgent");
const { AgentError, ConfigurationError } = require("./errors");
const { ToolCallingChain } = require("../langchain/chains");
const { tokenize } = require("../utils/tokenize");
const { extractMeetingSlots, formatSlotsForInstruction, isMeetingComplete, missingMeetingFields, buildMeetingDateTimes } = require("./meetingSlotExtractor");
const {
  buildMeetingProposalAnswer,
  buildMeetingCancelledAnswer,
  buildMeetingAmbiguousAnswer,
  buildMeetingExpiredAnswer,
  buildMeetingExecutedAnswer,
  buildMissingFieldsAnswer,
} = require("../reasoning/meetingAnswerBuilder");

// AI-Business-Copilot/30_MEETING_AGENT_NO_LLM_FOR_MISSING_FIELDS.md — la
// réponse déterministe "il me manque encore : ..." (voir `_run()`) ne
// s'applique QUE quand rien n'indique une modification/annulation d'un
// événement EXISTANT (update_calendar_event/delete_calendar_event,
// mécanisme INCHANGÉ, toujours géré par le LLM/ToolCallingChain) : sinon un
// message comme "Annule ma réunion de demain" se ferait à tort répondre "il
// me manque le sujet, la date..." au lieu de suivre le flux d'annulation
// existant. Vérifié sur TOUS les messages utilisateur de la conversation
// (comme meetingSlotExtractor), pas seulement le tour courant — une
// clarification ultérieure ("Point projet", en réponse à "quel est le sujet
// de la réunion à annuler ?") ne doit pas non plus être happée à tort.
const UPDATE_OR_DELETE_INTENT_RE = /\b(modifier|modifie|changer|change|d[ée]placer|d[ée]place|reporter|reporte|annuler|annule|supprimer|supprime)\b/i;

// AI-Business-Copilot/29_MEETING_AGENT_CRM_CALENDAR_LINK.md — le Tool de
// CRÉATION passe désormais EXCLUSIVEMENT par le cycle PendingAction
// (propose -> confirme/annule -> exécute UNE FOIS, voir la classe
// ci-dessous) : le LLM ne décide plus JAMAIS lui-même d'appeler ce Tool, il
// est donc bloqué inconditionnellement s'il essaie malgré tout via
// ToolCallingChain (défense en profondeur — ne devrait normalement jamais
// être atteint). update_calendar_event/delete_calendar_event gardent
// l'ancien mécanisme (AI-Business-Copilot/28_MEETING_AGENT_CONFIRMATION_GATE.md,
// inchangé) : aucune redéfinition de leur workflow n'a été demandée/validée.
const CREATE_TOOL_NAME = "create_calendar_event";
const UPDATE_DELETE_TOOL_NAMES = new Set(["update_calendar_event", "delete_calendar_event"]);

// La phrase EXACTE que le SYSTEM_PROMPT impose déjà au modèle pour demander
// une confirmation de MODIFICATION/ANNULATION ("Confirmez-vous ... ?") — un
// signal fort et spécifique, jamais un mot générique. Sans rapport avec le
// récapitulatif de CRÉATION (désormais composé par `buildMeetingProposalAnswer`,
// jamais par le LLM — voir plus bas).
const CONFIRMATION_REQUEST_RE = /confirmez-vous/i;

// AI-Business-Copilot/29_MEETING_AGENT_CRM_CALENDAR_LINK.md — remplace
// AFFIRMATIVE_MARKERS (mot isolé, insuffisant : "je pense que oui" était
// reconnu à tort comme une confirmation puisque "oui" y figure). Deux
// niveaux : un marqueur FORT confirme quelle que soit la longueur du
// message (aucune ambiguïté possible sur "confirme"/"confirmer") ; un
// marqueur FAIBLE ("oui", "d'accord", ...) ne confirme que dans un message
// COURT (<= 2 mots après tokenisation) — "oui" seul confirme, "je pense que
// oui" (4 mots, aucun marqueur fort) ne confirme PAS. Un marqueur
// d'ANNULATION est toujours prioritaire, même mélangé à un marqueur de
// confirmation (fail-safe : jamais créer sur un signal contradictoire).
const STRONG_CONFIRM_MARKERS = ["confirme", "confirmer", "confirmé", "confirmée"];
const WEAK_CONFIRM_MARKERS = ["oui", "yes", "accord", "ok", "vas", "go"];
const WEAK_CONFIRM_MAX_TOKENS = 2;
const CANCEL_MARKERS = ["non", "annule", "annuler"];

// "cancel" | "confirm" | "ambiguous" — jamais déduit du texte que le modèle
// s'apprête à produire, uniquement du message RÉEL de l'utilisateur.
function classifyConfirmation(message) {
  const terms = tokenize(message);
  const termSet = new Set(terms);

  if (CANCEL_MARKERS.some((m) => termSet.has(m))) return "cancel";
  if (STRONG_CONFIRM_MARKERS.some((m) => termSet.has(m))) return "confirm";
  if (terms.length <= WEAK_CONFIRM_MAX_TOKENS && WEAK_CONFIRM_MARKERS.some((m) => termSet.has(m))) return "confirm";
  return "ambiguous";
}

// Rétrocompatible avec les appelants existants (voir
// test/ai.agents.meetingAgent.test.js) — délègue à classifyConfirmation().
function hasAffirmativeConfirmation(message) {
  return classifyConfirmation(message) === "confirm";
}

// Message FIXE, honnête, jamais un détail interne — renvoyé À LA PLACE d'un
// appel réel de update_calendar_event/delete_calendar_event tant que la
// confirmation textuelle n'est pas établie déterministiquement (mécanisme
// INCHANGÉ, voir AI-Business-Copilot/28_MEETING_AGENT_CONFIRMATION_GATE.md).
// Préfixe "Error: " DÉLIBÉRÉ (voir aiManager.js::wasSuccessfulCalendarWrite).
const NO_CONFIRMATION_MESSAGE =
  "Error: cette action nécessite une confirmation explicite de l'utilisateur avant d'être exécutée, qui n'a pas encore été obtenue à ce tour. Récapitule d'abord clairement l'action prévue et pose la question de confirmation (\"Confirmez-vous ... ?\") ; n'appelle ce Tool qu'après une réponse positive explicite au tour suivant.";

// AI-Business-Copilot/29_MEETING_AGENT_CRM_CALENDAR_LINK.md — la CRÉATION ne
// passe plus jamais par une décision du LLM (voir CREATE_TOOL_NAME
// ci-dessus) : si ToolCallingChain l'atteint quand même, bloqué
// inconditionnellement, quel que soit l'état de confirmation.
const CREATE_BYPASSED_MESSAGE =
  "Error: la création d'une réunion ne passe plus par cet outil — le workflow de confirmation dédié (récapitulatif -> confirmation explicite -> exécution) s'en charge automatiquement dès que toutes les informations sont réunies. N'appelle jamais ce Tool toi-même.";

// Les 4 Tools déjà réels du module googleCalendar (mcp/tools/googleCalendar/)
// — construits pour AutomationAgent (voir AUTOMATION_WORKFLOWS.md), jamais
// dupliqués ici. `get_calendar_status` en premier : un Agent qui tenterait
// `create_calendar_event` sur un compte non connecté échouerait sans
// explication utile — voir SYSTEM_PROMPT.
const ALLOWED_TOOL_NAMES = ["get_calendar_status", "create_calendar_event", "update_calendar_event", "delete_calendar_event"];

// Champs RÉELLEMENT exigés par create_calendar_event (voir
// mcp/tools/googleCalendar/createCalendarEventTool.js, Joi schema) :
// summary/startDateTime/endDateTime — RIEN d'autre n'est obligatoire.
// IMPORTANT (AI-Business-Copilot/11_MEETING_AGENT_FIX.md) : le Tool réel
// n'a PAS de champ "participants" — le prompt ne doit donc jamais demander
// ni prétendre enregistrer des participants, sous peine d'inventer une
// fonctionnalité qui n'existe pas côté serveur.
const SYSTEM_PROMPT = [
  "Tu es l'Agent Réunions/Rendez-vous/Rappels du CRM CBI Tunisia.",
  "Tu crées, modifies et annules des événements sur le calendrier Google de",
  "l'utilisateur courant, exclusivement via les Tools fournis — une réunion,",
  "un rendez-vous et un rappel personnel sont TOUS les trois représentés de",
  "la même façon (un événement calendrier), aucune différence technique.",
  "Avant de créer un événement, tu dois obtenir : le sujet (ce dont il faut",
  "se souvenir, pour un rappel), la date et l'heure de début, et la date et",
  "l'heure de fin (ou une durée permettant de la calculer — pour un simple",
  "rappel, une courte durée par défaut, ex. 15 minutes, est raisonnable).",
  "Si une ou plusieurs informations manquent, ne les invente jamais : pose",
  "UNE SEULE question à la fois pour obtenir l'information manquante",
  "suivante, jamais plusieurs questions d'un coup.",
  "Le lieu et la description sont optionnels — ne les demande que si",
  "l'utilisateur les mentionne spontanément.",
  "N'affirme jamais pouvoir enregistrer des participants : cette",
  "fonctionnalité n'existe pas dans le CRM actuel.",
  "Dès que toutes les informations sont réunies, un récapitulatif et une",
  "demande de confirmation sont générés AUTOMATIQUEMENT par le système —",
  "n'appelle JAMAIS toi-même create_calendar_event, quelle que soit la",
  "situation : ce n'est plus ton rôle.",
  "Pour modifier ou annuler un événement existant, récapitule la",
  "modification/l'annulation et demande explicitement une confirmation",
  "(\"Confirmez-vous ... ?\") avant d'appeler update_calendar_event/delete_calendar_event",
  "— n'appelle ce Tool QUE si l'utilisateur a répondu positivement à cette",
  "question, jamais avant.",
  "IMPORTANT, à dire explicitement si demandé plutôt que d'inventer une",
  "réponse : tu ne peux PAS lister les rappels/réunions déjà existants (aucun",
  "Tool ne le permet aujourd'hui) — dis-le clairement. Pour annuler un",
  "rappel/une réunion, demande son sujet et sa date pour le retrouver dans",
  "la conversation, ou explique qu'il faut le supprimer directement depuis",
  "Google Calendar si tu ne le retrouves pas.",
  "Si get_calendar_status indique un compte non connecté, dis-le clairement",
  "à l'utilisateur plutôt que de tenter la création.",
  "L'adresse Google renvoyée par get_calendar_status (si absente) concerne",
  "UNIQUEMENT l'état de connexion du compte de l'utilisateur — ce n'est",
  "jamais une information à demander à l'utilisateur, et ne la confonds",
  "jamais avec un email que l'utilisateur t'aurait lui-même donné dans la",
  "conversation.",
  "Un résumé des informations DÉJÀ extraites de cette conversation (fusionnées",
  "à partir de tous les tours précédents) t'est fourni à chaque tour : utilise-le",
  "comme la vérité, ne redemande jamais un champ qu'il indique déjà connu, et",
  "ne dis jamais qu'une information est absente si elle y figure.",
].join(" ");

/**
 * MeetingAgent — prend en charge les intentions `meetings` (réunions,
 * rendez-vous) ET `reminders` (rappels personnels — AI-Business-Copilot/16_REMINDER_ROUTING.md).
 * Un rappel n'est PAS un second système : mécaniquement, un rappel EST un
 * événement calendrier (sujet + horaire), donc le MÊME Agent, les MÊMES 4
 * Tools `googleCalendar` — jamais un Agent/Tool dupliqué. Permissions
 * ouvertes au niveau Agent : les 4 Tools eux-mêmes n'ont aucune restriction
 * de rôle (`requiredRoles: []`, scope déjà forcé à `actingUser.id` par
 * chaque Tool — jamais le calendrier d'un autre utilisateur, voir
 * googleCalendar.service.js).
 *
 * ## Accumulation des informations entre les tours (AI-Business-Copilot/27_MEETING_AGENT_SLOT_ACCUMULATION.md)
 * `BaseAgent._buildInstruction()` (baseAgent.js) réinjecte déjà l'historique
 * BRUT de la conversation ; `MeetingAgent` surcharge `_buildInstruction()`
 * pour y ajouter un état déjà fusionné, calculé DÉTERMINISTIQUEMENT (jamais
 * un second appel LLM — voir meetingSlotExtractor.js) à partir de tous les
 * messages utilisateur de la conversation.
 *
 * ## Création d'une réunion — cycle PendingAction (AI-Business-Copilot/29_MEETING_AGENT_CRM_CALENDAR_LINK.md)
 * Audité en direct (Ollama réel) : même après le garde-fou "confirmation
 * déterministe" (28_MEETING_AGENT_CONFIRMATION_GATE.md), le LLM restait la
 * seule source de vérité pour les PARAMÈTRES de la réunion au moment de la
 * confirmation — rien ne garantissait qu'il régénère exactement ce qui avait
 * été récapitulé, et aucune trace CRM n'était créée (uniquement Google
 * Calendar). Le cycle est désormais, EXACTEMENT le même schéma que
 * `AutomationAgent` (`pendingActionStore.propose/peek/consume`, voir ce
 * fichier) :
 * 1. Dès que `meetingSlotExtractor.isMeetingComplete(slots)` est vrai, l'agent
 *    — jamais le LLM — construit un `payload` structuré (voir
 *    `_buildMeetingPayload`) et le PROPOSE (`pendingActionStore.propose()`).
 *    Le récapitulatif envoyé à l'utilisateur est composé par
 *    `meetingAnswerBuilder.js` à partir de ce MÊME payload — jamais par le
 *    modèle.
 * 2. Au tour suivant, si un PendingAction est en attente, la décision
 *    (confirmer/annuler/ambigu) est déterministe (`classifyConfirmation()`),
 *    SANS appeler le LLM du tout.
 * 3. Sur confirmation : `pendingActionStore.consume()` D'ABORD (atomique —
 *    un second "oui" ne retrouve plus rien à confirmer, jamais une deuxième
 *    création), PUIS `meetingCopilotSync.service.js::createCopilotMeeting()`
 *    exécute, avec le payload STOCKÉ (jamais régénéré) : Task CRM, puis le
 *    VRAI Tool MCP `create_calendar_event` (Permission/Validation/Audit
 *    préservés), puis la liaison `CalendarEventSync`. La réponse finale est
 *    composée à partir du résultat RÉEL (jamais "créée avec succès" si
 *    Google a échoué après un CRM réussi).
 */
class MeetingAgent extends BaseAgent {
  // `createCopilotMeeting` est INJECTÉ (jamais require() ici) — voir
  // test/ai.agents.policy.test.js : aucun Agent ne doit référencer un
  // service métier CRM directement (src/services/*.service), exactement la
  // même discipline que `tools`/`chatModel`/`pendingActionStore` déjà
  // injectés. La vraie fonction (meetingCopilotSync.service.js) est câblée
  // par orchestrator/pipeline.js, jamais par ce fichier.
  constructor({ pendingActionStore, createCopilotMeeting, ...rest }) {
    super(rest);
    if (!pendingActionStore) {
      throw new ConfigurationError(`Agent "${rest.name || "meeting_agent"}" requires a 'pendingActionStore' (never create a meeting without confirmation).`);
    }
    if (!createCopilotMeeting) {
      throw new ConfigurationError(`Agent "${rest.name || "meeting_agent"}" requires a 'createCopilotMeeting' function.`);
    }
    this.pendingActionStore = pendingActionStore;
    this.createCopilotMeeting = createCopilotMeeting;
    // AI-Business-Copilot/32_MEETING_CONTEXT_AFTER_EXECUTION.md — état
    // TEMPORAIRE, local à CETTE instance d'Agent (jamais persisté, jamais
    // dans PendingActionStore — son API reste intacte) : reproduit en
    // direct, après une réunion CONFIRMÉE et créée, "Créer un rappel" (un
    // mot-clé RÉEL du catalogue, "reminders" — donc légitimement routé vers
    // meeting_agent, indépendamment de tout problème de routage) retrouvait
    // encore les slots complets de l'ANCIENNE réunion (sujet/date/heure) via
    // `extractMeetingSlots()` (cumulatif par conception, voir
    // meetingSlotExtractor.js) et re-proposait un TOUT NOUVEAU PendingAction
    // — un second Task CRM/événement Google si confirmé par erreur. Pour
    // CHAQUE conversationId, la longueur de `_pastUserMessages()` au moment
    // de la DERNIÈRE proposition dont le cycle s'est terminé (confirmée,
    // annulée OU expirée — les trois cas se retrouvent tous ici : dès que
    // `pendingActionStore.peek()` ne retrouve plus rien en tête de `_run()`,
    // voir plus bas) : les messages jusqu'à cette frontière sont désormais
    // considérés HISTORIQUES, jamais un draft actif, exactement comme
    // demandé (une réunion propose -> confirme/annule -> exécute UNE FOIS,
    // jamais rejouée automatiquement par un message sans rapport).
    this._proposedUpToByConversation = new Map();
  }

  // `pastUserMessages` = TOUS les messages utilisateur de la conversation
  // (voir _pastUserMessages()) ; ne garde que ceux envoyés APRÈS la dernière
  // proposition dont le cycle est terminé — `[]`/tout le tableau si aucune
  // frontière n'est encore connue pour cette conversation (comportement
  // strictement inchangé pour une toute première réunion).
  _freshUserMessages(pastUserMessages, conversationId) {
    const boundary = conversationId ? this._proposedUpToByConversation.get(conversationId) : null;
    if (!boundary) return pastUserMessages;
    return pastUserMessages.slice(boundary);
  }

  async _buildInstruction(message, conversationId) {
    const base = await super._buildInstruction(message, conversationId);
    const pastUserMessages = await this._pastUserMessages(conversationId);
    const slots = extractMeetingSlots([...pastUserMessages, message]);
    return `${base}${formatSlotsForInstruction(slots)}`;
  }

  async _pastUserMessages(conversationId) {
    if (!this.memory || !conversationId) return [];
    const history = await this.memory.getHistory(conversationId, { limit: this.maxHistoryMessages });
    return history.filter((m) => m.role === "user").map((m) => m.content);
  }

  async _lastAssistantMessage(conversationId) {
    if (!this.memory || !conversationId) return null;
    const history = await this.memory.getHistory(conversationId, { limit: this.maxHistoryMessages });
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "assistant") return history[i].content;
    }
    return null;
  }

  // Utilisé UNIQUEMENT pour update_calendar_event/delete_calendar_event
  // (mécanisme inchangé) — la création n'appelle plus cette méthode.
  async _hasExplicitConfirmation(message, conversationId) {
    const lastAssistant = await this._lastAssistantMessage(conversationId);
    if (!lastAssistant || !CONFIRMATION_REQUEST_RE.test(lastAssistant)) return false;
    return classifyConfirmation(message) === "confirm";
  }

  _guardWriteTools(tools, confirmedForUpdateDelete) {
    return tools.map((tool) => {
      if (tool.name === CREATE_TOOL_NAME) {
        return { name: tool.name, description: tool.description, invoke: async () => CREATE_BYPASSED_MESSAGE };
      }
      if (UPDATE_DELETE_TOOL_NAMES.has(tool.name) && !confirmedForUpdateDelete) {
        return { name: tool.name, description: tool.description, invoke: async () => NO_CONFIRMATION_MESSAGE };
      }
      return tool;
    });
  }

  _findRealTool(name) {
    return this._allowedTools().find((t) => t.name === name) || null;
  }

  // Construit le payload structuré du PendingAction — EXCLUSIVEMENT depuis
  // l'état déjà fusionné (jamais depuis un texte du LLM). `projectId` reste
  // `null` (limite de portée assumée AI-Business-Copilot/29_..._LINK.md :
  // aucune résolution automatique nom -> ID de projet dans cette passe,
  // jamais touché RBAC/Project Agent) ; `projectName` reste une information
  // libre, jamais une FK validée.
  _buildMeetingPayload(slots) {
    const dates = buildMeetingDateTimes(slots);
    if (!dates) return null;
    return {
      projectId: null,
      projectName: slots.subject || null,
      email: slots.email || null,
      summary: slots.subject || "Réunion",
      description: slots.email ? `Email mentionné : ${slots.email}` : null,
      startDateTime: dates.startDateTime,
      endDateTime: dates.endDateTime,
    };
  }

  async _proposeMeeting(slots, user, conversationId, proposedUpTo) {
    const payload = this._buildMeetingPayload(slots);
    if (!payload) return null; // garde-fou défensif — ne devrait pas arriver si isMeetingComplete(slots)

    const action = {
      id: crypto.randomUUID(),
      type: "create_meeting",
      conversationId,
      actingUserId: user && user.id,
      payload,
    };
    this.pendingActionStore.propose(conversationId, action);
    // AI-Business-Copilot/32_MEETING_CONTEXT_AFTER_EXECUTION.md — voir le
    // constructeur : fige la frontière MAINTENANT (au moment de la
    // proposition, pas de sa résolution) — couvre uniformément confirmée/
    // annulée/expirée, les trois cas se traduisant tous par "plus aucun
    // PendingAction actif au prochain _run()", sans avoir à distinguer
    // laquelle des trois s'est produite.
    if (conversationId) this._proposedUpToByConversation.set(conversationId, proposedUpTo);

    return {
      answer: buildMeetingProposalAnswer(action),
      citations: [],
      toolSteps: [],
      pendingAction: this._pendingActionView(action),
    };
  }

  // Mission P1.2 — même normalisation, même discipline exacte que
  // CommercialAgent::_pendingActionView (voir ce fichier) : projection en
  // lecture seule pour l'API/Flutter, jamais consommée par l'exécution
  // réelle (_resolvePendingMeeting continue de lire EXCLUSIVEMENT
  // `action.payload`, jamais ce `steps`/`input`).
  _pendingActionView(action) {
    const { payload } = action;
    return {
      id: action.id,
      steps: [
        {
          tool: CREATE_TOOL_NAME,
          input: {
            summary: payload.summary,
            startDateTime: payload.startDateTime,
            endDateTime: payload.endDateTime,
            ...(payload.description ? { description: payload.description } : {}),
          },
          reason: `Créer la réunion "${payload.summary}"`,
        },
      ],
    };
  }

  // La SEULE méthode de cette classe qui crée réellement une réunion — et
  // uniquement parce qu'une confirmation explicite vient d'être classifiée
  // déterministiquement (jamais depuis le texte du LLM).
  async _resolvePendingMeeting(pending, message, conversationId) {
    const decision = classifyConfirmation(message);

    if (decision === "cancel") {
      this.pendingActionStore.consume(conversationId);
      return { answer: buildMeetingCancelledAnswer(pending.payload), citations: [], toolSteps: [], pendingAction: null };
    }

    if (decision !== "confirm") {
      // AMBIGU ("je pense que oui", "peut-être", ...) : ne PAS consommer —
      // la proposition reste active, un "oui" clair au tour suivant doit
      // encore pouvoir la confirmer.
      return { answer: buildMeetingAmbiguousAnswer(), citations: [], toolSteps: [], pendingAction: this._pendingActionView(pending) };
    }

    // CONFIRMÉ : consume() D'ABORD, atomique — un second "oui" au tour
    // suivant ne retrouve plus rien à confirmer (empêche toute double
    // création, voir pendingActionStore.js).
    const action = this.pendingActionStore.consume(conversationId);
    if (!action) {
      return { answer: buildMeetingExpiredAnswer(), citations: [], toolSteps: [], pendingAction: null };
    }

    const tool = this._findRealTool(CREATE_TOOL_NAME);
    if (!tool) {
      return { answer: "Désolé, l'outil de création de réunion n'est pas disponible pour le moment.", citations: [], toolSteps: [], pendingAction: null };
    }

    const result = await this.createCopilotMeeting({ actingUserId: action.actingUserId, payload: action.payload, tool });
    const toolSteps = [{ tool: CREATE_TOOL_NAME, input: action.payload, output: result }];
    return { answer: buildMeetingExecutedAnswer(result), citations: [], toolSteps, pendingAction: null };
  }

  async _run({ message, user, conversationId }) {
    const pending = this.pendingActionStore.peek(conversationId);
    if (pending && pending.type === "create_meeting") {
      return this._resolvePendingMeeting(pending, message, conversationId);
    }

    const pastUserMessages = await this._pastUserMessages(conversationId);
    const freshUserMessages = this._freshUserMessages(pastUserMessages, conversationId);
    const allMessages = [...freshUserMessages, message];
    const slots = extractMeetingSlots(allMessages);
    if (isMeetingComplete(slots)) {
      const proposed = await this._proposeMeeting(slots, user, conversationId, pastUserMessages.length);
      if (proposed) return proposed;
    }

    // AI-Business-Copilot/30_MEETING_AGENT_NO_LLM_FOR_MISSING_FIELDS.md —
    // reproduit en direct (Ollama réel) : pour "Programmer une réunion" seul
    // (aucune information), l'agent appelait encore ToolCallingChain/Ollama
    // pour la SEULE tâche de demander le sujet — un aller-retour LLM
    // (~30s) pour une réponse déjà entièrement déterminable depuis l'état
    // fusionné. Tant qu'il ne s'agit PAS d'une modification/annulation d'un
    // événement existant (voir UPDATE_OR_DELETE_INTENT_RE ci-dessus), la
    // liste des champs manquants (missingMeetingFields, jamais réinventée)
    // est renvoyée directement — zéro appel LLM, zéro Tool.
    const looksLikeUpdateOrDelete = allMessages.some((m) => UPDATE_OR_DELETE_INTENT_RE.test(m));
    if (!looksLikeUpdateOrDelete) {
      return { answer: buildMissingFieldsAnswer(missingMeetingFields(slots)), citations: [], toolSteps: [] };
    }

    // Flux LLM existant : modification/annulation d'un événement existant
    // (update/delete, mécanisme de confirmation inchangé).
    const confirmedForUpdateDelete = await this._hasExplicitConfirmation(message, conversationId);
    const tools = this._guardWriteTools(this._allowedTools(), confirmedForUpdateDelete);
    const instruction = await this._buildInstruction(message, conversationId);

    if (tools.length > 0) {
      const chain = new ToolCallingChain({
        chatModel: this.chatModel,
        tools,
        maxToolCalls: this.maxToolCalls,
        promptInjectionGuard: this.promptInjectionGuard,
        requireToolUse: this.requireToolUse,
      });
      const steps = [{ type: "chain", chain, outputKey: "result", buildInput: () => ({ instruction }) }];
      const state = await this.workflowEngine.run(steps, {});
      const { answer, steps: toolSteps = [] } = state.result;
      return { answer, citations: [], toolSteps };
    }

    if (this.qaChain) {
      const result = await this.qaChain.invoke({ question: message, user, scope: { conversationId } });
      return { answer: result.answer, citations: result.citations || [], toolSteps: [] };
    }

    throw new AgentError(`Agent "${this.name}" has neither an allowed Tool nor a qaChain to answer with.`);
  }
}

function createMeetingAgent({ chatModel, tools = [], workflowEngine, qaChain = null, memory = null, maxToolCalls, maxHistoryMessages, promptInjectionGuard = null, pendingActionStore, createCopilotMeeting }) {
  return new MeetingAgent({
    name: "meeting_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["meetings", "reminders"],
    requiredRoles: [],
    allowedEmails: [],
    chatModel,
    tools,
    allowedToolNames: ALLOWED_TOOL_NAMES,
    workflowEngine,
    qaChain,
    memory,
    maxToolCalls,
    maxHistoryMessages,
    promptInjectionGuard,
    pendingActionStore,
    createCopilotMeeting,
  });
}

module.exports = {
  createMeetingAgent,
  MeetingAgent,
  ALLOWED_TOOL_NAMES,
  SYSTEM_PROMPT,
  CREATE_TOOL_NAME,
  UPDATE_DELETE_TOOL_NAMES,
  CONFIRMATION_REQUEST_RE,
  STRONG_CONFIRM_MARKERS,
  WEAK_CONFIRM_MARKERS,
  CANCEL_MARKERS,
  classifyConfirmation,
  hasAffirmativeConfirmation,
  NO_CONFIRMATION_MESSAGE,
  CREATE_BYPASSED_MESSAGE,
  UPDATE_OR_DELETE_INTENT_RE,
};
