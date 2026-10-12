"use strict";

const { BaseAgent } = require("./baseAgent");
const { tokenize } = require("../utils/tokenize");
const {
  analyzeKpiDomain,
  analyzeProjectsDomain,
  analyzeSalesDomain,
  analyzePipelineDomain,
  analyzeDevisDomain,
  analyzeActivitiesDomain,
  analyzeInterventionsDomain,
  analyzePerformanceDomain,
} = require("../reasoning/businessAnalyzer");
const { buildBusinessAnalysisAnswer } = require("../reasoning/businessAnalysisAnswerBuilder");

// Les Tools RÉELLEMENT utilisés — jamais un nouveau Tool créé pour cette
// passe (voir BUSINESS_ANALYST.md, "Toujours utiliser les AI Tools
// existants"). `list_pipeline_stages` est délibérément ABSENT : il n'expose
// aucun décompte de projets par étape (vérifié, voir businessAnalyzer.js) —
// get_professional_dashboard.pipeline est le seul Tool existant qui associe
// un décompte à chaque étape.
const ALLOWED_TOOL_NAMES = [
  "get_dashboard_kpis",
  "get_professional_dashboard",
  "list_projects",
  "get_commercial_contact_kpi",
  "get_commercial_contact_analytics",
  "get_maintenance_stats",
];

// Un domaine = un marqueur lexical LOCAL à cet Agent (même mécanisme que
// ATTENTION_MARKERS de ProjectAgent — jamais un mot-clé du catalogue
// d'intentions global), le Tool existant qui l'alimente (ou `null` pour
// "devis", volontairement non couvert — voir businessAnalyzer.js), et la
// fonction d'analyse pure de reasoning/businessAnalyzer.js à lui appliquer.
const DOMAIN_DEFINITIONS = [
  { key: "kpi", label: "KPI", markers: ["kpi", "kpis", "indicateur", "indicateurs"], tool: "get_dashboard_kpis", analyze: (raw) => analyzeKpiDomain(raw) },
  {
    key: "projets",
    label: "Projets",
    markers: ["projet", "projets"],
    tool: "list_projects",
    toolInput: { limit: 100, isArchived: false },
    analyze: (raw) => analyzeProjectsDomain((raw && raw.data) || []),
  },
  {
    key: "ventes",
    label: "Ventes",
    markers: ["vente", "ventes", "commercial", "commerciaux"],
    tool: "get_commercial_contact_analytics",
    analyze: (raw) => analyzeSalesDomain(raw),
  },
  {
    key: "pipeline",
    label: "Pipeline",
    markers: ["pipeline", "opportunite", "opportunité", "opportunites", "opportunités"],
    tool: "get_professional_dashboard",
    analyze: (raw) => analyzePipelineDomain((raw && raw.pipeline) || {}),
  },
  { key: "devis", label: "Devis", markers: ["devis"], tool: null, analyze: () => analyzeDevisDomain() },
  {
    key: "activites",
    label: "Activités",
    markers: ["activite", "activité", "activites", "activités"],
    tool: "list_projects",
    toolInput: { limit: 100, isArchived: false },
    analyze: (raw) => analyzeActivitiesDomain((raw && raw.data) || []),
  },
  {
    key: "interventions",
    label: "Interventions",
    markers: ["intervention", "interventions", "maintenance", "panne", "pannes"],
    tool: "get_maintenance_stats",
    analyze: (raw) => analyzeInterventionsDomain(raw),
  },
  {
    key: "performance",
    label: "Performance",
    markers: ["performance", "performances"],
    tool: "get_professional_dashboard",
    analyze: (raw) => analyzePerformanceDomain(raw),
  },
];

