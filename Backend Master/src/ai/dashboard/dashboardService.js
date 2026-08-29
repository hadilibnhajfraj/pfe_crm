"use strict";

const { CATEGORIES } = require("./domainAnalyzer");

/**
 * # DashboardService — agrège les 7 analyseurs de domaine
 *
 * ## Rôle
 * Exécute (en parallèle) les analyseurs demandés et produit un instantané
 * du Dashboard IA : un résultat **par domaine** (`domains`) et une vue
 * **transversale** par catégorie (`summary.alerts`, `summary.recommendations`,
 * ...) — les 6 catégories demandées, chacune agrégée sur tous les domaines,
 * prêtes à afficher sans que l'appelant n'ait à parcourir `domains`
 * lui-même.
 *
 * ## Entrée/Sortie
 * `getSnapshot({ actingUser, domains? })` → `{ generatedAt, domains: {
 * [domain]: DomainInsights }, summary: { alerts, recommendations,
 * anomalies, forecasts, risks, dataQuality } }`. L'échec d'UN analyseur
 * (permission refusée, Tool en panne) est absorbé et consigné dans
 * `domains[domain].errors` — il n'empêche jamais les autres domaines de
 * s'afficher.
 *
 * `getDomainSnapshot(domain, { actingUser })` → `DomainInsights` pour un
 * seul domaine, ou `null` s'il n'existe pas. Contrairement à `getSnapshot`,
 * une erreur de permission ici REMONTE telle quelle — l'appelant a demandé
 * explicitement CE domaine, un résultat vide serait trompeur.
 */
class DashboardService {
  constructor({ analyzers }) {
    this.analyzers = analyzers;
  }

  listDomains() {
    return [...this.analyzers.keys()];
  }

  async getSnapshot({ actingUser, domains = null } = {}) {
    const targets = domains ? domains.map((domain) => this.analyzers.get(domain)).filter(Boolean) : [...this.analyzers.values()];

    const results = await Promise.all(
      targets.map((analyzer) =>
        analyzer.analyze({ actingUser }).catch((err) => ({
          domain: analyzer.domain,
          alerts: [],
          recommendations: [],
          anomalies: [],
          forecasts: [],
          risks: [],
          dataQuality: [],
          errors: [{ message: err.message }],
        }))
      )
    );

    const byDomain = {};
    const summary = Object.fromEntries(CATEGORIES.map((category) => [category, []]));

    for (const result of results) {
      byDomain[result.domain] = result;
      for (const category of CATEGORIES) summary[category].push(...result[category]);
    }

    return { generatedAt: new Date().toISOString(), domains: byDomain, summary };
  }

  async getDomainSnapshot(domain, { actingUser } = {}) {
    const analyzer = this.analyzers.get(domain);
    if (!analyzer) return null;
    return analyzer.analyze({ actingUser });
  }
}

module.exports = { DashboardService };
