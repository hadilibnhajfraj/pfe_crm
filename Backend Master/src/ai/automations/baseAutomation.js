"use strict";

const { IAutomation } = require("./automation.interface");
const { AutomationError, UnknownAutomationToolError, AutomationPermissionError, ConfigurationError } = require("./errors");
const { createAutomationLogger } = require("./logger");
const { isAuthorized } = require("../utils/authorization");

/**
 * # BaseAutomation — squelette commun aux 8 automatisations
 *
 * ## Rôle
 * Porte ce que les 8 automatisations partagent : une liste blanche
 * explicite de **Tools autorisés** (jamais un accès libre — même
 * discipline que `agents/baseAgent.js`), des **permissions** (rôle/e-mail,
 * réutilise `utils/authorization.js` — la même vérification que
 * `PermissionManager` et `BaseAgent`), et une **gestion des erreurs**
 * adaptée à un job de fond plutôt qu'à un tour de conversation : une
 * automatisation traite typiquement PLUSIEURS éléments (plusieurs demandes
 * en retard, plusieurs e-mails à envoyer, ...) — l'échec d'UN élément ne
 * doit jamais interrompre les autres. `run()` ne lève donc jamais pour un
 * échec métier ; il résout toujours vers `{success, automation, actions,
 * errors, startedAt, finishedAt}`. Seule une violation de permission (avant
 * même de commencer) reste une exception visible — voir `AgentPermissionError`
 * pour le même choix côté Agents.
 *
 * Chaque Tool passe par `mcpServer.handleMessage()` (voir
 * langchain/tools/mcpToolAdapter.js — les `tools` injectés ici sont
 * exactement les mêmes objets `DynamicStructuredTool` que ceux utilisés par
 * les Agents et LangChain) : **aucune automatisation ne touche jamais un
 * service métier ou un modèle Sequelize directement** — c'est la contrainte
 * centrale demandée ("Toutes les automatisations doivent utiliser les AI
 * Tools existants"), vérifiée mécaniquement par
 * `test/ai.automations.policy.test.js`.
 *
 * ## Entrée/Sortie
 * `run({ actingUser, ...params })` → `{ success, automation, actions,
 * errors, startedAt, finishedAt }`. Les sous-classes implémentent
 * `_execute({ actingUser, ...params })` → `{ actions, errors }`.
 *
 * ## Erreurs
 * `AutomationPermissionError` si `actingUser` ne satisfait pas
 * `requiredRoles`/`allowedEmails`. `UnknownAutomationToolError` si
 * `_execute` tente d'appeler un Tool hors de sa propre liste blanche.
 * Toute autre erreur levée par `_execute` (bug, pas un échec par-élément
 * déjà capturé) est absorbée par `run()` et ajoutée à `errors`.
 */
class BaseAutomation extends IAutomation {
  constructor({ name, tools = [], allowedToolNames, requiredRoles = [], allowedEmails = [], logger = null }) {
    super();
    if (!name) throw new ConfigurationError("BaseAutomation requires a 'name'.");
    if (!Array.isArray(allowedToolNames) || allowedToolNames.length === 0) {
      throw new ConfigurationError(`Automation "${name}" requires a non-empty 'allowedToolNames'.`);
    }

    this._name = name;
    this.allowedToolNames = allowedToolNames;
    this.requiredRoles = requiredRoles;
    this.allowedEmails = allowedEmails;
    this._toolsByName = new Map(tools.filter((tool) => allowedToolNames.includes(tool.name)).map((tool) => [tool.name, tool]));
    this.logger = logger || createAutomationLogger(name);
  }

  get name() {
    return this._name;
  }

  // Appelle un Tool de la liste blanche et parse sa réponse JSON — chaque
  // Tool LangChain (voir mcpToolAdapter.js) renvoie le texte JSON.stringify
  // produit par McpServer, jamais un objet déjà désérialisé.
  async _callTool(toolName, input = {}) {
    if (!this.allowedToolNames.includes(toolName)) {
      throw new UnknownAutomationToolError(this.name, toolName);
    }
    const tool = this._toolsByName.get(toolName);
    if (!tool) {
      throw new UnknownAutomationToolError(this.name, toolName);
    }
    const raw = await tool.invoke(input);
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  }

  async run(context = {}) {
    const startedAt = new Date().toISOString();
    const { actingUser } = context;

    if (!isAuthorized({ requiredRoles: this.requiredRoles, allowedEmails: this.allowedEmails }, actingUser)) {
      this.logger.warn(`denied for role "${actingUser && actingUser.role}"`);
      throw new AutomationPermissionError(this.name, actingUser && actingUser.role);
    }

    let actions = [];
    let errors = [];
    try {
      const result = await this._execute(context);
      actions = result.actions || [];
      errors = result.errors || [];
    } catch (err) {
      this.logger.warn(`unexpected failure: ${err.message}`);
      errors = [{ message: err instanceof AutomationError ? err.message : "Unexpected automation failure." }];
    }

    return {
      success: errors.length === 0,
      automation: this.name,
      actions,
      errors,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  async _execute(_context) {
    throw new AutomationError(`Automation "${this.name}" does not implement _execute().`);
  }
}

module.exports = { BaseAutomation };
