"use strict";

const { IAuditLog } = require("./auditLog.interface");
const { ConfigurationError } = require("./errors");
const { redact } = require("../utils/secretRedaction");

const VALID_OUTCOMES = ["allowed", "denied", "success", "failure", "flagged"];

/**
 * # AuditLog — "audit"
 *
 * ## Rôle
 * Implémente `IAuditLog` par-dessus le port `IKeyValueStore` déjà existant
 * (`memory/keyValueStore.interface.js`) — même mécanique que
 * `ShortTermMemory` (une LISTE Redis capée, TTL) mais pour des événements de
 * sécurité plutôt que des messages de conversation : un appel de Tool
 * refusé pour permission, un budget de `RateLimiter` dépassé, une tentative
 * d'injection de prompt signalée, l'exécution d'une Automation. Chaque
 * entrée passe par `utils/secretRedaction.js::redact()` AVANT d'être
 * persistée — un `metadata` qui contiendrait accidentellement un secret ne
 * doit jamais atteindre le journal d'audit lui-même.
 *
 * ## Entrée/Sortie
 * `record({ actor, action, resource?, outcome, metadata? })` → l'entrée
 * persistée (avec `at`, horodatage ISO). `outcome` doit être l'un de
 * `"allowed" | "denied" | "success" | "failure" | "flagged"`.
 * `list({ limit? })` → les entrées les plus récentes, désérialisées.
 *
 * ## Erreurs
 * `ConfigurationError` si `outcome` n'est pas l'une des valeurs reconnues —
 * un événement d'audit mal formé est un bug à corriger, pas une donnée à
 * accepter silencieusement.
 */
class AuditLog extends IAuditLog {
  constructor({ store, maxEntries = 10000, ttlSeconds = 60 * 60 * 24 * 90, key = "audit:log" }) {
    super();
    this.store = store;
    this.maxEntries = maxEntries;
    this.ttlSeconds = ttlSeconds;
    this.key = key;
  }

  async record({ actor = null, action, resource = null, outcome, metadata = {} }) {
    if (!VALID_OUTCOMES.includes(outcome)) {
      throw new ConfigurationError(`AuditLog.record: outcome must be one of ${VALID_OUTCOMES.join(", ")}, got "${outcome}".`);
    }

    const entry = {
      at: new Date().toISOString(),
      actorId: (actor && actor.id) || null,
      actorRole: (actor && actor.role) || null,
      action,
      resource,
      outcome,
      metadata: redact(metadata),
    };

    await this.store.pushToList(this.key, JSON.stringify(entry), { maxLength: this.maxEntries, ttlSeconds: this.ttlSeconds });
    return entry;
  }

  async list({ limit = null } = {}) {
    const raw = await this.store.getList(this.key, { limit });
    return raw.map((entry) => JSON.parse(entry));
  }
}

module.exports = { AuditLog, VALID_OUTCOMES };
