"use strict";

const path = require("path");
const { ConfigurationError } = require("../../utils/errors");

// Open/closed extension -> loader mapping (SOLID-OCP): adding a new
// documentation format means one register() call, not a switch statement
// buried in the ingestion service.
class LoaderRegistry {
  constructor() {
    this._loaders = new Map();
  }

  register(extensions, loader) {
    for (const ext of extensions) {
      const key = ext.toLowerCase();
      if (this._loaders.has(key)) {
        throw new ConfigurationError(`A loader is already registered for extension "${key}".`);
      }
      this._loaders.set(key, loader);
    }
    return this;
  }

  resolve(absolutePath) {
    const ext = path.extname(absolutePath).toLowerCase();
    return this._loaders.get(ext) || null;
  }
}

module.exports = { LoaderRegistry };
