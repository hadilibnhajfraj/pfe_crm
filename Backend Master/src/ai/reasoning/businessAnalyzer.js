"use strict";

const { analyzeProjectAttention } = require("./projectAttentionAnalyzer");
const { checkProjectsCoherence } = require("./dataCoherenceChecker");

/**
 * # businessAnalyzer — le Business Analyst Agent : résultat, causes, risques, recommandations
 *
 * ## Rôle
 * Une fonction pure et déterministe par domaine métier (KPI, projets,
 * ventes, pipeline, devis, activités, interventions, performance),
 * consommant EXCLUSIVEMENT la sortie déjà renvoyée par un Tool MCP
 * EXISTANT (jamais un nouveau Tool, jamais un champ inventé) et produisant
 * une analyse à 4 volets : `{ result, causes, risks, recommendations }`
 * (tableaux de phrases françaises, chacune traçable à un champ réel du
 * Tool concerné — voir `BUSINESS_ANALYST.md` pour la correspondance
 * exacte domaine → Tool → champs consommés).
 *
 * Même philosophie que `projectAttentionAnalyzer.js`/`dataCoherenceChecker.js` :
 * entièrement hors-ligne, aucun appel modèle, aucune dépendance vers
 * `orchestrator/`/`agents/` (ce module reste au niveau le plus bas de la
 * pile — c'est l'Agent qui l'appelle, jamais l'inverse).
 *
 * ## Garantie "ne jamais inventer une donnée"
 * Chaque fonction ne produit QUE des phrases construites à partir de
 * valeurs numériques/textuelles RÉELLEMENT présentes dans l'objet passé en
 * entrée — aucune valeur par défaut fantaisiste, aucune estimation. Quand
 * un domaine ne peut PAS être analysé faute d'un Tool existant qui
 * l'expose (le cas des devis, voir `analyzeDevisDomain`), la fonction le
 * dit explicitement (`supported: false`) plutôt que d'inventer un chiffre.
 */

function pct(n) {
  return typeof n === "number" ? Math.round(n * 100) / 100 : n;
}

function supported(result, causes, risks, recommendations) {
  return { supported: true, result, causes, risks, recommendations };
}

// ── KPI (`get_dashboard_kpis`) ────────────────────────────────────────────
// Deux formes réelles selon le rôle de l'utilisateur (voir
// dashboard.service.js::getKPIByRole) : `role: "admin"` (global) ou
// `role: "user"` (personnel, préfixe `my*`) — jamais mélangées ici.
function analyzeKpiDomain(kpiData) {
  const stats = (kpiData && kpiData.stats) || {};
  const isAdmin = kpiData && kpiData.role === "admin";

  if (isAdmin) {
    const result = [`${stats.totalProjects ?? 0} projets au total, dont ${stats.totalValidated ?? 0} validés (${pct(stats.validationRate)}%).`];
    const causes = [];
    const risks = [];
    const recommendations = [];

    if (typeof stats.validationRate === "number" && stats.validationRate < 50) {
      causes.push(`Le taux de validation global est de ${pct(stats.validationRate)}%, en-dessous de la moitié des projets.`);
      risks.push("Une part importante des projets reste non validée, ce qui retarde leur avancement officiel.");
      recommendations.push("Prioriser la validation des projets en attente pour faire progresser le taux de validation.");
    }
    if (typeof stats.totalPending === "number" && stats.totalPending > 0) {
      risks.push(`${stats.totalPending} projet(s) en attente de traitement.`);
      recommendations.push("Passer en revue les projets en attente pour identifier ceux qui peuvent être débloqués rapidement.");
    }
    return supported(result, causes, risks, recommendations);
  }

  const result = [`${stats.myProjects ?? 0} projets personnels, taux de réussite de ${pct(stats.successRate)}%.`];
  const causes = [];
  const risks = [];
  const recommendations = [];

  if (typeof stats.myRelancesLate === "number" && stats.myRelancesLate > 0) {
    causes.push(`${stats.myRelancesLate} relance(s) personnelle(s) sont en retard.`);
    risks.push("Des relances en retard peuvent faire perdre des opportunités commerciales.");
    recommendations.push("Traiter en priorité les relances en retard avant de programmer de nouvelles actions.");
  }
  return supported(result, causes, risks, recommendations);
}

