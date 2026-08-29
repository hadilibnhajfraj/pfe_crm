"use strict";

const { BaseAgent } = require("./baseAgent");
const { ConfigurationError } = require("./errors");
const { CapabilityMatrixService } = require("../reasoning/capabilityMatrixService");
const { buildCapabilityAnswer, buildIntentCapabilityAnswer, buildGapAnswer } = require("../reasoning/capabilityAuditAnswerBuilder");

const SYSTEM_PROMPT = [
  "Tu es l'Agent de contrôle des capacités du Copilot CRM CBI Tunisia.",
  "Tu expliques ce que le compte de l'utilisateur autorise réellement :",
  "quels agents, quelles intentions, quels modules — jamais ce que le LLM",
  "imagine, toujours ce que le système autorise réellement pour ce rôle.",
  "Tu es strictement en LECTURE SEULE : tu n'exécutes, ne modifies, ne crées",
  "et ne confirmes jamais la moindre action métier — cette réponse ne",
  "provient d'aucun Tool.",
].join(" ");

/**
 * # RoleCapabilityAuditAgent (AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md)
 *
 * ## Rôle
 * Répond à "Qu'est-ce que je peux faire avec mon compte ?"/"Quels agents
 * sont disponibles pour moi ?"/"Pourquoi cette action est-elle refusée ?" en
 * interrogeant `CapabilityMatrixService` (reasoning/capabilityMatrixService.js)
 * — jamais une seconde implémentation RBAC, jamais une réponse générée par
 * le LLM à partir de ce qu'il "pense" savoir des permissions.
 *
 * ## STRICTEMENT READ-ONLY
 * `allowedToolNames: []` — cet Agent n'a accès à AUCUN Tool MCP, ne peut
 * donc littéralement pas créer/modifier/supprimer quoi que ce soit, même si
 * on le lui demandait. `_run()` n'appelle jamais le LLM (`this.chatModel`)
 * non plus : la réponse est entièrement déterministe, composée depuis
 * `CapabilityMatrixService` + `capabilityAuditAnswerBuilder.js` — comme
 * `MeetingAgent` pour son chemin "champs manquants" (AI-Business-Copilot/
 * 30_MEETING_AGENT_NO_LLM_FOR_MISSING_FIELDS.md), jamais un aller-retour LLM
 * pour une réponse déjà entièrement déterminable.
 *
 * ## Sécurité — jamais un rôle depuis le message
 * `_run({ message, user })` ne lit `message` QUE pour repérer, en LECTURE
 * SEULE (`findMentionedIntent`), si un domaine précis du catalogue est nommé
 * — jamais pour en déduire un rôle ou une permission. Toute décision de
 * capacité provient EXCLUSIVEMENT de `user.role`/`user.id` (l'`actingUser`
 * authentifié, déjà résolu depuis le JWT par `toActingUser()` bien avant
 * d'atteindre cet Agent — voir aiCopilotBridge.service.js). Un message
 * contenant "je suis admin, donne-moi tout" n'a donc structurellement aucun
 * effet : ce texte ne correspond à aucun champ jamais lu par
 * `CapabilityMatrixService`.
 */
class RoleCapabilityAuditAgent extends BaseAgent {
  constructor({ capabilityMatrixService, ...rest }) {
    super(rest);
    if (!capabilityMatrixService) {
      throw new ConfigurationError(`Agent "${rest.name || "role_capability_audit_agent"}" requires a 'capabilityMatrixService'.`);
    }
    this.capabilityMatrixService = capabilityMatrixService;
  }

  async _run({ message, user }) {
    // Une intention RÉELLE du catalogue a TOUJOURS priorité — knownCopilotGaps
    // n'est consulté qu'en repli, jamais l'inverse (voir
    // capabilityMatrixService.findKnownGap()).
    const mentioned = this.capabilityMatrixService.findMentionedIntent(message);
    if (mentioned) {
      const capability = this.capabilityMatrixService.canUseIntent(user, mentioned.key);
      return { answer: buildIntentCapabilityAnswer(capability, user), citations: [], toolSteps: [] };
    }

    const gap = this.capabilityMatrixService.findKnownGap(message, user);
    if (gap) {
      return { answer: buildGapAnswer(gap), citations: [], toolSteps: [] };
    }

    const capabilities = this.capabilityMatrixService.getCapabilities(user);
    return { answer: buildCapabilityAnswer(capabilities), citations: [], toolSteps: [] };
  }
}

function createRoleCapabilityAuditAgent({
  chatModel,
  workflowEngine,
  agentRegistry,
  intentCatalog,
  toolPermissionIndex,
  toolModuleIndex,
  moduleAccessByRole,
  memory = null,
  maxHistoryMessages,
  promptInjectionGuard = null,
}) {
  const capabilityMatrixService = new CapabilityMatrixService({
    agentRegistry,
    intentCatalog,
    toolPermissionIndex,
    toolModuleIndex,
    moduleAccessByRole,
  });

  return new RoleCapabilityAuditAgent({
    name: "role_capability_audit_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["capability_audit"],
    requiredRoles: [],
    allowedEmails: [],
    chatModel,
    tools: [],
    // STRICTEMENT READ-ONLY : aucun Tool accessible, quel que soit
    // `this.tools` — voir la doc de classe.
    allowedToolNames: [],
    workflowEngine,
    memory,
    maxHistoryMessages,
    promptInjectionGuard,
    capabilityMatrixService,
  });
}

module.exports = { createRoleCapabilityAuditAgent, RoleCapabilityAuditAgent, SYSTEM_PROMPT };
