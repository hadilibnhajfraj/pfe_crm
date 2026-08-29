"use strict";

// Pure value object: {{variable}} substitution only, no prompt copy lives
// here. Unmatched placeholders are left untouched rather than becoming an
// empty string, so a missing variable fails loudly downstream instead of
// silently producing a malformed prompt.
class PromptTemplate {
  constructor({ name, version = 1, template }) {
    this.name = name;
    this.version = version;
    this.template = template;
  }

  render(variables = {}) {
    return this.template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => {
      return Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : match;
    });
  }
}

module.exports = { PromptTemplate };
