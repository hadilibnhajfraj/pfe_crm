"use strict";

const { BaseAgent } = require("./baseAgent");
const { AgentError } = require("./errors");
const { tokenize } = require("../utils/tokenize");
const { analyzeKpiDomain } = require("../reasoning/businessAnalyzer");
const { compareMonthlyEvolution, forecastNextPeriod, buildChartSeries, explainMetricMovement, formatProfessionalAlerts } = require("../reasoning/kpiInsights");
const { buildKpiAnswer } = require("../reasoning/kpiAnswerBuilder");

// Les 4 Tools du module Dashboard (voir mcp/tools/dashboard/). `get_dashboard_kpis`
// est le seul REQUIS (disponible à tout rôle) ; les 3 autres sont invoqués
// en meilleur effort — leur absence/refus dégrade une section, jamais toute
// la réponse (voir _run ci-dessous et KPI_AGENT.md).
const ALLOWED_TOOL_NAMES = ["get_dashboard_kpis", "get_user_dashboard", "get_professional_dashboard", "get_legacy_dashboard_kpis", "get_por_promesh_dashboard", "list_industrial_records"];

// Rôles administrateurs : seuls autorisés à get_professional_dashboard /
// get_legacy_dashboard_kpis (mêmes rôles que les routes /dashboard/professional).
const ADMIN_TIER_ROLES = new Set(["admin", "superadmin", "superadmin2"]);
// Rôle industriel : son tableau de bord est celui de la production (PROMESH,
// fiches industrielles), pas celui des projets commerciaux — il n'a aucun projet.
const INDUSTRIAL_ROLES = new Set(["responsable_logistique_achat"]);
const INDUSTRIAL_MODULE_LABELS = { probar: "PROBAR", melange: "Mélange", maintenance: "Maintenance" };

// Les 2 seuls champs numériques présents dans LES DEUX formes de série
// mensuelle réelle (`charts.monthlyEvolution` admin ET `charts.myMonthlyEvolution`
// utilisateur, voir dashboard.service.js) — jamais un champ absent d'une des
// deux formes (ex. `archived`/`surface`, admin seulement).
const MONTHLY_FIELD_LABELS = { total: "Nombre de projets créés", validated: "Nombre de projets validés" };

// Marqueur LOCAL à cet Agent (même mécanisme que ATTENTION_MARKERS de
// ProjectAgent) : bascule la "Vue historique" sur `get_legacy_dashboard_kpis`
// (entonnoir de vente/revenu, admin-tier) plutôt que d'appeler ce Tool à
// chaque tour pour tout le monde.
const LEGACY_MARKERS = ["historique", "historiques", "entonnoir", "legacy"];

const SYSTEM_PROMPT = [
  "Tu es l'Agent KPI du CRM CBI Tunisia — le Dashboard intelligent.",
  "Pour chaque question sur les indicateurs clés (KPI) et tableaux de bord,",
  "tu donnes les chiffres réels renvoyés par les Tools, tu les compares au",
  "mois précédent, tu expliques pourquoi ils augmentent ou diminuent",
  "(corrélation, jamais une causalité inventée), tu estimes une tendance",
  "pour le mois prochain, tu signales les alertes réelles du tableau de",
  "bord, et tu fournis les données du graphique correspondant.",
  "Jamais un chiffre inventé ; quand l'historique est insuffisant pour",
  "comparer ou prévoir, tu le dis explicitement.",
].join(" ");