const SYSTEM_PROMPT = [
  "Tu es le Business Analyst Agent du CRM CBI Tunisia.",
  "Tu analyses les données réelles du CRM (KPI, projets, ventes, pipeline,",
  "devis, activités, interventions, performance) exclusivement via les Tools",
  "fournis, jamais en inventant un chiffre.",
  "Pour chaque réponse, explique le résultat, les causes probables, les",
  "risques identifiés, puis propose des recommandations concrètes.",
].join(" ");

/**
 * # BusinessAnalystAgent — analyser les données du CRM, jamais en inventer une
 *
 * ## Rôle
 * Prend en charge l'intention `business_analysis` (nouvelle, voir
 * `orchestrator/intentCatalog.js`). Pour CHAQUE réponse, produit une
 * analyse à 4 volets — **Résultat**, **Causes**, **Risques**,
 * **Recommandations** — jamais une simple liste de chiffres bruts. Chaque
 * volet est calculé par une fonction pure de `reasoning/businessAnalyzer.js`,
 * elle-même alimentée EXCLUSIVEMENT par la sortie d'un Tool MCP déjà
 * existant (`ALLOWED_TOOL_NAMES` ci-dessus) — voir `BUSINESS_ANALYST.md`
 * pour la correspondance exacte domaine → Tool → champs consommés.
 *
 * ## Détection de domaine — locale à cet Agent
 * `_detectDomains()` cherche, dans le message, les marqueurs lexicaux de
 * chacun des 8 domaines demandés (`DOMAIN_DEFINITIONS`) — plusieurs domaines
 * peuvent être détectés dans une même question ("Analyse les projets et le
 * pipeline"). Si aucun marqueur de domaine ne correspond, retombe sur
 * `["performance"]` (une vue d'ensemble) plutôt que sur le chemin
 * tool-calling par défaut de `BaseAgent` : contrairement à `ProjectAgent`
 * (où seule une question d'attention déclenche le raisonnement
 * déterministe), CET Agent applique la structure à 4 volets à TOUTE
 * question qui atteint son intention — c'est tout son rôle.
 *
 * ## "Devis" — la garantie "ne jamais inventer" rendue concrète
 * Aucun Tool MCP existant n'expose de métrique dédiée aux devis (vérifié,
 * voir `businessAnalyzer.js::analyzeDevisDomain`). Plutôt que d'inventer un
 * chiffre pour "avoir une réponse", ce domaine renvoie explicitement
 * `supported: false` avec une explication — voir
 * `test/ai.agents.businessAnalystAgent.test.js`, "ne invente jamais un
 * chiffre de devis".
 *
 * ## Un Tool qui échoue n'invalide pas toute la réponse
 * Chaque domaine appelle son Tool indépendamment ; un échec (ex.
 * `get_professional_dashboard` refusé à un rôle non admin-tier) devient une
 * note honnête ("Impossible d'analyser ce domaine : ...") pour CE domaine
 * uniquement — les autres domaines demandés dans la même question restent
 * analysés normalement. Un même Tool appelé par plusieurs domaines dans une
 * même question (`list_projects` pour "projets" et "activités",
 * `get_professional_dashboard` pour "pipeline" et "performance") n'est
 * appelé QU'UNE FOIS (mise en cache locale au tour de conversation).
 */
// Le refus traverse l'adaptateur d'outils sous forme d'une erreur simple :
// reconnu par son code (permission refusée du serveur d'outils) ou son libellé.
function isToolPermissionDenial(err) {
  return Boolean(err) && (err.code === -32001 || err.code === "PERMISSION_DENIED" || String(err.message || "").includes("is not allowed to call tool"));
}

class BusinessAnalystAgent extends BaseAgent {
  async _run({ message }) {
    const domainKeys = this._detectDomains(message);
    return this._runAnalysis(domainKeys);
  }

  _detectDomains(message) {
    const terms = new Set(tokenize(message));
    const matched = DOMAIN_DEFINITIONS.filter((def) => def.markers.some((marker) => terms.has(marker))).map((def) => def.key);
    return matched.length > 0 ? matched : ["performance"];
  }

