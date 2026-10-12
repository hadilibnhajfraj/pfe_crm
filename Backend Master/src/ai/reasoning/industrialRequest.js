"use strict";

// Demandes portant sur les fiches industrielles (PROBAR, mélange, maintenance)
// et POR PROMESH — reconnaissance déterministe de CE QUI est demandé :
//
//   list       « donne-moi les fiches PROMESH », « affiche l'historique PROBAR »
//   count      « combien de fiches PROMESH existent ? »
//   get        « consulte la fiche PROMESH numéro 12 »
//   analysis   « analyse la production PROMESH », « résume les fiches PROBAR »
//   create     « crée une nouvelle fiche PROBAR », « je veux saisir une fiche PROMESH »
//   ambiguous  « probar », « PROMESH » — le nom du module seul
//
// Le nom d'un module, seul, n'est JAMAIS une demande de création : il reçoit
// une question courte proposant les actions possibles.
//
// Création : les champs indispensables sont demandés un à un et conservés
// d'un message à l'autre (PendingActionStore) ; l'outil n'est appelé qu'une
// fois les champs réunis ET la création confirmée. Aucune valeur n'est
// supposée (ni machine, ni poste, ni opérateur, ni numéro de séquence).

const { foldLatin } = require("../language/languageDetector");

const MODULES = [
  ["promesh", /\bpromesh\b/],
  ["probar", /\bprobar\b/],
  ["melange", /\bmelanges?\b/],
  ["maintenance", /\bmaintenance\b/],
];
const LABELS = { promesh: "PROMESH", probar: "PROBAR", melange: "MÉLANGE", maintenance: "MAINTENANCE" };

const CREATE = /\bcree[rsz]?\b|\bcreation\b|\bajoute[rsz]?\b|\bajout\b|\bsaisi[rse]?\b|\bsaisis\b|\bnouvel(?:le)?s?\b|\bnouveau\b|\benregistre[rz]?\b|\bcreate\b|\badd\b|\bnew\b/;
// Modification, suppression, validation : chemins existants de l'Agent.
const OTHER_WRITE = /\bmodifie[rsz]?\b|\bmodification\b|\bmets?\b|\bmettre\b|\bsupprime[rsz]?\b|\bsuppression\b|\bvalide[rz]?\b|\bvalidation\b|\bupdate\b|\bdelete\b|\bvalidate\b/;
const COUNT = /\bcombien\b|\bnombre\b|\bhow many\b|\bnumber of\b|\bcount\b/;
const ANALYSIS = /\banalyse[rsz]?\b|\banaly[sz]e\b|\banalysis\b|\bresume[rsz]?\b|\bsynthese\b|\bbilan\b|\bstatistiques?\b|\bstats?\b|\bcompare[rsz]?\b|\bcomparaison\b|\bsummary\b|\boverview\b/;
const LIST = /\bfiches?\b|\bhistoriques?\b|\blistes?\b|\blister\b|\baffiche[rz]?\b|\bdonne[rz]?\b|\bmontre[rz]?\b|\bvoir\b|\bconsulte[rz]?\b|\brecords?\b|\bhistory\b|\blist\b|\bshow\b/;
const SEQUENCE = /\b(?:fiche\S*|sequence|numero|n°|no)\s+(?:promesh\s+|probar\s+)?(?:n°\s*|no\s+|numero\s+|sequence\s+)?#?(\d{1,6})\b/;
// Critère de filtre (machine, poste, date, statut) : chemins existants.
const FILTER = /\bmachines?\b|\bmatin\b|\bnuit\b|\bpostes?\b|\bbrouillons?\b|\bvalidee?s?\b|\bstatut\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\bce mois\b|\bcette semaine\b|\baujourd hui\b|\bhier\b/;

