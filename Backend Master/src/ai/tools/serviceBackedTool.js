"use strict";

const { ITool } = require("./tool.interface");

// Convenience ITool implementation: a concrete tool only needs to declare
// name/description/inputSchema/requiredRoles(/allowedEmails) and a pure
// `run(input, context)` function that delegates to an existing service —
// this class carries the ITool plumbing so every tool file reads as
// "declare + delegate to a service", nothing else. Generic (not
// MCP-specific): any future non-MCP orchestrator can build tools the same
// way. `allowedEmails` mirrors this CRM's hardcoded-email actors (root
// admin, gestionnaire RH, ...) — see PermissionManager for how it's used.
class ServiceBackedTool extends ITool {
  constructor({ name, description, inputSchema, requiredRoles = [], allowedEmails = [], run }) {
    super();
    this._name = name;
    this._description = description;
    this._inputSchema = inputSchema;
    this.requiredRoles = requiredRoles;
    this.allowedEmails = allowedEmails;
    this._run = run;
  }

  get name() {
    return this._name;
  }

  get description() {
    return this._description;
  }

  get inputSchema() {
    return this._inputSchema;
  }

  async execute(input, context) {
    return this._run(input, context);
  }
}

module.exports = { ServiceBackedTool };
