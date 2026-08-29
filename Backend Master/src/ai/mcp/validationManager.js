"use strict";

const Joi = require("joi");
const { McpError, ToolValidationError } = require("./errors");
const { ErrorCodes } = require("./jsonRpc");

// JSON-RPC 2.0 envelope shape. `id` is intentionally optional — a request
// without `id` is a JSON-RPC *notification* and must never receive a
// response (see McpServer._handleMessage).
const envelopeSchema = Joi.object({
  jsonrpc: Joi.string().valid("2.0").required(),
  id: Joi.alternatives(Joi.string(), Joi.number(), Joi.valid(null)).optional(),
  method: Joi.string().min(1).required(),
  params: Joi.object().unknown(true).optional(),
});

// Project-specific extension of the standard MCP `tools/call` params: every
// call must be attributable to a real CRM user so PermissionManager can
// enforce the same RBAC the rest of the app already enforces (plan §4.5).
// Absence of `actingUser` is a *permission* concern (handled by
// PermissionManager, fails closed as "anonymous"), not a validation one —
// this schema only rejects a value that is present but malformed.
const actingUserSchema = Joi.object({
  id: Joi.string().guid({ version: "uuidv4" }).required(),
  role: Joi.string().min(1).required(),
  email: Joi.string().email().optional(),
});

// Validates protocol-level shape and per-tool business input. Two distinct
// responsibilities kept in one class because both answer the same question
// for McpServer: "is this call well-formed enough to proceed?"
class ValidationManager {
  validateEnvelope(message) {
    const { error, value } = envelopeSchema.validate(message, { abortEarly: false });
    if (error) {
      throw new McpError(ErrorCodes.INVALID_REQUEST, `Invalid JSON-RPC request: ${error.message}`);
    }
    return value;
  }

  validateActingUser(actingUser) {
    if (actingUser === undefined || actingUser === null) return;
    const { error } = actingUserSchema.validate(actingUser, { abortEarly: false });
    if (error) {
      throw new McpError(ErrorCodes.INVALID_PARAMS, `Invalid actingUser: ${error.message}`);
    }
  }

  validateToolInput(tool, input) {
    const schema = tool.inputSchema;
    if (!schema) return input;
    const { error, value } = schema.validate(input || {}, { abortEarly: false, stripUnknown: true });
    if (error) {
      throw new ToolValidationError(tool.name, error.message);
    }
    return value;
  }
}

module.exports = { ValidationManager, envelopeSchema, actingUserSchema };