// ── Projets (`list_projects`) ─────────────────────────────────────────────
// Réutilise ProjectAttentionAnalyzer/dataCoherenceChecker (déjà construits,
// voir BUSINESS_REASONING.md) plutôt que de recalculer une seconde logique
// de scoring — une seule source de vérité pour "ce projet nécessite une
// attention", que la question vienne de ProjectAgent ou d'ici.
function analyzeProjectsDomain(projects, { now = new Date() } = {}) {
  const ranked = analyzeProjectAttention(projects, { now });
  const flagged = ranked.filter((r) => r.priority !== "faible");
  const dataQuality = checkProjectsCoherence(projects);

  const result = [`${projects.length} projet(s) analysé(s), dont ${flagged.length} nécessitent une attention (priorité moyenne à critique).`];

  const causes = [];
  const risks = [];
  const recommendations = [];
  const seenDimensions = new Set();

  for (const entry of flagged.slice(0, 5)) {
    for (const factor of entry.factors) {
      causes.push(`${entry.projectName} — ${factor.reason}`);
      if (!seenDimensions.has(factor.dimension)) {
        seenDimensions.add(factor.dimension);
        recommendations.push(DIMENSION_RECOMMENDATIONS[factor.dimension] || `Suivre de près le projet "${entry.projectName}".`);
      }
    }
  }

  const critical = flagged.filter((r) => r.priority === "critique");
  if (critical.length > 0) {
    risks.push(`${critical.length} projet(s) en priorité CRITIQUE : ${critical.map((r) => r.projectName).join(", ")}.`);
  }
  if (dataQuality.length > 0) {
    risks.push(`${dataQuality.length} fiche(s) projet incomplète(s) ou incohérente(s), ce qui peut fausser l'analyse elle-même.`);
    recommendations.push("Compléter les fiches projet signalées comme incomplètes pour fiabiliser les prochaines analyses.");
  }

  return supported(result, causes, risks, recommendations);
}

const DIMENSION_RECOMMENDATIONS = {
  retard: "Programmer une relance ou une réunion pour les projets en retard.",
  echeance: "Anticiper les échéances proches en programmant une réunion de suivi.",
  blocage: "Relancer ou réaffecter les actions bloquées depuis plusieurs jours.",
  pipeline: "Assigner une étape de pipeline ou faire avancer les projets stagnants.",
  activite: "Reprendre contact sur les projets sans activité récente.",
  budget: "Vérifier le suivi budgétaire des projets à budget élevé et avancement faible.",
};

// ── Ventes (`get_commercial_contact_kpi` / `get_commercial_contact_analytics`) ─
function analyzeSalesDomain(commercialData) {
  const global = (commercialData && commercialData.global) || commercialData || {};
  const result = [
    `${global.totalContacts ?? 0} contacts commerciaux, ${global.totalCalls ?? 0} appels effectués (${pct(global.averageCallsPerContact)} appel(s) en moyenne par contact).`,
  ];
  const causes = [];
  const risks = [];
  const recommendations = [];

  if (typeof global.contactsNonValides === "number" && typeof global.totalContacts === "number" && global.totalContacts > 0) {
    const ratio = (global.contactsNonValides / global.totalContacts) * 100;
    if (ratio >= 30) {
      causes.push(`${global.contactsNonValides} contact(s) sur ${global.totalContacts} ne sont pas encore validés (${pct(ratio)}%).`);
      risks.push("Une proportion élevée de contacts non validés ralentit le suivi commercial.");
      recommendations.push("Prioriser la validation des contacts en attente pour fiabiliser le suivi commercial.");
    }
  }

  return supported(result, causes, risks, recommendations);
}

// ── Pipeline (`get_professional_dashboard.pipeline`) ──────────────────────
// list_pipeline_stages seul n'expose AUCUN compte de projet par étape (voir
// BUSINESS_ANALYST.md) — get_professional_dashboard.pipeline est le SEUL
// Tool existant qui associe un décompte à chaque étape.
function analyzePipelineDomain(pipelineData) {
  const stages = (pipelineData && pipelineData.stages) || [];
  const conversions = (pipelineData && pipelineData.conversions) || {};

  const result = [`${conversions.total ?? 0} opportunité(s) suivie(s) dans le pipeline, taux de conversion de ${pct(conversions.conversionRate)}%.`];
  const causes = [];
  const risks = [];
  const recommendations = [];

  const openStages = stages.filter((s) => !s.isWonStage && !s.isLostStage);
  if (openStages.length > 0) {
    const bottleneck = openStages.reduce((max, s) => ((s.count || 0) > (max.count || 0) ? s : max), openStages[0]);
    if ((bottleneck.count || 0) > 0) {
      causes.push(`L'étape "${bottleneck.name}" concentre le plus d'opportunités ouvertes (${bottleneck.count}).`);
    }
  }

  if (typeof conversions.conversionRate === "number" && conversions.conversionRate < 20 && (conversions.total || 0) > 0) {
    risks.push(`Le taux de conversion (${pct(conversions.conversionRate)}%) est faible.`);
    recommendations.push("Analyser les étapes où les opportunités stagnent le plus pour identifier un blocage récurrent.");
  }

  return supported(result, causes, risks, recommendations);
}

