"use strict";

const { BaseAgent } = require("./baseAgent");
const { tokenize } = require("../utils/tokenize");
const { parseMonthDateRange, parseAmountThreshold, computeStartOfWeek, filterByThreshold, usersWithNoActivitySince } = require("../reasoning/searchQueryParser");
const { buildSearchAnswer } = require("../reasoning/searchAnswerBuilder");

// 2 Tools, 2 modules différents (Projects, Commercial-Contacts) — "plusieurs
// AI Tools", jamais un Tool créé pour l'occasion (voir ADVANCED_SEARCH_AGENT.md).
const ALLOWED_TOOL_NAMES = ["list_projects", "get_commercial_contact_kpi"];

const PERIOD_MARKERS = ["créé", "créée", "créés", "créées", "cree", "creee", "crees", "creees"];
const AMOUNT_CONTEXT_MARKERS = ["montant", "marche", "marché", "budget", "projet", "projets", "devis"];
const PURCHASE_MARKERS = ["achete", "achète", "acheté", "acheter", "achat", "achats"];
const COMMERCIAL_MARKERS = ["commercial", "commerciaux"];
const ACTIVITY_MARKERS = ["activite", "activité"];

// Chaque type de recherche = un marqueur LOCAL à cet Agent (même mécanisme
// que ATTENTION_MARKERS de ProjectAgent/DOMAIN_DEFINITIONS de
// BusinessAnalystAgent — jamais un mot-clé du catalogue d'intentions
// global) + une fonction pure de `reasoning/searchQueryParser.js` pour
// interpréter le critère + le Tool réel qui le vérifie.
const QUERY_DEFINITIONS = [
  {
    key: "projects_by_period",
    label: "Projets créés sur une période",
    detect: (terms) => PERIOD_MARKERS.some((m) => terms.includes(m)),
    run: async (ctx) => {
      const parsed = parseMonthDateRange(ctx.message, { now: ctx.now });
      if (!parsed.supported) {
        return { label: "Projets créés sur une période", supported: false, lines: [], note: 'Aucun mois reconnu dans la demande (ex. "juin", "mars 2026").' };
      }
      const tool = ctx.toolByName.get("list_projects");
      if (!tool) {
        return { label: "Projets créés sur une période", supported: false, lines: [], note: 'Le Tool "list_projects" n\'est pas disponible pour votre profil.' };
      }
      const raw = await ctx.invoke(tool, { dateFrom: parsed.dateFrom, dateTo: parsed.dateTo, limit: 100 });
      const projects = (raw && raw.data) || [];
      const lines = projects.slice(0, 15).map((p) => `${p.nomProjet} (créé le ${String(p.createdAt || "").slice(0, 10)}).`);
      if (projects.length > 15) lines.push(`… et ${projects.length - 15} autre(s) projet(s).`);
      return { label: `Projets créés en ${parsed.label} (${projects.length} au total)`, supported: true, lines };
    },
  },
  {
    key: "amount_threshold",
    label: "Seuil de montant",
    detect: (terms) => AMOUNT_CONTEXT_MARKERS.some((m) => terms.includes(m)),
    run: async (ctx) => {
      const parsed = parseAmountThreshold(ctx.message);
      if (!parsed.supported) return { label: "Seuil de montant", supported: false, lines: [], note: parsed.note };

      const tool = ctx.toolByName.get("list_projects");
      if (!tool) return { label: "Seuil de montant", supported: false, lines: [], note: 'Le Tool "list_projects" n\'est pas disponible pour votre profil.' };

      // `list_projects` n'a pas de filtre serveur sur `montantMarche` — un
      // post-traitement sur des données déjà réelles, jamais un chiffre
      // inventé (voir ADVANCED_SEARCH_AGENT.md).
      const raw = await ctx.invoke(tool, { sortBy: "montantMarche", sortDir: "desc", limit: 200 });
      const projects = (raw && raw.data) || [];
      const filtered = filterByThreshold(projects, "montantMarche", parsed.operator, parsed.amount);
      const lines = filtered.slice(0, 15).map((p) => `${p.nomProjet} — ${p.montantMarche} €.`);
      if (filtered.length > 15) lines.push(`… et ${filtered.length - 15} autre(s) projet(s).`);

      // "Devis" : aucune donnée de montant n'existe pour ce concept (voir
      // ADVANCED_SEARCH_AGENT.md) — jamais une réponse silencieusement
      // substituée ; l'alternative réelle (montant du marché) est proposée
      // clairement étiquetée comme une donnée DIFFÉRENTE.
      if (ctx.terms.includes("devis")) {
        return {
          label: "Devis (donnée indisponible) — alternative : montant du marché",
          supported: true,
          lines: [
            "Aucune donnée de montant n'existe pour les devis dans le CRM (le document de devis est stocké sans montant associé) — impossible de répondre à cette recherche sans inventer une donnée.",
            `À la place, voici les projets dont le MONTANT DU MARCHÉ (une donnée contractuelle différente, pas un devis) est ${parsed.operatorLabel} ${parsed.amount} € (${filtered.length} au total) :`,
            ...lines,
          ],
        };
      }

      return { label: `Projets dont le montant du marché est ${parsed.operatorLabel} ${parsed.amount} € (${filtered.length} au total)`, supported: true, lines };
    },
  },
  {
    key: "clients_never_purchased",
    label: "Clients n'ayant jamais acheté",
    detect: (terms) => terms.includes("jamais") && PURCHASE_MARKERS.some((m) => terms.includes(m)),
    run: async () => ({
      label: "Clients n'ayant jamais acheté",
      supported: false,
      lines: [],
      note:
        "Aucun Tool existant ne liste les contacts commerciaux individuellement, et aucun champ du CRM ne trace un montant ou un statut d'achat (le champ le plus proche, l'étape de pipeline commercial, n'est agrégé par aucun Tool) — impossible de répondre sans inventer une donnée.",
    }),
  },
  {
    key: "commercials_no_activity",
    label: "Commerciaux sans activité cette semaine",
    detect: (terms) => COMMERCIAL_MARKERS.some((m) => terms.includes(m)) && ACTIVITY_MARKERS.some((m) => terms.includes(m)),
    run: async (ctx) => {
      const tool = ctx.toolByName.get("get_commercial_contact_kpi");
      if (!tool) {
        return { label: "Commerciaux sans activité cette semaine", supported: false, lines: [], note: 'Le Tool "get_commercial_contact_kpi" n\'est pas disponible pour votre profil.' };
      }
      const raw = await ctx.invoke(tool, {});
      const usersPerformance = raw && raw.usersPerformance;
      if (!Array.isArray(usersPerformance)) {
        return {
          label: "Commerciaux sans activité cette semaine",
          supported: false,
          lines: [],
          note: "Cette recherche nécessite une vue globale (réservée aux rôles admin-tier) ; votre profil ne reçoit qu'une vue personnelle.",
        };
      }
      const startOfWeek = computeStartOfWeek(ctx.now);
      const flagged = usersWithNoActivitySince(usersPerformance, startOfWeek);
      const lines = flagged.map((u) => `${u.userName || u.email || u.userId} — dernière mise à jour d'une fiche contact : ${u.lastActivity ? String(u.lastActivity).slice(0, 10) : "jamais"}.`);
      return {
        label: `Commerciaux sans activité cette semaine (proxy : aucune fiche contact mise à jour depuis le ${startOfWeek.toISOString().slice(0, 10)})`,
        supported: true,
        lines,
      };
    },
  },
];

