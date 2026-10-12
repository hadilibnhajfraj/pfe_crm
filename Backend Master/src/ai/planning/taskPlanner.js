"use strict";

const { extractEntities } = require("../orchestrator/entityExtractor");
const { normalizeAccents } = require("../reasoning/projectStatuses");
const { PlanStep, STEP_KINDS } = require("./planStep");
const { READ_CONTRACTS } = require("./toolContracts");

/**
 * # TaskPlanner — comprendre une demande composée et en faire un plan (Phase 3)
 *
 * « Trouve mes projets en cours sans relance depuis 30 jours et prépare une
 * relance pour chacun. » devient :
 *
 *   1. READ    list_projects (vos projets, statut « En cours »)
 *   2. ANALYZE sans relance depuis plus de 30 jours
 *   3. WRITE   create_project_action × N  (préparées, exécutées après « confirme »)
 *
 * ## Déterministe, jamais délégué au modèle de langage
 * La compréhension réutilise l'extracteur d'entités de la Phase 1
 * (`entityExtractor.js` : entité, statut, « sans relance depuis N jours »,
 * « mes »). Le plan ne contient que des Tools déclarés dans
 * `toolContracts.js`, et les paramètres d'écriture ne sont construits qu'à
 * partir des lignes réellement lues (`prepareWrites`) : aucun identifiant,
 * aucun chiffre, aucun nom ne vient d'un modèle.
 *
 * ## Portée volontairement étroite (`detect`)
 * Une demande n'est prise en charge que si elle combine une SOURCE (projets
 * ou contacts), une ACTION d'écriture connue ET une portée multiple (« pour
 * chacun », « mes projets »…). « Programme une relance pour le contact
 * Ahmed » (une seule cible nommée) reste traité par l'Agent Commercial
 * existant, et la forme verbale seule (« Relance les clients. », suggestion
 * Flutter) garde son routage actuel : aucun parcours CRM n'est détourné.
 */

const SOURCES = Object.freeze({
  project: { readTool: "list_projects", noun: "projet", nounPlural: "projets" },
  commercial_contact: { readTool: "get_my_commercial_contacts", noun: "contact", nounPlural: "contacts" },
});

// Actions d'écriture reconnues -> Tool réel par source.
const ACTIONS = Object.freeze({
  relance: { label: "Relance", tools: { project: "create_project_action", commercial_contact: "schedule_commercial_contact_relance" }, dated: true },
  appel: { label: "Appel", tools: { project: "create_project_action" }, dated: false },
  visite: { label: "Visite", tools: { project: "create_project_action" }, dated: false },
  activite: { label: "Suivi", tools: { project: "create_project_action" }, dated: false },
});

const WRITE_CLAUSE =
  /\b(?:prepare[rz]?|cree[rz]?|creer|programme[rz]?|planifie[rz]?|ajoute[rz]?|genere[rz]?|enregistre[rz]?|fais|faire)\s+(?:moi\s+)?(?:une?|des|la|les)?\s*(relances?|rappels?|activites?|appels?|visites?)\b/;
const DISTRIBUTIVE = /\b(?:pour|a|de)\s+(?:chacun|chacune|chaque|tous|toutes|eux|elles)\b|\bchacun(?:e)?\b/;
const PLURAL_TARGET = /\b(?:mes|les|des|ces|tous les|toutes les)\s+(?:projets|affaires|dossiers|opportunites|contacts|clients|prospects)\b/;

const CONTACT_STATUSES = [
  { pattern: /\ba rappeler\b|\brappeler plus tard\b/, value: "rappeler_plus_tard", label: "à rappeler" },
  { pattern: /\binjoignables?\b/, value: "user_injoignable", label: "injoignables" },
  { pattern: /\brefus/, value: "client_refuse", label: "refus client" },
];

const DAY_MS = 86400000;
const DEFAULT_MAX_WRITES = 20;