const MACHINE = /\bmachines?\s*(?:n°\s*|no\s+|numero\s+|#\s*)?([a-z0-9][a-z0-9-]{0,9})\b/;
const POSTE = /\b(matin|nuit|morning|night)\b/;
const CONFIRM = /^(?:oui|ok|d accord|confirme[rz]?|je confirme|valide[rz]?|c est bon|yes|confirm|go)\b/;
const CANCEL = /^(?:non|annule[rz]?|stop|abandonne[rz]?|laisse tomber|cancel|no)\b/;

function normalize(text) {
  return foldLatin(String(text || "")).replace(/[’`']/g, " ").replace(/[?.!,;:«»"()]/g, " ").replace(/\s+/g, " ").trim();
}

// Machine et poste lus dans le message — jamais déduits.
function parseFicheFields(message) {
  const t = normalize(message);
  const fields = {};
  const machine = t.match(MACHINE);
  if (machine && !["et", "de", "du", "la", "le", "pour", "avec", "poste", "matin", "nuit"].includes(machine[1])) fields.machine = machine[1].toUpperCase();
  const poste = t.match(POSTE);
  if (poste) fields.poste = poste[1] === "morning" ? "matin" : poste[1] === "night" ? "nuit" : poste[1];
  return fields;
}

/**
 * @returns {null | { module: string|null, modules: string[], operation: "list"|"count"|"get"|"analysis"|"create"|"ambiguous",
 *   sequence: number|null, fields: {machine?: string, poste?: string} }}
 */
function detectIndustrialRequest(message) {
  const raw = String(message || "").trim();
  if (!raw || raw.length > 300) return null;
  const t = normalize(raw);
  const modules = MODULES.filter(([, re]) => re.test(t)).map(([name]) => name);
  // « le mélange PROBAR » : une fiche du module mélange (pour la ligne PROBAR).
  const module = modules.length === 1 ? modules[0] : modules.length === 2 && modules.includes("melange") && modules.includes("probar") ? "melange" : null;
  const base = { module, modules, sequence: null, fields: parseFicheFields(raw) };
  if (OTHER_WRITE.test(t)) return null;
  if (CREATE.test(t)) return { ...base, operation: "create" };
  const sequence = t.match(SEQUENCE);
  if (sequence) return { ...base, operation: "get", sequence: parseInt(sequence[1], 10) };
  // Le nom du module seul (« probar », « PROMESH », « les fiches » exclu) : ambigu.
  const words = t.split(" ").filter(Boolean);
  if (modules.length && words.every((w) => MODULES.some(([, re]) => re.test(w)) || ["pro", "por", "le", "la", "les", "module", "modules", "et"].includes(w))) {
    return { ...base, operation: "ambiguous" };
  }
  if (FILTER.test(t)) return null;
  if (COUNT.test(t)) return { ...base, operation: "count" };
  if (ANALYSIS.test(t)) return { ...base, operation: "analysis" };
  if (LIST.test(t)) return { ...base, operation: "list" };
  return null;
}

// ── Réponses ────────────────────────────────────────────────────────────────

function buildAmbiguousAnswer(modules) {
  const label = modules.length === 1 ? LABELS[modules[0]] : null;
  if (!label) {
    return ["De quel module parlez-vous, et que souhaitez-vous faire ?", "• « liste des fiches PROBAR » ou « liste des fiches PROMESH »", "• « combien de fiches PROMESH »", "• « crée une fiche PROBAR »"].join("\n");
  }
  return [
    `Que souhaitez-vous faire avec les fiches ${label} ?`,
    `• Voir la liste : « liste des fiches ${label} »`,
    `• Connaître leur nombre : « combien de fiches ${label} »`,
    `• Analyser la production : « analyse la production ${label} »`,
    `• Saisir une nouvelle fiche : « crée une fiche ${label} »`,
  ].join("\n");
}

function buildCountAnswer(module, total, breakdown = null) {
  const label = LABELS[module];
  if (!total) return `Aucune fiche ${label} n'est enregistrée dans votre périmètre.`;
  const lines = [`Il existe ${total} fiche${total > 1 ? "s" : ""} ${label} dans votre périmètre.`];
  if (breakdown && breakdown.length) lines.push("", ...breakdown);
  return lines.join("\n");
}

function tally(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

function dateRange(dates) {
  const times = dates.map((d) => new Date(d).getTime()).filter((n) => !Number.isNaN(n));
  if (!times.length) return null;
  const fmt = (n) => new Date(n).toLocaleDateString("fr-FR");
  return `du ${fmt(Math.min(...times))} au ${fmt(Math.max(...times))}`;
}

/**
 * Analyse calculée sur les fiches RÉELLEMENT lues.
 * @param {object} o
 * @param {string} o.module
 * @param {object[]} o.list       fiches lues
 * @param {number} o.total        total annoncé par l'outil
 * @param {{ date: string, quantity: string, quantityUnit: string, quality: string, status?: string }} o.keys noms réels des champs
 */
function buildAnalysisAnswer({ module, list, total, keys }) {
  const label = LABELS[module];
  if (!total) return `Aucune fiche ${label} à analyser dans votre périmètre.`;
  const lines = [`📊 ANALYSE DES FICHES ${label}`, "", `${list.length} fiche${list.length > 1 ? "s" : ""} analysée${list.length > 1 ? "s" : ""}.`];
  if (list.length < total) lines.push(`⚠️ Lecture incomplète : ${list.length} fiches lues sur ${total}. Cette analyse n'est pas exhaustive.`);
  const range = dateRange(list.map((f) => f[keys.date]).filter(Boolean));
  if (range) lines.push(`Période couverte : ${range}.`);
  const section = (title, values, none) => {
    const rows = tally(values.map((v) => (v == null || v === "" ? none : String(v))));
    if (rows.length) lines.push("", `${title} :`, ...rows.map(([name, n]) => `• ${name} : ${n}`));
  };
  if (keys.status) section("Par statut", list.map((f) => f[keys.status]), "sans statut");
  section("Par poste", list.map((f) => f.poste), "poste non renseigné");
  section("Par machine", list.map((f) => f.machine), "machine non renseignée");
  section("Qualité / conformité", list.map((f) => f[keys.quality]), "non renseignée");
  const quantities = list.map((f) => Number(f[keys.quantity])).filter((n) => Number.isFinite(n));
  if (quantities.length) {
    const sum = Math.round(quantities.reduce((a, b) => a + b, 0) * 100) / 100;
    lines.push("", `Production enregistrée : ${sum}${keys.quantityUnit ? ` ${keys.quantityUnit}` : ""} sur ${quantities.length} fiche${quantities.length > 1 ? "s" : ""} renseignée${quantities.length > 1 ? "s" : ""}.`);
  }
  return lines.join("\n");
}

// ── Création guidée ─────────────────────────────────────────────────────────

const FIELD_LABELS = { machine: "la machine (ex. « machine 1 »)", poste: "le poste (« matin » ou « nuit »)" };
const FIELD_NAMES = { machine: "Machine", poste: "Poste" };

function classifyCreationReply(message) {
  const t = normalize(message);
  if (CANCEL.test(t)) return "cancel";
  if (CONFIRM.test(t)) return "confirm";
  return null;
}

// Un message qui poursuit une création en cours : confirmation, annulation, ou
// un des champs attendus. Tout autre message suit le routage normal.
function isFicheCreationFollowUp(message) {
  if (classifyCreationReply(message)) return true;
  const fields = parseFicheFields(message);
  if (!Object.keys(fields).length) return false;
  const request = detectIndustrialRequest(message);
  if (request) return request.operation === "create";
  // « machine 2 », « poste nuit », « machine 1 le matin » : une réponse courte,
  // pas une question (« combien de fiches PROBAR de la machine 2 ? »).
  const t = normalize(message);
  return t.split(" ").length <= 6 && !COUNT.test(t) && !ANALYSIS.test(t) && !LIST.test(t) && !OTHER_WRITE.test(t);
}

/**
 * Création guidée d'une fiche, commune aux deux Agents.
 * @param {object} o
 * @param {string} o.type            type du PendingAction (propre à l'Agent)
 * @param {string} o.module
 * @param {string[]} o.required      champs indispensables (ceux de l'outil / de l'écran)
 * @param {string} o.optionalNote    ce qui pourra être complété ensuite
 * @param {(fields) => object} o.toToolInput
 * @param {(fields) => Promise<string|null>} [o.warn]   avertissement avant confirmation (fiche existante…)
 * @param {(output) => string} o.describeResult
 */
async function runGuidedCreation({ agent, store, type, module, required, optionalNote, tool, toolName, toToolInput, warn = null, describeResult, message, user, conversationId }) {
  const label = LABELS[module];
  const pendingRaw = store ? store.peek(conversationId) : null;
  const pending = pendingRaw && pendingRaw.type === type && pendingRaw.actingUserId === user.id && pendingRaw.module === module ? pendingRaw : null;
  const reply = classifyCreationReply(message);

  if (pending && reply === "cancel") {
    store.consume(conversationId);
    return { answer: `Création annulée : aucune fiche ${label} n'a été enregistrée.`, citations: [], toolSteps: [], pendingAction: null };
  }

  const fields = { ...(pending ? pending.fields : {}), ...parseFicheFields(message) };
  const missing = required.filter((key) => !fields[key]);
  const known = Object.keys(fields).length ? ["Déjà noté :", ...Object.entries(fields).map(([k, v]) => `• ${FIELD_NAMES[k] || k} : ${v}`), ""] : [];

  if (missing.length) {
    if (store) store.propose(conversationId, { type, actingUserId: user.id, module, fields, stage: "collect" });
    return {
      answer: [`Pour créer une fiche ${label}, il me manque ${missing.length > 1 ? "ces informations" : "cette information"} :`, ...missing.map((k) => `• ${FIELD_LABELS[k] || k}`), "", ...known, optionalNote, "Rien n'est enregistré pour l'instant. Écrivez « annule » pour abandonner."].join("\n"),
      citations: [],
      toolSteps: [],
      pendingAction: null,
    };
  }

  const toolInput = toToolInput(fields);
  if (pending && pending.stage === "confirm" && reply === "confirm") {
    store.consume(conversationId);
    try {
      const output = JSON.parse(await tool.invoke(toolInput));
      return { answer: [`✅ Fiche ${label} enregistrée.`, describeResult(output)].filter(Boolean).join("\n"), citations: [], toolSteps: [{ tool: toolName, input: toolInput, output: "fiche enregistrée" }], pendingAction: null };
    } catch (err) {
      agent.logger.error(`[FICHE_CREATION_FAILED] ${toolName} a échoué (module ${module}) : ${err.message}`, err);
      return {
        answer: `La fiche ${label} n'a pas pu être enregistrée : l'opération a été refusée ou a échoué. Aucune fiche n'a été créée. Vérifiez la machine et le poste, puis réessayez ; si le problème persiste, prévenez l'administrateur.`,
        citations: [],
        toolSteps: [{ tool: toolName, input: toolInput, failed: true, output: { error: "FICHE_CREATION_FAILED" } }],
        pendingAction: null,
      };
    }
  }

  const warning = warn ? await warn(fields).catch(() => null) : null;
  const action = { type, actingUserId: user.id, module, fields, stage: "confirm", steps: [{ tool: toolName, input: toolInput, reason: `Créer une fiche ${label}` }] };
  if (store) store.propose(conversationId, action);
  return {
    answer: [`Je suis prêt à créer une fiche ${label} avec :`, ...required.map((k) => `• ${FIELD_NAMES[k] || k} : ${fields[k]}`), ...(warning ? ["", `⚠️ ${warning}`] : []), "", optionalNote, "Répondez « confirme » pour enregistrer, ou « annule » pour abandonner."].join("\n"),
    citations: [],
    toolSteps: [],
    pendingAction: store ? { type, steps: action.steps } : null,
  };
}

module.exports = {
  detectIndustrialRequest,
  parseFicheFields,
  classifyCreationReply,
  isFicheCreationFollowUp,
  buildAmbiguousAnswer,
  buildCountAnswer,
  buildAnalysisAnswer,
  runGuidedCreation,
  LABELS,
  INDUSTRIAL_CREATION_TYPE: "create_industrial_fiche",
  PROMESH_CREATION_TYPE: "create_por_promesh_fiche",
};
