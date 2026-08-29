"use strict";

const { IAgent } = require("./agent.interface");
const { AgentError, AgentPermissionError, ConfigurationError } = require("./errors");
const { createAgentLogger } = require("./logger");
const { isAuthorized } = require("../utils/authorization");
const { ToolCallingChain } = require("../langchain/chains");
const { classifyAgentError } = require("../utils/agentErrorClassification");

/**
 * # BaseAgent — squelette commun aux 11 Agents spécialisés
 *
 * ## Rôle
 * Porte les six propriétés demandées pour CHAQUE Agent, dans une seule
 * implémentation partagée (SOLID-SRP/DRY — les 11 sous-classes ne
 * redéclarent que ce qui les distingue vraiment) :
 * - **prompt système** (`systemPrompt`) : préfixé à chaque instruction
 *   envoyée au modèle (voir `_buildInstruction`).
 * - **outils autorisés** (`allowedToolNames`) : liste blanche explicite de
 *   noms de Tools (jamais "tout le module" implicitement) — filtrée depuis
 *   la liste complète des Tools LangChain déjà adaptés (voir
 *   langchain/tools/mcpToolAdapter.js), elle-même déjà scopée à
 *   l'`actingUser` du pipeline. `null` signifie explicitement "aucune
 *   restriction" (seul `AutomationAgent` l'utilise, voir ce fichier).
 * - **permissions** (`requiredRoles`/`allowedEmails`) : même prédicat que
 *   `PermissionManager` côté MCP (`utils/authorization.js`, réutilisé — pas
 *   dupliqué) ; un premier filtre grossier avant même de construire quoi
 *   que ce soit, en plus (pas à la place) du contrôle fin que chaque Tool
 *   MCP applique déjà lui-même via `mcpServer.handleMessage()`.
 * - **mémoire** (`memory`) : lit l'historique récent de la conversation
 *   (`IConversationMemory`, la MÊME instance que `ConversationManager` —
 *   voir orchestrator/pipeline.js) pour l'injecter dans l'instruction.
 * - **workflow** : `_run()` construit une liste de `WorkflowStep` et la
 *   confie à `LangChainWorkflowEngine` — le comportement par défaut ici est
 *   "tool-calling scopé, secours RAG" ; `ReportingAgent`/`AutomationAgent`
 *   redéfinissent `_run()` avec un workflow différent (voir ces fichiers).
 * - **gestion des erreurs** : `execute()` sépare une erreur de permission
 *   (levée telle quelle — `AgentPermissionError`, doit rester visible) d'une
 *   erreur d'exécution (Chain/Tool/Planner — capturée et transformée en
 *   réponse dégradée mais valide, jamais une exception qui remonte jusqu'à
 *   l'utilisateur final).
 *
 * `promptInjectionGuard` (security/promptInjectionGuard.js), optionnel :
 * guarde l'historique de conversation réinjecté dans l'instruction
 * (`_historyText`) et est transmis à la `ToolCallingChain` construite par
 * `_run()`, qui l'applique à chaque résultat d'outil avant réinjection —
 * un champ texte libre du CRM remonté par un Tool (ou un tour de
 * conversation précédent) est un vecteur d'injection indirecte, au même
 * titre que le contenu RAG. Sans lui (défaut), comportement inchangé.
 *
 * `requireToolUse` (AI-Business-Copilot/21_TOOL_CALLING_RELIABILITY.md),
 * `false` par défaut : transmis tel quel à la `ToolCallingChain` construite
 * par `_run()` — voir sa propre doc pour la garantie exacte. Un agent
 * conversationnel (ex. `meeting_agent`, qui répond légitimement sans jamais
 * appeler d'outil la plupart du temps) ne doit JAMAIS l'activer ; un agent
 * dont le rôle est de rapporter des données CRM réelles (ex.
 * `project_agent`) le fait.
 *
 * ## Entrée
 * `execute({ intent, message, user, conversationId })`
 *
 * ## Sortie
 * `{ answer: string, citations: Citation[], toolSteps: object[] }`
 *
 * ## Erreurs
 * `AgentPermissionError` si `user` ne satisfait pas `requiredRoles`/
 * `allowedEmails`. Toute autre erreur est absorbée par `_run()` et
 * transformée en réponse dégradée (voir `_fallbackAnswer`).
 */
class BaseAgent extends IAgent {
  constructor({
    name,
    systemPrompt,
    intentNames = [],
    requiredRoles = [],
    allowedEmails = [],
    chatModel,
    tools = [],
    allowedToolNames = null,
    workflowEngine,
    qaChain = null,
    memory = null,
    maxToolCalls = 5,
    maxHistoryMessages = 6,
    promptInjectionGuard = null,
    requireToolUse = false,
    logger = null,
  }) {
    super();
    if (!name) throw new ConfigurationError("BaseAgent requires a 'name'.");
    if (!systemPrompt) throw new ConfigurationError(`Agent "${name}" requires a 'systemPrompt'.`);
    if (!chatModel) throw new ConfigurationError(`Agent "${name}" requires a 'chatModel'.`);
    if (!workflowEngine) throw new ConfigurationError(`Agent "${name}" requires a 'workflowEngine'.`);

    this._name = name;
    this.systemPrompt = systemPrompt;
    this.intentNames = intentNames;
    this.requiredRoles = requiredRoles;
    this.allowedEmails = allowedEmails;
    this.chatModel = chatModel;
    this.tools = tools;
    this.allowedToolNames = allowedToolNames;
    this.workflowEngine = workflowEngine;
    this.qaChain = qaChain;
    this.memory = memory;
    this.maxToolCalls = maxToolCalls;
    this.maxHistoryMessages = maxHistoryMessages;
    this.promptInjectionGuard = promptInjectionGuard;
    this.requireToolUse = requireToolUse;
    this.logger = logger || createAgentLogger(name);
  }

