"use strict";

const { BaseAgent } = require("./baseAgent");
const { AnalyticsQueryParser } = require("../analytics/analyticsQueryParser");
const { withTimeout, StepTimeoutError, PERMISSION_DENIED_CODE } = require("../planning/planExecutor");
const { buildAnalyticsAnswer, buildAnalyticsErrorAnswer, buildEngineersAnswer, engineersNextLabel } = require("../reasoning/analyticsAnswerBuilder");

// Requis par BaseAgent ; cet Agent n'appelle JAMAIS le modèle de langage :
// les chiffres viennent du Tool, le texte d'un gabarit FR/EN/RU.
const SYSTEM_PROMPT =
  "Agent d'analytique CRM de PROBAR ASSISTANT : répond aux questions de comptage, de classement et de répartition " +
  "à partir des Tools statistiques du CRM uniquement, jamais de la documentation ni d'une estimation.";

const TOOLS = Object.freeze({
  project: "get_project_statistics",
  contact: "get_commercial_contact_statistics",
  relance: "get_commercial_contact_statistics",
  industrial: "get_industrial_statistics",
  engineer: "list_engineers",
});
const ALLOWED_TOOL_NAMES = [...new Set(Object.values(TOOLS))];
const DEFAULT_TIMEOUT_MS = 15000;
// Liste des ingénieurs : 20 par réponse, la suite sur « Afficher les suivants ».
const ENGINEER_PAGE_SIZE = 20;

/**
 * # AnalyticsAgent — « Quel est l'ingénieur le plus utilisé ? » (intention crm_analytics)
 *
 * 1. `AnalyticsQueryParser` traduit la question (FR/EN/RU) en requête
 *    interne : domaine, dimension, opération (max, min, top, répartition,
 *    moyenne, total), filtres.
 * 2. UN appel au Tool statistique du domaine, via l'adaptateur MCP lié à
 *    l'utilisateur authentifié : rôle, périmètre (« mes projets » pour un
 *    non-admin) et validation sont appliqués PAR LE SERVEUR, jamais ici.
 * 3. Le résultat est vérifié (forme, nombres) puis mis en mots de façon
 *    déterministe (reasoning/analyticsAnswerBuilder.js), égalités comprises.
 *
 * Refus RBAC, délai dépassé, erreur PostgreSQL ou résultat non conforme :
 * message honnête, aucun chiffre affiché.
 */
class AnalyticsAgent extends BaseAgent {
  constructor({ parser = null, timeoutMs = DEFAULT_TIMEOUT_MS, ...rest }) {
    super(rest);
    this.parser = parser || new AnalyticsQueryParser();
    this.timeoutMs = timeoutMs;
  }

  _toolRequest(query) {
    if (query.domain === "engineer") {
      return {
        tool: TOOLS.engineer,
        input:
          query.operation === "of_project"
            ? { operation: "of_project", projectName: query.projectName }
            : { operation: "list", limit: ENGINEER_PAGE_SIZE, offset: Number.isInteger(query.offset) && query.offset > 0 ? query.offset : 0 },
      };
    }
    const { filters } = query;
    const period = filters.period ? { from: filters.period.from, to: filters.period.to } : {};
    const order = query.operation === "min" ? "asc" : "desc";
    const limit =
      query.operation === "top" ? query.limit : query.operation === "distribution" ? query.limit || 20 : query.operation === "average" ? 1 : 10;
    const mine = query.mine ? { mine: true } : {};

    if (query.domain === "project") {
      const input = { ...period, ...mine, includeArchived: filters.includeArchived };
      if (query.groupBy) Object.assign(input, { groupBy: query.groupBy, order, limit });
      if (filters.productFamily) input.productFamily = filters.productFamily;
      if (filters.statut) input.statut = filters.statut;
      return { tool: TOOLS.project, input };
    }
    if (query.domain === "industrial") {
      const input = { ...period };
      if (query.groupBy) Object.assign(input, { groupBy: query.groupBy, order, limit });
      if (filters.module) input.module = filters.module;
      return { tool: TOOLS.industrial, input };
    }
    if (query.operation === "list_without_relance") {
      return { tool: TOOLS.contact, input: { metric: "contacts_without_relance", limit: 10, ...period, ...mine } };
    }
    const input = { metric: query.domain === "relance" ? "relances" : "contacts", ...period, ...mine };
    if (query.groupBy) Object.assign(input, { groupBy: query.groupBy, order, limit });
    return { tool: TOOLS[query.domain], input };
  }