/**
 * # KpiAgent — Dashboard intelligent : analyses, comparaisons, prévisions, alertes, graphiques
 *
 * ## Rôle
 * Prend en charge l'intention `dashboard`. Contrairement à l'ancienne
 * version (chiffres bruts, sans interprétation), CET Agent construit
 * systématiquement, pour TOUTE question qui atteint son intention (même
 * mécanisme que `RecommendationAgent`/`DataQualityAgent` — un tableau de
 * bord ne se construit pas "à la carte") :
 * - **Résultat** : les chiffres réels du moment (`analyzeKpiDomain`,
 *   `reasoning/businessAnalyzer.js` — réutilisé, jamais une 2e logique).
 * - **Comparaison** : mois précédent → mois en cours, sur la SEULE série
 *   mensuelle réelle exposée (`charts.monthlyEvolution`/`myMonthlyEvolution`
 *   de `get_dashboard_kpis`, un décompte de projets PAR MOIS DE CRÉATION).
 * - **Pourquoi ça évolue** : la comparaison chiffrée + les causes déjà
 *   identifiées par `analyzeKpiDomain`, présentées comme corrélation
 *   possible, jamais comme une causalité prouvée (voir `kpiInsights.js`).
 * - **Prévision** : tendance heuristique des 3 derniers mois, jamais un
 *   modèle statistique — étiqueté comme tel.
 * - **Alertes** : les risques déjà identifiés par `analyzeKpiDomain` +
 *   l'objet `alerts` réel de `get_professional_dashboard` (admin-tier,
 *   en meilleur effort — absent/refusé pour un autre rôle sans faire
 *   échouer le reste de la réponse).
 * - **Graphique** : `{labels, series}` dérivé de la même série mensuelle —
 *   voir `KPI_AGENT.md`, "Ce qui n'a pas été fait" pour ses limites.
 *
 * `get_user_dashboard` (répartition par famille/diamètre de produit) et
 * `get_legacy_dashboard_kpis` (vue historique/entonnoir, déclenchée par
 * `LEGACY_MARKERS`) enrichissent la réponse en meilleur effort — voir
 * `KPI_AGENT.md` pour la correspondance exacte Tool → section.
 *
 * ## Aucune donnée fabriquée
 * Aucune KPI-snapshot périodique n'existe côté CRM (vérifié, voir
 * `KPI_AGENT.md`) — comparaison/prévision/graphique reposent EXCLUSIVEMENT
 * sur la répartition par mois de création déjà calculée par le CRM
 * lui-même ; toute autre métrique (ex. `myRelancesLate`, instantanée)
 * n'est jamais comparée/projetée, seulement rapportée telle quelle.
 */
class KpiAgent extends BaseAgent {
  async _run({ message, user }) {
    const toolByName = new Map(this._allowedTools().map((t) => [t.name, t]));
    const toolSteps = [];

    if (user && INDUSTRIAL_ROLES.has(user.role)) {
      return this._runIndustrialDashboard(toolByName, toolSteps);
    }
    const admin = Boolean(user && ADMIN_TIER_ROLES.has(user.role));

    const dashboardTool = toolByName.get("get_dashboard_kpis");
    if (!dashboardTool) throw new AgentError('Agent "kpi_agent" needs the "get_dashboard_kpis" Tool to build the intelligent dashboard.');

    const dashboardRaw = await this._invoke(dashboardTool, {}, toolSteps);
    const isAdmin = dashboardRaw && dashboardRaw.role === "admin";
    const series = (dashboardRaw && dashboardRaw.charts && (isAdmin ? dashboardRaw.charts.monthlyEvolution : dashboardRaw.charts.myMonthlyEvolution)) || [];
    const fields = Object.keys(MONTHLY_FIELD_LABELS);

    const kpiAnalysis = analyzeKpiDomain(dashboardRaw);
    const comparison = compareMonthlyEvolution(series, fields);
    const forecasts = fields.map((field) => ({ field, label: MONTHLY_FIELD_LABELS[field], forecast: forecastNextPeriod(series, field) }));
    const chart = buildChartSeries(series, fields);
    const explanations = fields.map((field) => {
      const metricComparison = comparison.supported ? comparison.metrics.find((m) => m.field === field) : { supported: false };
      return { field, text: explainMetricMovement(MONTHLY_FIELD_LABELS[field], metricComparison, kpiAnalysis.causes) };
    });

    const alerts = [...kpiAnalysis.risks];
    const extraSections = [];

    await this._enrichWithUserDashboard(toolByName, toolSteps, extraSections);
    if (admin) {
      await this._enrichWithProfessionalDashboard(toolByName, toolSteps, alerts);
      await this._enrichWithLegacyDashboard(message, toolByName, toolSteps, extraSections);
    }

    const answer = buildKpiAnswer({ kpiAnalysis, comparison, forecasts, chart, explanations, alerts, fieldLabels: MONTHLY_FIELD_LABELS, extraSections });

    // Étape de RAISONNEMENT (pas un Tool MCP réel) — voir
    // orchestrator/explainabilityBuilder.js, qui distingue les deux pour
    // construire response.explainability.businessRules.
    const fieldLabelsText = fields.map((f) => MONTHLY_FIELD_LABELS[f]).join(", ");
    toolSteps.push({
      tool: "analyze_kpi_trends",
      synthetic: true,
      description:
        `Comparaison au mois précédent, prévision heuristique et alertes calculées sur ${fields.length} indicateur(s) (${fieldLabelsText})` +
        `${comparison.supported ? "" : " — historique mensuel insuffisant pour comparer"} ; ${alerts.length} alerte(s) détectée(s).`,
      input: {},
      output: {
        comparisonSupported: comparison.supported,
        forecasts: forecasts.map((f) => ({ field: f.field, supported: f.forecast.supported, estimatedNextValue: f.forecast.supported ? f.forecast.estimatedNextValue : null })),
        alertsCount: alerts.length,
      },
    });

    return { answer, citations: [], toolSteps };
  }