  async _runAnalysis(domainKeys) {
    const toolByName = new Map(this._allowedTools().map((t) => [t.name, t]));
    const toolCache = new Map();
    const toolErrors = new Map();
    const toolSteps = [];
    const analyses = [];

    for (const key of domainKeys) {
      const def = DOMAIN_DEFINITIONS.find((d) => d.key === key);
      const raw = def.tool ? await this._invokeCached(def, toolByName, toolCache, toolErrors, toolSteps) : null;

      let analysis;
      if (def.tool && raw === undefined) {
        const reason = toolErrors.get(def.tool) || `le Tool "${def.tool}" n'est pas disponible pour votre profil`;
        analysis = { supported: false, result: [], causes: [], risks: [], recommendations: [], note: `Impossible d'analyser ce domaine : ${reason}.` };
      } else {
        analysis = def.analyze(raw);
      }
      analyses.push({ domain: def.key, label: def.label, analysis });

      // Étape de RAISONNEMENT (pas un Tool MCP réel) — voir
      // orchestrator/explainabilityBuilder.js.
      toolSteps.push({
        tool: "analyze_business_domain",
        synthetic: true,
        description: analysis.supported
          ? `Domaine "${def.label}" : ${analysis.result.length} résultat(s), ${analysis.causes.length} cause(s), ${analysis.risks.length} risque(s), ${analysis.recommendations.length} recommandation(s).`
          : `Domaine "${def.label}" : ${analysis.note}`,
        input: { domain: def.key },
        output: analysis,
      });
    }

    return { answer: buildBusinessAnalysisAnswer(analyses), citations: [], toolSteps };
  }

  // Un Tool requis par PLUSIEURS domaines dans la même question (ex.
  // list_projects pour "projets" et "activités") n'est invoqué qu'une seule
  // fois — `toolCache`/`toolErrors` sont partagés entre tous les domaines
  // d'un même appel à `_runAnalysis()`.
  async _invokeCached(def, toolByName, toolCache, toolErrors, toolSteps) {
    if (toolCache.has(def.tool)) return toolCache.get(def.tool);

    const tool = toolByName.get(def.tool);
    if (!tool) {
      toolErrors.set(def.tool, `le Tool "${def.tool}" n'est pas disponible pour votre profil`);
      toolCache.set(def.tool, undefined);
      return undefined;
    }

    const toolInput = def.toolInput || {};
    try {
      const output = await tool.invoke(toolInput);
      const raw = JSON.parse(output);
      toolSteps.push({ tool: def.tool, input: toolInput, output: raw });
      toolCache.set(def.tool, raw);
      return raw;
    } catch (err) {
      // Refus du serveur d'outils : dit en clair, sans le texte technique (rôle, nom de l'outil).
      const denied = isToolPermissionDenial(err);
      if (!denied) this.logger.error(`[BUSINESS_ANALYSIS] ${def.tool} a échoué : ${err.message}`, err);
      toolErrors.set(def.tool, denied ? "ces indicateurs sont réservés aux administrateurs et ne sont pas accessibles avec votre rôle" : "la lecture des données a échoué (ce n'est pas un résultat égal à zéro)");
      toolSteps.push({ tool: def.tool, input: toolInput, failed: true, output: { error: denied ? "PERMISSION_DENIED" : "TOOL_FAILED" } });
      toolCache.set(def.tool, undefined);
      return undefined;
    }
  }
}

function createBusinessAnalystAgent({ chatModel, tools = [], workflowEngine, qaChain = null, memory = null, maxToolCalls, maxHistoryMessages, promptInjectionGuard = null }) {
  return new BusinessAnalystAgent({
    name: "business_analyst_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["business_analysis"],
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

module.exports = { createBusinessAnalystAgent, BusinessAnalystAgent, ALLOWED_TOOL_NAMES, DOMAIN_DEFINITIONS, SYSTEM_PROMPT };
