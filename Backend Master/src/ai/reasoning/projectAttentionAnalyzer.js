"use strict";

/**
 * # ProjectAttentionAnalyzer — le Copilot RAISONNE, il ne se contente pas de répondre
 *
 * ## Rôle
 * Répond à « Quels projets nécessitent une attention ? » sans jamais appeler
 * un modèle de langage : analyse chaque projet selon 6 dimensions métier
 * réelles (retard, budget, activité, échéances, pipeline, blocages), calcule
 * un score pondéré par dimension, puis classe l'ENSEMBLE des projets par
 * priorité (`critique`/`elevee`/`moyenne`/`faible`). Entièrement hors-ligne et
 * déterministe — même philosophie que `LexicalIntentRouter`/`IntentClassifier`/
 * `ConversationContextResolver` : un moteur de règles auditable, jamais une
 * boîte noire. Toutes les règles (poids, seuils, bornes de priorité) sont
 * un unique objet exporté, `DEFAULT_BUSINESS_RULES` — voir
 * `BUSINESS_REASONING.md` pour la justification de chaque valeur et les
 * limites connues (notamment l'absence d'un champ "budget consommé" dans le
 * modèle `Project`).
 *
 * ## Entrée
 * `analyzeProjectAttention(projects, { now?, rules? })` — `projects` est le
 * tableau `data` renvoyé tel quel par le Tool MCP `list_projects`
 * (`toProjectCard()`, voir `modules/kanban/services/kanban.service.js`) :
 * aucune transformation préalable requise, aucune dépendance à Sequelize ou
 * à un quelconque service CRM (ce module ne fait AUCUN `require()` vers
 * `src/models`/`src/modules` — un pur calcul sur des objets déjà chargés,
 * consommable par un Agent, un test, ou plus tard le module Dashboard).
 *
 * ## Sortie
 * Un tableau, un élément par projet, trié par score décroissant :
 * `{ projectId, projectName, score, priority, factors: [{dimension, label,
 * severity, weight, contribution, reason}] }` — `factors` ne contient QUE
 * les dimensions qui ont effectivement déclenché un signal (`severity > 0`),
 * triées par contribution décroissante : jamais de raison vide ou
 * fabriquée, cohérent avec le principe anti-hallucination déjà posé pour la
 * génération de réponse (`langchain/prompts/RESPONSE_PROMPTS.md`).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DEFAULT_BUSINESS_RULES = {
  // Poids relatif de chaque dimension dans le score total — reflète
  // l'importance métier relative (retard/échéance/blocage à égalité en tête
  // : ce sont les signaux les plus actionnables et les moins ambigus ;
  // budget en dernier car c'est le signal le plus indirect, voir
  // BUSINESS_REASONING.md « Limite connue — budget »).
  weights: {
    retard: 3,
    echeance: 3,
    blocage: 3,
    pipeline: 2,
    activite: 2,
    budget: 1,
  },
  thresholds: {
    // [t1, t2, t3] jours, croissant — sévérité 1/2/3 au franchissement de
    // chaque palier (voir tierScore ci-dessous). Mêmes paliers pour
    // retard/échéance/blocage : 1 semaine = signal modéré, 1 mois = signal fort.
    retardDaysTiers: [1, 7, 30],
    echeanceDaysTiers: [1, 7, 30],
    echeanceDueSoonDays: 7,
    blocageDaysTiers: [1, 7, 30],
    pipelineStuckAgeDaysTiers: [60, 120, 180],
    pipelineStuckProgressThreshold: 30,
    activiteStaleDaysTiers: [14, 30, 60],
    budgetHighAmount: 100000,
    budgetLowProgressThreshold: 30,
  },
  // Ordre du plus sévère au moins sévère : le premier seuil atteint gagne
  // (voir classifyPriority). "faible" (min: 0) capte tout le reste.
  priorityBands: [
    { key: "critique", min: 20 },
    { key: "elevee", min: 10 },
    { key: "moyenne", min: 4 },
    { key: "faible", min: 0 },
  ],
};

function daysBetween(from, to) {
  return Math.floor((from.getTime() - to.getTime()) / MS_PER_DAY);
}

// severity 0/1/2/3 selon le palier de jours franchi (tiers = [t1, t2, t3] croissant).
function tierScore(days, tiers) {
  if (days >= tiers[2]) return 3;
  if (days >= tiers[1]) return 2;
  if (days >= tiers[0]) return 1;
  return 0;
}

function toDate(value) {
  return value ? new Date(value) : null;
}

// ── Dimension 1 : retard (relance de suivi dépassée) ──────────────────────
function scoreRetard(project, now, thresholds) {
  const due = toDate(project.nextRelanceDate);
  if (!due) return { severity: 0, reason: null };
  const daysLate = daysBetween(now, due);
  if (daysLate <= 0) return { severity: 0, reason: null };
  return {
    severity: tierScore(daysLate, thresholds.retardDaysTiers),
    reason: `Relance en retard de ${daysLate} jour(s) (échéance dépassée le ${due.toISOString().slice(0, 10)})`,
  };
}

// ── Dimension 2 : échéances (date limite ingénieur) ───────────────────────
function scoreEcheance(project, now, thresholds) {
  const due = toDate(project.dateLimiteIngenieur);
  if (!due) return { severity: 0, reason: null };
  const daysOverdue = daysBetween(now, due);
  if (daysOverdue > 0) {
    return {
      severity: tierScore(daysOverdue, thresholds.echeanceDaysTiers),
      reason: `Échéance ingénieur dépassée de ${daysOverdue} jour(s) (${due.toISOString().slice(0, 10)})`,
    };
  }
  const daysUntilDue = -daysOverdue;
  if (daysUntilDue <= thresholds.echeanceDueSoonDays) {
    return { severity: 1, reason: `Échéance ingénieur dans ${daysUntilDue} jour(s) (${due.toISOString().slice(0, 10)})` };
  }
  return { severity: 0, reason: null };
}

// ── Dimension 3 : blocages (dernière action non terminée, en retard) ─────
function scoreBlocage(project, now, thresholds) {
  const lastAction = project.lastAction;
  const date = lastAction && toDate(lastAction.dateAction);
  if (!lastAction || !date) return { severity: 0, reason: null };
  if (lastAction.statut === "Terminé" || lastAction.statut === "Annulé") return { severity: 0, reason: null };

  const daysStuck = daysBetween(now, date);
  if (daysStuck <= 0) return { severity: 0, reason: null };

  const label = (lastAction.actionType && lastAction.actionType.name) || lastAction.commentaire || "action";
  return {
    severity: tierScore(daysStuck, thresholds.blocageDaysTiers),
    reason: `Dernière action ("${label}", statut "${lastAction.statut}") bloquée depuis ${daysStuck} jour(s)`,
  };
}

// ── Dimension 4 : pipeline (sans étape assignée, ou bloqué dans une étape) ─
function scorePipeline(project, now, thresholds) {
  const stage = project.stage || project.pipelineStage || null;

  if (!project.pipelineStageId && !stage) {
    return { severity: 2, reason: "Aucune étape de pipeline assignée" };
  }
  if (stage && (stage.isWonStage || stage.isLostStage)) {
    return { severity: 0, reason: null }; // deal clos (gagné/perdu) : plus rien à surveiller ici
  }

  const progress = project.pourcentageReussite != null ? Number(project.pourcentageReussite) : 0;
  if (progress >= thresholds.pipelineStuckProgressThreshold) return { severity: 0, reason: null };

  const createdAt = toDate(project.createdAt);
  if (!createdAt) return { severity: 0, reason: null };

  const ageDays = daysBetween(now, createdAt);
  const severity = tierScore(ageDays, thresholds.pipelineStuckAgeDaysTiers);
  if (severity === 0) return { severity: 0, reason: null };

  const stageName = stage ? stage.name : "étape inconnue";
  return {
    severity,
    reason: `Ouvert depuis ${ageDays} jour(s) dans l'étape "${stageName}" avec seulement ${progress}% d'avancement`,
  };
}

// ── Dimension 5 : activité (aucune mise à jour récente) ───────────────────
function scoreActivite(project, now, thresholds) {
  const updatedAt = toDate(project.updatedAt);
  if (!updatedAt) return { severity: 0, reason: null };
  const daysSince = daysBetween(now, updatedAt);
  const severity = tierScore(daysSince, thresholds.activiteStaleDaysTiers);
  if (severity === 0) return { severity: 0, reason: null };
  return { severity, reason: `Aucune mise à jour depuis ${daysSince} jour(s)` };
}

// ── Dimension 6 : budget (non renseigné, ou engagé sans avancement) ───────
// Limite assumée : `Project` ne porte aucun champ "budget consommé/réel",
// seulement `montantMarche` (montant contractuel). Ce n'est donc PAS un
// contrôle de dépassement budgétaire réel — voir BUSINESS_REASONING.md.
function scoreBudget(project, now, thresholds) {
  const amount = project.montantMarche;
  if (amount == null) {
    return { severity: 1, reason: "Budget non renseigné (montant marché manquant)" };
  }
  const progress = project.pourcentageReussite != null ? Number(project.pourcentageReussite) : 0;
  if (Number(amount) >= thresholds.budgetHighAmount && progress < thresholds.budgetLowProgressThreshold) {
    return { severity: 2, reason: `Budget élevé (${Number(amount)}) avec avancement faible (${progress}%)` };
  }
  return { severity: 0, reason: null };
}

const DIMENSIONS = [
  { key: "retard", label: "Retard", score: scoreRetard },
  { key: "echeance", label: "Échéance", score: scoreEcheance },
  { key: "blocage", label: "Blocage", score: scoreBlocage },
  { key: "pipeline", label: "Pipeline", score: scorePipeline },
  { key: "activite", label: "Activité", score: scoreActivite },
  { key: "budget", label: "Budget", score: scoreBudget },
];

function classifyPriority(totalScore, priorityBands) {
  for (const band of priorityBands) {
    if (totalScore >= band.min) return band.key;
  }
  return priorityBands[priorityBands.length - 1].key;
}

function analyzeOneProject(project, now, rules) {
  const factors = [];
  let score = 0;

  for (const dimension of DIMENSIONS) {
    const { severity, reason } = dimension.score(project, now, rules.thresholds);
    if (severity > 0) {
      const weight = rules.weights[dimension.key];
      const contribution = severity * weight;
      score += contribution;
      factors.push({ dimension: dimension.key, label: dimension.label, severity, weight, contribution, reason });
    }
  }

  factors.sort((a, b) => b.contribution - a.contribution);

  return {
    projectId: project.id,
    projectName: project.nomProjet || project.title || "Projet sans nom",
    score,
    priority: classifyPriority(score, rules.priorityBands),
    factors,
  };
}

function analyzeProjectAttention(projects, { now = new Date(), rules = DEFAULT_BUSINESS_RULES } = {}) {
  return projects
    .map((project) => analyzeOneProject(project, now, rules))
    .sort((a, b) => b.score - a.score);
}

module.exports = { analyzeProjectAttention, DEFAULT_BUSINESS_RULES, DIMENSIONS };