  // Un résultat de Tool n'est cru que s'il a la forme attendue : totaux
  // entiers, groupes { label, count entier ≥ 0 }.
  _validate(result, query) {
    if (!result || typeof result !== "object") return false;
    if (query.domain === "engineer") {
      if (query.operation === "of_project") {
        return Array.isArray(result.matches) && result.matches.every((m) => m && typeof m.projectName === "string" && (m.engineer === null || typeof m.engineer.name === "string"));
      }
      return Number.isInteger(result.total) && result.total >= 0 && Array.isArray(result.items) && result.items.every((e) => e && typeof e.name === "string" && e.name.trim());
    }
    const total = query.domain === "project" ? result.totalProjects : query.domain === "industrial" ? result.totalRecords : result.total;
    if (!Number.isInteger(total) || total < 0) return false;
    if (!Array.isArray(result.groups)) return false;
    return result.groups.every((g) => g && Number.isInteger(g.count) && g.count >= 0 && g.label !== undefined);
  }

  async _run({ message, intent }) {
    let query = this.parser.parse(message);
    // Intention `engineers` choisie par le repli sémantique (formulation que
    // le parseur ne couvre pas) : la liste des ingénieurs, jamais une autre donnée.
    if ((!query || query.domain !== "engineer") && intent && intent.name === "engineers") {
      query = { language: this.parser.languageOf(message), domain: "engineer", groupBy: null, operation: "list", filters: {}, mine: false };
    }
    // « Afficher les suivants » : page suivante, dans la langue de la liste.
    if (intent && intent.listCursor && query && query.domain === "engineer" && query.operation === "list") {
      query = { ...query, offset: intent.listCursor.nextOffset, language: intent.listCursor.language || query.language };
    }
    if (!query) {
      return { answer: buildAnalyticsErrorAnswer("notUnderstood", this.parser.languageOf ? this.parser.languageOf(message) : "fr"), citations: [], toolSteps: [] };
    }
    const { tool: toolName, input } = this._toolRequest(query);
    const tool = this._allowedTools().find((t) => t.name === toolName);
    if (!tool) {
      this.logger.warn(`Tool "${toolName}" indisponible pour cet utilisateur`);
      return { answer: buildAnalyticsErrorAnswer("denied", query.language), citations: [], toolSteps: [] };
    }

    let output;
    try {
      const raw = await withTimeout(Promise.resolve().then(() => tool.invoke(input)), this.timeoutMs);
      output = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (err) {
      const kind =
        err instanceof StepTimeoutError ? "timeout" : err && (err.code === PERMISSION_DENIED_CODE || /is not allowed to call tool/i.test(err.message || "")) ? "denied" : "failure";
      this.logger.warn(`analytique "${query.domain}/${query.groupBy || "total"}" -> ${kind}`);
      return { answer: buildAnalyticsErrorAnswer(kind, query.language), citations: [], toolSteps: [{ tool: toolName, input, output: null }] };
    }

    if (!this._validate(output, query)) {
      this.logger.warn(`analytique : résultat non conforme de "${toolName}"`);
      return { answer: buildAnalyticsErrorAnswer("failure", query.language), citations: [], toolSteps: [{ tool: toolName, input, output: null }] };
    }

    this.logger.info(`analytique "${query.domain}/${query.groupBy || "total"}/${query.operation}" (${query.language}) via ${toolName}`);
    const moreEngineers = query.domain === "engineer" && query.operation === "list" && output.truncated;
    return {
      answer: query.domain === "engineer" ? buildEngineersAnswer({ query, result: output, tool: toolName }) : buildAnalyticsAnswer({ query, result: output, tool: toolName }),
      citations: [],
      toolSteps: [{ tool: toolName, input, output }],
      ...(moreEngineers
        ? {
            listCursor: { entity: "engineer", nextOffset: (output.offset || 0) + output.items.length, total: output.total, language: query.language },
            suggestions: [{ id: "engineers_next_page", label: engineersNextLabel(query.language), reason: null }],
          }
        : {}),
    };
  }
}

function createAnalyticsAgent({ chatModel, tools = [], workflowEngine, memory = null, maxHistoryMessages, promptInjectionGuard = null, analyticsParser = null, analyticsTimeoutMs }) {
  return new AnalyticsAgent({
    name: "analytics_agent",
    systemPrompt: SYSTEM_PROMPT,
    // `engineers` : liste des ingénieurs / ingénieur d'un projet — même
    // mécanique (un Tool réel, vérifié, réponse déterministe FR/EN/RU).
    intentNames: ["crm_analytics", "engineers"],
    requiredRoles: [],
    allowedEmails: [],
    chatModel,
    tools,
    allowedToolNames: ALLOWED_TOOL_NAMES,
    workflowEngine,
    memory,
    maxHistoryMessages,
    promptInjectionGuard,
    parser: analyticsParser,
    ...(analyticsTimeoutMs ? { timeoutMs: analyticsTimeoutMs } : {}),
  });
}

module.exports = { AnalyticsAgent, createAnalyticsAgent, ALLOWED_TOOL_NAMES, SYSTEM_PROMPT };
