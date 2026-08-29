"use strict";

const { BaseAutomation } = require("./baseAutomation");

// Une entrée par type de fiche qu'un create_* Tool existant sait produire —
// donnée, pas du code (OCP) : ajouter un type se fait sans toucher
// `_execute`. Noms de Tools confirmés dans mcp/tools/<module>/create*Tool.js.
const DEFAULT_CREATION_MAP = {
  maintenance_request: "create_maintenance_request",
  industrial_record: "create_industrial_record",
  por_promesh: "create_por_promesh",
  pipeline_stage: "create_pipeline_stage",
  hr_request: "create_hr_request",
};

/**
 * # AutoCreationAutomation — "création automatique"
 *
 * ## Rôle
 * Crée, par lot, plusieurs fiches CRM de types potentiellement différents à
 * partir d'une liste d'éléments détectés (import, événement système, ...),
 * en déléguant CHAQUE création au Tool `create_*` existant correspondant —
 * jamais une insertion directe. L'échec d'un élément du lot n'empêche
 * jamais les suivants d'être tentés.
 *
 * ## Entrée
 * `run({ actingUser, items: [{ recordType: string, input: object }] })`
 *
 * ## Sortie
 * `{ actions: [{recordType, tool, input, output}], errors: [{recordType, input, message}] }`
 * (voir BaseAutomation.run pour l'enveloppe complète `{success, ...}`).
 */
class AutoCreationAutomation extends BaseAutomation {
  constructor({ tools = [], creationMap = DEFAULT_CREATION_MAP, requiredRoles = [], allowedEmails = [] } = {}) {
    super({ name: "auto_creation", tools, allowedToolNames: Object.values(creationMap), requiredRoles, allowedEmails });
    this.creationMap = creationMap;
  }

  async _execute({ items = [] }) {
    const actions = [];
    const errors = [];

    for (const item of items) {
      const toolName = this.creationMap[item.recordType];
      if (!toolName) {
        errors.push({ recordType: item.recordType, input: item.input, message: `No create Tool mapped for recordType "${item.recordType}".` });
        continue;
      }
      try {
        const output = await this._callTool(toolName, item.input);
        actions.push({ recordType: item.recordType, tool: toolName, input: item.input, output });
      } catch (err) {
        errors.push({ recordType: item.recordType, input: item.input, message: err.message });
      }
    }

    return { actions, errors };
  }
}

function createAutoCreationAutomation(deps = {}) {
  return new AutoCreationAutomation(deps);
}

module.exports = { AutoCreationAutomation, createAutoCreationAutomation, DEFAULT_CREATION_MAP };
