"use strict";

/**
 * # Contrats des Tools enchaînés par le TaskPlanner (Phase 3)
 *
 * Un plan multi-étapes ne fait confiance à AUCUNE donnée qui ne sort pas d'un
 * vrai Tool, et ne croit pas non plus aveuglément ce qu'un Tool renvoie :
 *
 * - **READ** : la sortie doit avoir la forme réelle du service (`data` pour
 *   `list_projects`, `contacts` pour `get_my_commercial_contacts`) et CHAQUE
 *   ligne doit porter un identifiant UUID. Une seule ligne non conforme et
 *   tout le résultat est rejeté (fail-closed) : aucune action ne sera
 *   préparée à partir d'une donnée douteuse.
 * - **WRITE** : un succès n'est déclaré QUE si le Tool renvoie l'enregistrement
 *   réellement créé (avec son identifiant). `{ ok: false, reason }` (refus
 *   métier/RBAC du service de relance) ou une sortie sans identifiant sont des
 *   échecs — jamais un « c'est fait » présumé.
 *
 * Seuls les Tools listés ici peuvent apparaître dans un plan : un nom de Tool
 * inconnu (ou proposé par un modèle) n'est jamais exécuté.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class InvalidToolResultError extends Error {
  constructor(toolName, detail) {
    super(`Résultat du Tool "${toolName}" non conforme : ${detail}`);
    this.name = "InvalidToolResultError";
    this.toolName = toolName;
  }
}

function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function contactLabel(row) {
  const person = [row.prenom, row.nom].filter(Boolean).join(" ").trim();
  if (person && row.nomSociete) return `${person} (${row.nomSociete})`;
  return person || row.nomSociete || "contact sans nom";
}

const READ_CONTRACTS = Object.freeze({
  list_projects: {
    entityType: "project",
    rowsKey: "data",
    label: (row) => row.nomProjet || "projet sans nom",
  },
  get_my_commercial_contacts: {
    entityType: "commercial_contact",
    rowsKey: "contacts",
    label: contactLabel,
  },
});

const WRITE_CONTRACTS = Object.freeze({
  create_project_action: {
    entityType: "project",
    targetField: "projectId",
    verify(output) {
      if (output && typeof output === "object" && isUuid(output.id)) return { ok: true, recordId: output.id };
      return { ok: false, reason: "aucun enregistrement renvoyé par le service" };
    },
  },
  schedule_commercial_contact_relance: {
    entityType: "commercial_contact",
    targetField: "contactId",
    verify(output) {
      if (output && output.ok === false) return { ok: false, reason: RELANCE_REFUSALS[output.reason] || `refusé par le service (${output.reason || "raison inconnue"})` };
      const id = output && output.relance && output.relance.id;
      if (output && output.ok === true && typeof id === "string" && id) return { ok: true, recordId: id };
      return { ok: false, reason: "aucune relance renvoyée par le service" };
    },
  },
});

// Motifs renvoyés par commercialContactRelance.service.js::scheduleContactRelance.
const RELANCE_REFUSALS = Object.freeze({
  contact_not_found: "contact introuvable",
  invalid_status: "le statut du contact ne permet pas de relance",
  forbidden: "accès refusé à ce contact",
  date_required: "date de relance manquante",
  commercial_not_found: "commercial introuvable",
});

/** JSON sérialisé (adaptateur MCP) ou objet déjà désérialisé (tests). */
function parseToolOutput(toolName, raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) throw new InvalidToolResultError(toolName, "sortie vide");
  try {
    return JSON.parse(raw);
  } catch {
    throw new InvalidToolResultError(toolName, "sortie non JSON");
  }
}

/** Lignes d'une lecture, validées ; lève InvalidToolResultError sinon. */
function extractReadRows(toolName, output) {
  const contract = READ_CONTRACTS[toolName];
  if (!contract) throw new InvalidToolResultError(toolName, "Tool de lecture non autorisé dans un plan");
  const rows = output && output[contract.rowsKey];
  if (!Array.isArray(rows)) throw new InvalidToolResultError(toolName, `champ "${contract.rowsKey}" absent`);
  rows.forEach((row, index) => {
    if (!row || typeof row !== "object" || !isUuid(row.id)) {
      throw new InvalidToolResultError(toolName, `ligne ${index + 1} sans identifiant valide`);
    }
  });
  const total = Number.isInteger(output.total) ? output.total : rows.length;
  return { rows, total };
}

const isReadTool = (name) => Object.prototype.hasOwnProperty.call(READ_CONTRACTS, name);
const isWriteTool = (name) => Object.prototype.hasOwnProperty.call(WRITE_CONTRACTS, name);
const PLAN_TOOL_NAMES = Object.freeze([...Object.keys(READ_CONTRACTS), ...Object.keys(WRITE_CONTRACTS)]);

module.exports = {
  READ_CONTRACTS,
  WRITE_CONTRACTS,
  PLAN_TOOL_NAMES,
  InvalidToolResultError,
  parseToolOutput,
  extractReadRows,
  isReadTool,
  isWriteTool,
  isUuid,
};
