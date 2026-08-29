"use strict";

const { analyzeProjectAttention } = require("../reasoning/projectAttentionAnalyzer");
const { buildProjectAlert, buildDashboardAlert } = require("./proactiveAnswerBuilder");

// Seules les priorités qui justifient une alerte PROACTIVE (poussée sans
// qu'on la demande) — "moyenne"/"faible" restent visibles à la demande
// (ProjectAgent, intention "projects") mais ne méritent pas une
// interruption non sollicitée.
const ALERT_PRIORITIES = new Set(["critique", "elevee"]);

// Catégories de DomainAnalyzer qui constituent un RISQUE au sens de cette
// passe — "recommendations"/"forecasts"/"dataQuality" restent des
// insights, pas des alertes à pousser (voir domainAnalyzer.js, CATEGORIES).
const RISK_CATEGORIES = ["alerts", "risks", "anomalies"];

/**
 * # ProactiveMonitor — détecter, jamais envoyer (séparation stricte)
 *
 * ## Rôle
 * Surveille les 6 domaines demandés — Projets, Pipeline, Maintenance, RH,
 * Industrial, Dashboard (KPI) — plus Ventes en bonus (déjà couvert avant
 * cette passe) — en réutilisant EXCLUSIVEMENT des moteurs déjà existants et
 * déjà testés, jamais une deuxième logique de scoring :
 * - **Projets/Activités/Échéances** : `ProjectAttentionAnalyzer` (Business
 *   Reasoning) — "activités" et "échéances" sont deux des 6 dimensions
 *   qu'il note déjà pour chaque projet (`activite`/`echeance`), jamais un
 *   module séparé, car ce ne sont pas des entités CRM indépendantes dans ce
 *   modèle de données (voir PROACTIVE_AI.md).
 * - **Pipeline/Ventes/Maintenance/RH/Industrial/KPI** :
 *   `DashboardService.getSnapshot()` (Dashboard IA, déjà construit) scopé
 *   aux domaines `pipeline`/`sales`/`maintenance`/`hr`/`industrial`/`kpi` —
 *   les 6 analyseurs de `dashboard/manifest.js` déjà réels, jamais une
 *   deuxième lecture des mêmes données CRM.
 *
 * ## `detectAlerts()` ne fait QUE détecter
 * Aucun Tool d'écriture, aucun envoi — voir `alertDispatcher.js` pour la
 * partie qui envoie réellement. Cette séparation stricte (même principe que
 * `AutomationAgent` : proposer/exécuter sont deux étapes disjointes) rend la
 * détection idempotente et testable sans jamais risquer un envoi en double.
 */
class ProactiveMonitor {
  constructor({ dashboardService, listProjectsTool, suggestionEngine = null, actingUser, now = () => new Date() }) {
    this.dashboardService = dashboardService;
    this.listProjectsTool = listProjectsTool;
    this.suggestionEngine = suggestionEngine;
    this.actingUser = actingUser;
    this.now = now;
  }

  async detectAlerts() {
    const [projectAlerts, dashboardAlerts] = await Promise.all([this._detectProjectAlerts(), this._detectDashboardAlerts()]);
    return [...projectAlerts, ...dashboardAlerts];
  }

  async _detectProjectAlerts() {
    if (!this.listProjectsTool) return [];

    let projects;
    try {
      const raw = await this.listProjectsTool.invoke({ limit: 200, isArchived: false });
      ({ data: projects = [] } = JSON.parse(raw));
    } catch {
      return []; // Tool indisponible pour ce rôle — dégrade sans jamais planter tout le tour.
    }

    const ranked = analyzeProjectAttention(projects, { now: this.now() });
    const flagged = ranked.filter((r) => ALERT_PRIORITIES.has(r.priority));

    return flagged.map((entry) => {
      const suggestions = this.suggestionEngine ? this.suggestionEngine.suggestForFactors(entry.factors, this.actingUser) : [];
      return buildProjectAlert(entry, { suggestions });
    });
  }

  async _detectDashboardAlerts() {
    if (!this.dashboardService) return [];

    let snapshot;
    try {
      snapshot = await this.dashboardService.getSnapshot({ actingUser: this.actingUser, domains: ["pipeline", "sales", "maintenance", "hr", "industrial", "kpi"] });
    } catch {
      return [];
    }

    const alerts = [];
    for (const domainResult of Object.values(snapshot.domains)) {
      for (const category of RISK_CATEGORIES) {
        for (const item of domainResult[category] || []) {
          alerts.push(buildDashboardAlert(domainResult, item, category));
        }
      }
    }
    return alerts;
  }
}

module.exports = { ProactiveMonitor, ALERT_PRIORITIES, RISK_CATEGORIES };