const SYSTEM_PROMPT = [
  "Tu es le Search Agent du CRM CBI Tunisia — le moteur de recherche complexe du Copilot.",
  "Tu comprends des critères multiples (période, seuil de montant, absence",
  "de correspondance) en combinant plusieurs AI Tools, jamais en inventant",
  "un résultat. Quand une donnée demandée n'existe dans aucun Tool (ex. un",
  "montant de devis), tu le dis explicitement plutôt que de deviner.",
].join(" ");

/**
 * # AdvancedSearchAgent — comprendre des recherches complexes, plusieurs AI Tools (`agents/advancedSearchAgent.js`)
 *
 * ## Rôle
 * Prend en charge l'intention `advanced_search` (nouvelle, voir
 * `orchestrator/intentCatalog.js`). Pour CHAQUE type de recherche reconnu
 * dans le message (`QUERY_DEFINITIONS` ci-dessus — plusieurs peuvent être
 * combinés dans une même question, même mécanisme que
 * `BusinessAnalystAgent::_detectDomains`), produit une section de réponse
 * calculée par une fonction pure de `reasoning/searchQueryParser.js`,
 * alimentée EXCLUSIVEMENT par la sortie d'un Tool MCP déjà existant.
 * Aucun marqueur reconnu → un menu honnête de ce qui EST cherchable
 * aujourd'hui (`reasoning/searchAnswerBuilder.js::CAPABILITIES_MENU`),
 * jamais une tentative de deviner l'intention.
 *
 * ## Ce que l'audit a révélé, et comment chaque exemple demandé est traité
 * Voir `orchestrator/ADVANCED_SEARCH_AGENT.md` pour le détail complet.
 * Résumé : "projets créés en juin" et "montant du marché au-dessus d'un
 * seuil" sont pleinement supportés (Tool réel, filtre réel ou
 * post-traitement sur des données réelles). "Devis dépassent 50 000 €" ne
 * peut PAS être répondu littéralement — aucun montant n'est stocké pour un
 * devis dans ce CRM (`ProjectDevis` ne contient qu'un fichier) — une
 * alternative clairement étiquetée (montant du marché, une donnée
 * DIFFÉRENTE) est proposée à la place. "Clients n'ayant jamais acheté" est
 * explicitement `supported: false` : aucun Tool ne liste les contacts
 * commerciaux individuellement, aucun champ ne trace un achat. "Commerciaux
 * sans activité cette semaine" est un PROXY documenté (dernière mise à jour
 * d'une fiche contact commercial, pas "toute activité" au sens large),
 * seulement disponible pour un appelant admin-tier (seul rôle qui reçoit la
 * vue globale `usersPerformance` de `get_commercial_contact_kpi`).
 */