// ── Devis — AUCUN Tool existant n'expose de métrique dédiée ──────────────
// Vérifié explicitement (voir BUSINESS_ANALYST.md) : ni list_projects, ni
// aucun autre Tool MCP n'expose devisCount/taux de devis envoyés. Plutôt
// que d'inventer un chiffre, cette fonction le dit clairement — c'est la
// garantie "ne jamais inventer une donnée" appliquée littéralement à un
// domaine que les Tools actuels ne couvrent pas.
function analyzeDevisDomain() {
  return {
    supported: false,
    result: [],
    causes: [],
    risks: [],
    recommendations: [],
    note: "Aucun AI Tool existant n'expose de métrique dédiée aux devis (nombre envoyés, taux de conversion). Impossible d'analyser ce domaine sans inventer une donnée.",
  };
}

// ── Activités (`list_projects` — actionsCount/lastAction) ────────────────
// "Activité" au sens du volume d'actions/relances déjà suivies sur les
// projets — le seul signal d'activité réellement exposé par un Tool
// existant (list_projects), pas un concept "journal d'activité" séparé
// (aucun Tool ne l'expose).
function analyzeActivitiesDomain(projects) {
  const totalActions = projects.reduce((sum, p) => sum + (p.actionsCount || 0), 0);
  const withoutAction = projects.filter((p) => !p.actionsCount || p.actionsCount === 0);

  const result = [`${totalActions} action(s) enregistrée(s) au total sur ${projects.length} projet(s).`];
  const causes = [];
  const risks = [];
  const recommendations = [];

  if (withoutAction.length > 0) {
    causes.push(`${withoutAction.length} projet(s) n'ont encore aucune action enregistrée.`);
    risks.push("Un projet sans aucune activité suivie peut être un projet oublié.");
    recommendations.push("Vérifier les projets sans action enregistrée pour s'assurer qu'ils ne sont pas simplement oubliés.");
  }

  return supported(result, causes, risks, recommendations);
}

// ── Interventions (`get_maintenance_stats`) ───────────────────────────────
function analyzeInterventionsDomain(stats) {
  const s = stats || {};
  const result = [`${s.total ?? 0} demande(s) de maintenance, dont ${s.enAttente ?? 0} en attente, ${s.enCours ?? 0} en cours, ${s.terminee ?? 0} terminée(s).`];
  const causes = [];
  const risks = [];
  const recommendations = [];

  if (typeof s.critique === "number" && s.critique > 0) {
    risks.push(`${s.critique} demande(s) de niveau CRITIQUE.`);
    recommendations.push("Traiter en priorité les demandes de maintenance critiques.");
  }
  if (typeof s.enAttente === "number" && typeof s.total === "number" && s.total > 0) {
    const ratio = (s.enAttente / s.total) * 100;
    if (ratio >= 40) {
      causes.push(`${s.enAttente} demande(s) sur ${s.total} restent en attente (${pct(ratio)}%).`);
      recommendations.push("Affecter un technicien aux demandes en attente depuis le plus longtemps.");
    }
  }

  return supported(result, causes, risks, recommendations);
}

// ── Performance (`get_professional_dashboard`) ────────────────────────────
function analyzePerformanceDomain(dashboard) {
  const summary = (dashboard && dashboard.summary) || {};
  const alerts = (dashboard && dashboard.alerts) || {};

  const result = [
    `${summary.totalProjects ?? 0} projets au total, taux de validation ${pct(summary.validationRate)}%, taux de réussite ${pct(summary.successRate)}%.`,
  ];
  const causes = [];
  const risks = [];
  const recommendations = [];

  if (typeof alerts.overdueProjects === "number" && alerts.overdueProjects > 0) {
    causes.push(`${alerts.overdueProjects} projet(s) en retard.`);
    risks.push("Des projets en retard pèsent directement sur la performance globale.");
    recommendations.push("Concentrer l'attention sur les projets en retard identifiés dans les alertes.");
  }
  if (typeof alerts.missingValidation === "number" && alerts.missingValidation > 0) {
    causes.push(`${alerts.missingValidation} projet(s) en attente de validation.`);
    recommendations.push("Traiter les validations en attente pour débloquer la progression de ces projets.");
  }
  if (typeof alerts.missingDocuments === "number" && alerts.missingDocuments > 0) {
    risks.push(`${alerts.missingDocuments} projet(s) avec des documents manquants.`);
    recommendations.push("Compléter les documents manquants signalés dans les alertes du tableau de bord.");
  }

  return supported(result, causes, risks, recommendations);
}

module.exports = {
  analyzeKpiDomain,
  analyzeProjectsDomain,
  analyzeSalesDomain,
  analyzePipelineDomain,
  analyzeDevisDomain,
  analyzeActivitiesDomain,
  analyzeInterventionsDomain,
  analyzePerformanceDomain,
  DIMENSION_RECOMMENDATIONS,
};
