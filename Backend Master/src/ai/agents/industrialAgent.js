"use strict";

const { BaseAgent } = require("./baseAgent");
const { AgentError } = require("./errors");
const { tokenize } = require("../utils/tokenize");

// Les 3 VRAIES valeurs de l'ENUM IndustrialRecord.module (voir
// src/models/IndustrialRecord.js) — jamais inventées. Détection déterministe
// scopée à CET Agent (jamais un mot-clé du catalogue d'intentions global —
// voir intentCatalog.js/industrialPromeshOverride.js pour la raison précise
// : "maintenance" y collisionnerait avec l'intention CRM `maintenance`,
// distincte de ce module industriel ; ce risque n'existe pas ICI, une fois
// `industrial_agent` déjà sélectionné).
const MODULE_MARKERS = { probar: "probar", melange: "melange", mélange: "melange", maintenance: "maintenance" };

const FILTER_SIGNAL_WORDS = ["machine", "matin", "nuit", "poste"];
const DATE_SIGNAL_RE = /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/;

// "Crée une fiche de production industrielle pour le mélange PROBAR."
// mentionne aussi "fiche"+"probar"/"melange" sans aucun signal de filtre :
// sans cette garde, le chemin déterministe "toutes les fiches <module>"
// l'intercepterait à tort au lieu de laisser create_industrial_record gérer
// la création (chemin générique, inchangé par cette mission).
const WRITE_VERB_WORDS = ["cree", "crée", "créer", "creer", "ajoute", "ajouter", "modifie", "modifier", "met", "mettre", "supprime", "supprimer"];

// Les 5 Tools du module Industrial-Records (voir mcp/tools/industrial/).
const ALLOWED_TOOL_NAMES = [
  "create_industrial_record",
  "get_industrial_record",
  "list_industrial_records",
  "update_industrial_record",
  "delete_industrial_record",
];

// Identique au requiredRoles (READ_WRITE_ROLES) déclaré par chacun des Tools
// de ce module (voir mcp/tools/industrial/*.js) — aucun Tool industriel
// n'est ouvert à tout authentifié, contrairement à Projects/Pipeline/
// Maintenance ; le gate de l'Agent peut donc refléter fidèlement celui des
// Tools.
const REQUIRED_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];

const SYSTEM_PROMPT = [
  "Tu es l'Agent Industriel du CRM CBI Tunisia.",
  "Tu aides à créer, consulter, mettre à jour et supprimer des fiches",
  "industrielles (production), exclusivement via les Tools fournis.",
  "Confirme toujours les champs fournis avant une création ou une mise à jour.",
  "Les fiches industrielles couvrent 3 domaines réels et distincts, valeur",
  "exacte du champ module : probar, melange, maintenance. Les fiches POR",
  "PROMESH (numéro de séquence, opérateur, machine, poste) sont un module",
  "SÉPARÉ, jamais géré par cet Agent ni par list_industrial_records — ne",
  "réponds jamais à une demande PROMESH avec une fiche PROBAR/MELANGE, et ne",
  "devine jamais un module si le message ne le précise pas clairement.",
].join(" ");

// Mission "CORRIGER DÉFINITIVEMENT LES REQUÊTES FICHES PRO PROMESH / PRO
// PROBAR" — reproduit en direct : "donne-moi les fiches PROBAR"/"donne-moi
// toutes les fiches PROBAR" (aucun mot-clé de filtre réel) laissaient le LLM
// deviner l'input de list_industrial_records SANS aucune garde
// (`requireToolUse` absent ici, volontairement — voir plus bas) ; observé
// une fois : une réponse citant "PROBAR" sans jamais avoir appelé le Tool.
// Un chemin déterministe pour "toutes les fiches <module>" élimine cette
// classe d'échec — même architecture que PorPromeshAgent::_run() ci-dessus.
class IndustrialAgent extends BaseAgent {
  async _run({ message, user, conversationId }) {
    if (!this._looksLikeFilteredQuery(message)) {
      const module = this._extractModule(message);
      if (module && this._looksLikeFichesQuery(message)) {
        return this._runModuleListQuery(module);
      }
    }
    return super._run({ message, user, conversationId });
  }

  _looksLikeFilteredQuery(message) {
    if (DATE_SIGNAL_RE.test(message)) return true;
    const terms = new Set(tokenize(message));
    return FILTER_SIGNAL_WORDS.some((w) => terms.has(w)) || WRITE_VERB_WORDS.some((w) => terms.has(w));
  }

  _extractModule(message) {
    const terms = tokenize(message);
    for (const t of terms) {
      if (MODULE_MARKERS[t]) return MODULE_MARKERS[t];
    }
    return null;
  }

  _looksLikeFichesQuery(message) {
    const terms = new Set(tokenize(message));
    return terms.has("fiche") || terms.has("fiches");
  }

  _findRealTool(name) {
    return this._allowedTools().find((t) => t.name === name) || null;
  }

  async _runModuleListQuery(module) {
    const tool = this._findRealTool("list_industrial_records");
    if (!tool) {
      throw new AgentError(`Agent "${this.name}" has no "list_industrial_records" Tool available.`);
    }
    const toolInput = { module };
    const rawOutput = await tool.invoke(toolInput);
    // Forme RÉELLE vérifiée (industrialRecord.service.js::listRecords) :
    // {data, total} — jamais devinée.
    const { data, total } = JSON.parse(rawOutput);
    const list = Array.isArray(data) ? data : [];
    return {
      answer: this._buildModuleListAnswer(module, list, typeof total === "number" ? total : list.length),
      citations: [],
      toolSteps: [{ tool: "list_industrial_records", input: toolInput, output: `${list.length} fiche(s) module=${module}` }],
    };
  }

  _buildModuleListAnswer(module, list, total) {
    const label = module.toUpperCase();
    if (total === 0) {
      return `Aucune fiche ${label} n'a été trouvée.`;
    }
    const shown = list.length;
    const lines = [`📋 Fiches ${label} — ${total} résultat(s)${shown < total ? ` (${shown} affiché(s) ici)` : ""}`, ""];
    list.forEach((f) => {
      const date = f.dateFiche ? new Date(f.dateFiche).toLocaleDateString("fr-FR") : "date non renseignée";
      const machine = f.machine ? `Machine ${f.machine}` : "machine non renseignée";
      lines.push(`${date} — ${machine}${f.poste ? ` — ${f.poste}` : ""}`);
    });
    if (total > shown) lines.push("", `... et ${total - shown} autre(s) fiche(s) non affichée(s) ici.`);
    return lines.join("\n");
  }
}

function createIndustrialAgent({ chatModel, tools = [], workflowEngine, qaChain = null, memory = null, maxToolCalls, maxHistoryMessages, promptInjectionGuard = null }) {
  return new IndustrialAgent({
    name: "industrial_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["industrial"],
    requiredRoles: REQUIRED_ROLES,
    allowedEmails: [],
    chatModel,
    tools,
    allowedToolNames: ALLOWED_TOOL_NAMES,
    workflowEngine,
    qaChain,
    memory,
    maxToolCalls,
    maxHistoryMessages,
    promptInjectionGuard,
  });
}

module.exports = { createIndustrialAgent, IndustrialAgent, ALLOWED_TOOL_NAMES, REQUIRED_ROLES, SYSTEM_PROMPT };