class AdvancedSearchAgent extends BaseAgent {
  async _run({ message }) {
    const terms = tokenize(message);
    const matched = QUERY_DEFINITIONS.filter((def) => def.detect(terms));
    if (matched.length === 0) {
      return { answer: buildSearchAnswer([]), citations: [], toolSteps: [] };
    }

    const toolByName = new Map(this._allowedTools().map((t) => [t.name, t]));
    const toolCache = new Map();
    const toolSteps = [];
    const invoke = this._buildInvoker(toolCache, toolSteps);
    const ctx = { message, terms, toolByName, invoke, now: new Date() };

    const results = [];
    for (const def of matched) {
      try {
        results.push(await def.run(ctx));
      } catch (err) {
        results.push({ label: def.label, supported: false, lines: [], note: `Recherche impossible : ${err.message}` });
      }
    }

    return { answer: buildSearchAnswer(results), citations: [], toolSteps };
  }

  // Un même Tool avec les mêmes paramètres (ex. list_projects réutilisé par
  // 2 types de recherche dans la même question) n'est appelé qu'une fois.
  _buildInvoker(toolCache, toolSteps) {
    return async (tool, input) => {
      const cacheKey = `${tool.name}:${JSON.stringify(input)}`;
      if (toolCache.has(cacheKey)) return toolCache.get(cacheKey);
      const output = await tool.invoke(input);
      const raw = JSON.parse(output);
      toolSteps.push({ tool: tool.name, input, output: raw });
      toolCache.set(cacheKey, raw);
      return raw;
    };
  }
}

function createAdvancedSearchAgent({ chatModel, tools = [], workflowEngine, qaChain = null, memory = null, maxToolCalls, maxHistoryMessages, promptInjectionGuard = null }) {
  return new AdvancedSearchAgent({
    name: "advanced_search_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["advanced_search"],
    requiredRoles: [],
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

module.exports = { createAdvancedSearchAgent, AdvancedSearchAgent, ALLOWED_TOOL_NAMES, QUERY_DEFINITIONS, SYSTEM_PROMPT };