  async _invoke(tool, input, toolSteps) {
    const output = await tool.invoke(input);
    const raw = JSON.parse(output);
    toolSteps.push({ tool: tool.name, input, output: raw });
    return raw;
  }

  // Répartition par famille/diamètre de produit — en meilleur effort, pour
  // tout rôle (`get_user_dashboard` n'a pas de restriction de rôle).
  async _enrichWithUserDashboard(toolByName, toolSteps, extraSections) {
    const tool = toolByName.get("get_user_dashboard");
    if (!tool) return;
    try {
      const raw = await this._invoke(tool, {}, toolSteps);
      const familyStats = raw.familyStats || [];
      const diameterStats = raw.diameterStats || [];
      if (familyStats.length === 0 && diameterStats.length === 0) return;
      const lines = [
        ...familyStats.map((f) => `- Famille "${f.family}" : ${f.count} projet(s).`),
        ...diameterStats.map((d) => `- Diamètre "${d.diameter}" : ${d.count} projet(s).`),
      ];
      extraSections.push(`### Répartition par famille et diamètre de produit\n${lines.join("\n")}`);
    } catch (err) {
      toolSteps.push({ tool: "get_user_dashboard", input: {}, output: `Error: ${err.message}` });
    }
  }

  // Tableau de bord INDUSTRIEL (responsable logistique) : indicateurs PROMESH
  // (get_por_promesh_dashboard) et fiches industrielles par module
  // (list_industrial_records). Le périmètre est appliqué par les outils et
  // leurs services : ce rôle ne voit que SES fiches PROMESH.
  async _runIndustrialDashboard(toolByName, toolSteps) {
    const lines = ["📊 TABLEAU DE BORD INDUSTRIEL", ""];
    let read = 0;
    const promeshTool = toolByName.get("get_por_promesh_dashboard");
    if (promeshTool) {
      try {
        const d = await this._invoke(promeshTool, {}, toolSteps);
        read += 1;
        lines.push("Fiches PROMESH (votre périmètre) :", `• Fiches : ${d.fichesCount ?? 0} (${d.fichesValidees ?? 0} validée(s), ${d.fichesBrouillon ?? 0} en brouillon)`, `• Production totale : ${Math.round((Number(d.productionTotale) || 0) * 100) / 100} m²`, `• Non-conformités : ${d.nonConformites ?? 0}`, `• Opérateurs : ${d.operateursPresents ?? 0}`, "");
      } catch (err) {
        this.logger.error(`[INDUSTRIAL_DASHBOARD] get_por_promesh_dashboard a échoué : ${err.message}`, err);
        toolSteps.push({ tool: "get_por_promesh_dashboard", input: {}, failed: true, output: { error: "TOOL_FAILED" } });
        lines.push("Fiches PROMESH : les indicateurs n'ont pas pu être récupérés (ce n'est pas un résultat égal à zéro).", "");
      }
    }
    const listTool = toolByName.get("list_industrial_records");
    if (listTool) {
      try {
        const out = await this._invoke(listTool, { pageSize: 2000 }, toolSteps);
        read += 1;
        const list = Array.isArray(out && out.data) ? out.data : [];
        const total = typeof (out && out.total) === "number" ? out.total : list.length;
        const byModule = new Map();
        for (const r of list) byModule.set(r.module, (byModule.get(r.module) || 0) + 1);
        lines.push(`Fiches industrielles : ${total}`);
        for (const [module, label] of Object.entries(INDUSTRIAL_MODULE_LABELS)) lines.push(`• ${label} : ${byModule.get(module) || 0}`);
        if (list.length < total) lines.push(`(répartition calculée sur ${list.length} fiches lues sur ${total})`);
        lines.push("");
      } catch (err) {
        this.logger.error(`[INDUSTRIAL_DASHBOARD] list_industrial_records a échoué : ${err.message}`, err);
        toolSteps.push({ tool: "list_industrial_records", input: {}, failed: true, output: { error: "TOOL_FAILED" } });
        lines.push("Fiches industrielles : les données n'ont pas pu être récupérées (ce n'est pas un résultat égal à zéro).", "");
      }
    }
    if (!read) {
      return { answer: "Je n'ai pas pu récupérer le tableau de bord industriel : la lecture des données a échoué. Réessayez dans un instant ; si le problème persiste, prévenez l'administrateur.", citations: [], toolSteps };
    }
    lines.push("Les indicateurs commerciaux (projets, pipeline, contacts) sont réservés aux rôles commerciaux et aux administrateurs.", "Pour le détail : « analyse la production PROMESH », « résume les fiches PROBAR ».");
    return { answer: lines.join("\n"), citations: [], toolSteps };
  }