function actionKeyFromClause(match) {
  const word = match[1] || "";
  if (/^relanc|^rappel/.test(word)) return "relance";
  if (/^appel/.test(word)) return "appel";
  if (/^visite/.test(word)) return "visite";
  return "activite";
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function isoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function frenchDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Date de relance demandée ; « demain » par défaut, toujours affichée avant
// confirmation (jamais une date décidée en silence).
function extractDueDate(text, now) {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const inDays = text.match(/\bdans\s+(\d{1,2})\s+jours?\b/);
  if (inDays) return { iso: isoDate(new Date(base.getTime() + Number(inDays[1]) * DAY_MS)), explicit: true };
  if (/\baujourd['’ ]?hui\b/.test(text)) return { iso: isoDate(base), explicit: true };
  const explicitDate = text.match(/\b(?:le|pour le|au)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (explicitDate) {
    const year = explicitDate[3] ? Number(explicitDate[3]) : base.getFullYear();
    const date = new Date(year, Number(explicitDate[2]) - 1, Number(explicitDate[1]));
    if (!Number.isNaN(date.getTime()) && date.getDate() === Number(explicitDate[1])) return { iso: isoDate(date), explicit: true };
  }
  return { iso: isoDate(new Date(base.getTime() + DAY_MS)), explicit: /\bdemain\b/.test(text) };
}

function truncate(text, max) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

class TaskPlanner {
  constructor({ extract = extractEntities, now = () => new Date(), maxWrites = DEFAULT_MAX_WRITES } = {}) {
    this.extract = extract;
    this.now = now;
    this.maxWrites = maxWrites;
  }

  /** `true` si la demande est une tâche composée prise en charge. */
  detect(message, entities = null) {
    const text = normalizeAccents(message);
    const e = entities || this.extract(message, { now: this.now() });
    if (!e || !SOURCES[e.entityType]) return false;
    if (!WRITE_CLAUSE.test(text)) return false;
    return DISTRIBUTIVE.test(text) || PLURAL_TARGET.test(text);
  }

  /**
   * Plan initial (READ + ANALYZE) et gabarit d'écriture.
   * @returns {{ plan: object } | { unsupported: string }}
   */
  plan(message, { user }) {
    const now = this.now();
    const text = normalizeAccents(message);
    const entities = this.extract(message, { now });
    const source = SOURCES[entities.entityType];
    const clause = text.match(WRITE_CLAUSE);
    if (!source || !clause) return { unsupported: "Je n'ai pas identifié à la fois les enregistrements à rechercher et l'action à préparer." };

    const actionKey = actionKeyFromClause(clause);
    const action = ACTIONS[actionKey];
    const writeTool = action.tools[entities.entityType];
    if (!writeTool) {
      return { unsupported: `L'action « ${action.label.toLowerCase()} » n'est pas disponible pour les ${source.nounPlural} : seules les relances peuvent être programmées sur un contact.` };
    }

    const criteria = this._criteria(entities, text, now, user);
    const due = action.dated ? extractDueDate(text, now) : null;

    const read = new PlanStep({
      id: "step_1",
      kind: STEP_KINDS.READ,
      tool: source.readTool,
      input: this._readInput(entities.entityType, criteria),
      description: `Lire ${criteria.scopeLabel}${criteria.statusLabel ? ` (statut « ${criteria.statusLabel} »)` : ""}`,
    });
    const analyze = new PlanStep({
      id: "step_2",
      kind: STEP_KINDS.ANALYZE,
      description: criteria.analysisLabels.length ? `Retenir les ${source.nounPlural} ${criteria.analysisLabels.join(", ")}` : `Retenir tous les ${source.nounPlural} lus`,
    });

    const goalParts = [`${action.label} pour ${criteria.scopeLabel}`];
    if (criteria.statusLabel) goalParts.push(`« ${criteria.statusLabel} »`);
    if (criteria.analysisLabels.length) goalParts.push(criteria.analysisLabels.join(", "));

    return {
      plan: {
        goal: goalParts.join(" "),
        entityType: entities.entityType,
        source,
        actionKey,
        action: { key: actionKey, label: action.label, tool: writeTool, dueDate: due ? due.iso : null, dueDateExplicit: due ? due.explicit : null },
        criteria,
        steps: [read, analyze],
      },
    };
  }

  _criteria(entities, text, now, user) {
    const adminTier = ["admin", "superadmin", "superadmin2"].includes(user && user.role);
    const mine = !adminTier || entities.ownership === "mine";
    const noun = SOURCES[entities.entityType].nounPlural;
    const criteria = { mine, scopeLabel: mine ? `vos ${noun}` : `tous les ${noun}`, status: null, statusLabel: null, olderThanDays: null, analysisLabels: [] };

    if (entities.entityType === "project") {
      if (entities.status) {
        criteria.status = entities.status;
        criteria.statusLabel = entities.status;
      }
      if (entities.relance) {
        criteria.olderThanDays = entities.relance.notRelancedWithinDays;
        criteria.analysisLabels.push(`sans relance depuis plus de ${criteria.olderThanDays} jours (ou jamais relancés)`);
      }
    } else {
      const status = CONTACT_STATUSES.find((s) => s.pattern.test(text));
      if (status) {
        criteria.status = status.value;
        criteria.statusLabel = status.label;
      }
      const days = (entities.relance && entities.relance.notRelancedWithinDays) || (entities.period && entities.period.days) || null;
      if (days) {
        criteria.olderThanDays = days;
        criteria.analysisLabels.push(`sans appel depuis plus de ${days} jours (ou jamais appelés)`);
      }
    }
    if (criteria.status) criteria.analysisLabels.unshift(`au statut « ${criteria.statusLabel} »`);
    criteria.analysisLabels = [...new Set(criteria.analysisLabels)];
    criteria.nowMs = now.getTime();
    return criteria;
  }

  _readInput(entityType, criteria) {
    if (entityType === "project") {
      const input = { isArchived: false, limit: 100 };
      if (criteria.mine) input.mine = true;
      if (criteria.status) input.statut = criteria.status;
      return input;
    }
    const input = { limit: 100 };
    if (criteria.status) input.status = criteria.status;
    return input;
  }

  /** Filtrage déterministe des lignes réellement lues. */
  analyze(plan, rows) {
    const { criteria, entityType } = plan;
    const limit = criteria.olderThanDays ? criteria.nowMs - criteria.olderThanDays * DAY_MS : null;
    const dateField = entityType === "project" ? "lastRelanceAt" : "dateAppel";
    const statusField = entityType === "project" ? "statut" : "statut";

    const kept = rows.filter((row) => {
      if (criteria.status && normalizeAccents(row[statusField]) !== normalizeAccents(criteria.status)) return false;
      if (limit !== null) {
        const last = row[dateField] ? new Date(row[dateField]).getTime() : null;
        if (last !== null && !Number.isNaN(last) && last >= limit) return false;
      }
      return true;
    });
    // Les plus anciennement relancés (ou jamais) d'abord.
    kept.sort((a, b) => {
      const ta = a[dateField] ? new Date(a[dateField]).getTime() : -Infinity;
      const tb = b[dateField] ? new Date(b[dateField]).getTime() : -Infinity;
      return ta - tb;
    });
    return { kept, excluded: rows.length - kept.length, dateField };
  }

  /**
   * Étapes d'écriture, une par ligne retenue (au plus `maxWrites`). Chaque
   * paramètre vient de la ligne lue ou de la demande — jamais d'ailleurs.
   */
  prepareWrites(plan, keptRows) {
    const contract = READ_CONTRACTS[plan.source.readTool];
    const selected = keptRows.slice(0, this.maxWrites);
    const steps = selected.map((row, index) => {
      const label = contract.label(row);
      return new PlanStep({
        id: `step_${3 + index}`,
        kind: STEP_KINDS.WRITE,
        tool: plan.action.tool,
        input: this._writeInput(plan, row, label),
        target: { entityType: plan.entityType, id: row.id, label, lastDate: row[plan.entityType === "project" ? "lastRelanceAt" : "dateAppel"] || null },
        description: `${plan.action.label} — ${label}${plan.action.dueDate ? ` (le ${frenchDate(plan.action.dueDate)})` : ""}`,
      });
    });
    return { steps, truncated: keptRows.length > selected.length, totalCandidates: keptRows.length };
  }

  _writeInput(plan, row, label) {
    const reason = plan.criteria.analysisLabels.length ? ` (${plan.criteria.analysisLabels.join(", ")})` : "";
    const commentaire = truncate(`${plan.action.label} préparée par le Copilot IA${reason}.`, 2000);
    if (plan.action.tool === "schedule_commercial_contact_relance") {
      return { contactId: row.id, dateRelance: plan.action.dueDate, commentaire };
    }
    const input = { projectId: row.id, typeAction: plan.action.label, commentaire, priorite: "normale" };
    if (plan.action.dueDate) {
      input.dateRelance = plan.action.dueDate;
      input.reminderMessage = truncate(`Relancer le projet « ${label} »`, 500);
    }
    return input;
  }
}

module.exports = { TaskPlanner, SOURCES, ACTIONS, extractDueDate, frenchDate, DEFAULT_MAX_WRITES };