  get name() {
    return this._name;
  }

  canHandle(intent) {
    return Boolean(intent) && this.intentNames.includes(intent.name);
  }

  // Outils autorisés : liste blanche explicite (jamais "tout ce qui passe").
  _allowedTools() {
    if (this.allowedToolNames === null) return this.tools;
    const allowed = new Set(this.allowedToolNames);
    return this.tools.filter((tool) => allowed.has(tool.name));
  }

  async _historyText(conversationId) {
    if (!this.memory || !conversationId) return "";
    const history = await this.memory.getHistory(conversationId, { limit: this.maxHistoryMessages });
    if (!history.length) return "";
    const text = `\n\nHistorique récent de la conversation :\n${history.map((m) => `${m.role}: ${m.content}`).join("\n")}`;
    if (!this.promptInjectionGuard) return text;
    return this.promptInjectionGuard.scan(text).sanitizedText;
  }

  async _buildInstruction(message, conversationId) {
    const historyText = await this._historyText(conversationId);
    return `${this.systemPrompt}${historyText}\n\nDemande de l'utilisateur : ${message}`;
  }

  async execute({ intent, message, user, conversationId }) {
    if (!isAuthorized({ requiredRoles: this.requiredRoles, allowedEmails: this.allowedEmails }, user)) {
      this.logger.warn(`denied for role "${user && user.role}"`);
      throw new AgentPermissionError(this.name, user && user.role);
    }

    try {
      return await this._run({ intent, message, user, conversationId });
    } catch (err) {
      // Avant cette ligne, seul `err.message` était loggé (en `warn`), le
      // reste de l'erreur (stack, cause, éventuelle erreur Sequelize/Tool/
      // LLM sous-jacente) était perdu — un fallback dégradé mais
      // TECHNIQUEMENT invisible en production (voir
      // AI-Business-Copilot/09_INCIDENT_KPI_AGENT.md, l'incident qui a
      // rendu ça nécessaire). `classifyAgentError()` donne un code stable
      // (AI_AGENT_ERROR/AI_TOOL_ERROR/AI_DATABASE_ERROR/AI_PERMISSION_ERROR/
      // AI_VALIDATION_ERROR/AI_LLM_ERROR) pour filtrer les logs sans lire
      // chaque stack — jamais utilisé pour changer la réponse utilisateur
      // (toujours le même fallback générique, volontairement). `err` passe
      // par le même pipeline de redaction que tout logger namespacé
      // (secretRedaction.js) — jamais une clé/JWT/mot de passe, mais la
      // stack/le message COMPLET, contrairement à avant.
      const code = classifyAgentError(err);
      // AI-Business-Copilot/12_AGENT_FAILURE_DIAGNOSIS.md, étape 1 :
      // `conversationId` (corrélation d'un tour à travers tout le pipeline,
      // voir aiManager.js::_audit()) ajouté explicitement — jusqu'ici
      // absent de cette ligne, alors que `execute()` le reçoit déjà.
      // `agent` (`this.name`) est déjà présent sur CHAQUE ligne de ce
      // logger via son préfixe de namespace (`[ai:agent:${this.name}]`,
      // voir agents/logger.js) — jamais dupliqué ici. Le nom du Tool en
      // cause, quand pertinent, est déjà dans `err.message` (ex. `Tool
      // "create_calendar_event" failed to execute.`) : `mcpToolAdapter.js`
      // aplatit délibérément toute erreur MCP en `Error` générique AVANT
      // qu'elle n'atteigne cette ligne (frontière déjà documentée dans
      // agentErrorClassification.js) — un champ `tool` structuré séparé
      // exigerait de percer cette frontière, hors périmètre de ce
      // diagnostic. `err` (2e argument) passe par `redact()`, qui préserve
      // désormais la VRAIE stack technique et `.cause` (voir
      // secretRedaction.js) — plus jamais une pile d'appels factice.
      this.logger.error(`[${code}] execution failed, returning a degraded answer for intent "${intent && intent.name}" (conversationId=${conversationId || "n/a"}): ${err.message}`, err);
      return this._fallbackAnswer(err);
    }
  }

  // Comportement par défaut : tool-calling scopé aux Tools autorisés,
  // secours RAG (qaChain) si aucun Tool n'est disponible/pertinent.
  // ReportingAgent et AutomationAgent redéfinissent ceci avec un workflow
  // différent — voir ces fichiers.
  async _run({ message, user, conversationId }) {
    const tools = this._allowedTools();
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

  // Gestion des erreurs : jamais une exception qui atteint l'utilisateur —
  // une réponse en langage naturel, honnête sur l'échec, sans détail
  // interne (même discipline que ResponseBuilder.buildErrorResponse).
  _fallbackAnswer(_err) {
    return {
      answer: `Désolé, ${this.name} n'a pas pu traiter cette demande pour le moment. Merci de réessayer ou de reformuler.`,
      citations: [],
      toolSteps: [],
    };
  }
}

module.exports = { BaseAgent };