  // Alertes réelles du tableau de bord professionnel — admin-tier
  // uniquement ; un refus pour un autre rôle dégrade seulement cette
  // enrichissement, jamais toute la réponse.
  async _enrichWithProfessionalDashboard(toolByName, toolSteps, alerts) {
    const tool = toolByName.get("get_professional_dashboard");
    if (!tool) return;
    try {
      const raw = await this._invoke(tool, {}, toolSteps);
      alerts.push(...formatProfessionalAlerts(raw && raw.alerts));
    } catch (err) {
      toolSteps.push({ tool: "get_professional_dashboard", input: {}, output: `Error: ${err.message}` });
    }
  }

  // Vue historique/entonnoir de vente — seulement si le message la demande
  // explicitement (LEGACY_MARKERS), admin-tier uniquement.
  async _enrichWithLegacyDashboard(message, toolByName, toolSteps, extraSections) {
    const terms = new Set(tokenize(message));
    if (!LEGACY_MARKERS.some((marker) => terms.has(marker))) return;

    const tool = toolByName.get("get_legacy_dashboard_kpis");
    if (!tool) return;
    try {
      const raw = await this._invoke(tool, {}, toolSteps);
      const counts = raw.counts || {};
      const revenue = raw.revenue || {};
      const rates = raw.rates || {};
      const trend = raw.monthlyTrend || [];

      const lines = [
        `- ${counts.totalProjects ?? 0} projet(s) au total, ${counts.wonProjects ?? 0} gagné(s), ${counts.lostProjects ?? 0} perdu(s), taux de conversion ${rates.conversionRate ?? 0}%.`,
        `- Chiffre d'affaires total : ${revenue.total ?? 0}, mensuel : ${revenue.monthly ?? 0}.`,
      ];

      const revenueComparison = compareMonthlyEvolution(trend, ["revenue"]);
      const revenueMetric = revenueComparison.supported ? revenueComparison.metrics.find((m) => m.field === "revenue") : { supported: false };
      lines.push(`- ${explainMetricMovement("Chiffre d'affaires mensuel", revenueMetric, [])}`);

      const revenueForecast = forecastNextPeriod(trend, "revenue");
      if (revenueForecast.supported) {
        lines.push(`- Prévision du chiffre d'affaires du mois prochain : environ ${revenueForecast.estimatedNextValue} (tendance ${revenueForecast.trendPerMonth > 0 ? "+" : ""}${revenueForecast.trendPerMonth}/mois).`);
      }

      extraSections.push(`### Vue historique (entonnoir de vente)\n${lines.join("\n")}`);
    } catch (err) {
      toolSteps.push({ tool: "get_legacy_dashboard_kpis", input: {}, output: `Error: ${err.message}` });
    }
  }
}

function createKpiAgent({ chatModel, tools = [], workflowEngine, qaChain = null, memory = null, maxToolCalls, maxHistoryMessages, promptInjectionGuard = null }) {
  return new KpiAgent({
    name: "kpi_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["dashboard"],
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

module.exports = { createKpiAgent, KpiAgent, ALLOWED_TOOL_NAMES, MONTHLY_FIELD_LABELS, LEGACY_MARKERS, SYSTEM_PROMPT };
