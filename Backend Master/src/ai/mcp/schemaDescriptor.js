"use strict";

// Best-effort Joi → JSON Schema conversion, scoped to what this project's
// tool input schemas actually use (object/string/number/boolean, required,
// valid()/enum). Not a general-purpose converter, and deliberately never
// throws — a tools/list response must never fail because of a
// documentation nicety, so anything unsupported degrades to `{}`.
function describeJoiSchema(schema) {
  if (!schema || typeof schema.describe !== "function") {
    return { type: "object", properties: {}, required: [] };
  }
  try {
    return convertNode(schema.describe());
  } catch (_err) {
    return { type: "object", properties: {}, required: [] };
  }
}

function convertNode(node) {
  if (!node || !node.type) return {};

  switch (node.type) {
    case "object": {
      const properties = {};
      const required = [];
      const keys = node.keys || {};
      for (const [key, childNode] of Object.entries(keys)) {
        properties[key] = convertNode(childNode);
        if (childNode.flags && childNode.flags.presence === "required") {
          required.push(key);
        }
      }
      return required.length ? { type: "object", properties, required } : { type: "object", properties };
    }
    case "string": {
      const result = { type: "string" };
      if (Array.isArray(node.allow) && node.allow.length) result.enum = node.allow;
      return result;
    }
    case "number":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    default:
      return {};
  }
}

module.exports = { describeJoiSchema };
