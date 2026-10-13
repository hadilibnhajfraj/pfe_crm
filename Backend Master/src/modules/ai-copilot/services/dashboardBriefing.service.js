"use strict";

// AI Dashboard — le briefing proactif affiché à l'ouverture du Copilot
// ("Bonjour {prénom}", compteurs du jour, qualité CRM, cartes de risque/
// recommandation, timeline, graphique). Deuxième fichier (après
// aiCopilotBridge.service.js) sous modules/ai-copilot/ à toucher src/ai/
// directement — voir l'en-tête de aiCopilotBridge.service.js pour pourquoi
// ce genre de fichier reste rare et délibéré.
//
// Contrairement à aiCopilotBridge.service.js, AUCUNE dépendance à un
// ILlmProvider : entièrement déterministe, réutilise les MÊMES moteurs de
// règles déjà validés (ProjectAttentionAnalyzer, DataQualityAnalyzer,
// SuggestionEngine) sur les MÊMES données que ProjectAgent — jamais une
// deuxième définition de "projet critique"/"qualité CRM" qui pourrait
// diverger. Résultat : le Dashboard AI reste disponible même si
// AI_LLM_PROVIDER n'est pas configuré (contrairement à /chat, voir
// AI_COPILOT_HTTP.md).
const { Op } = require("sequelize");
const projectService = require("../../projects/services/project.service");
const { scopeInputForActingUser } = require("../../../ai/mcp/tools/projects/listProjectsTool");
const { analyzeProjectAttention } = require("../../../ai/reasoning/projectAttentionAnalyzer");
const { analyzeDataQuality } = require("../../../ai/reasoning/dataQualityAnalyzer");
const { SuggestionEngine } = require("../../../ai/orchestrator/suggestionEngine");
const { buildToolPermissionIndex } = require("../../../ai/orchestrator/pipeline");
const { isMaintenanceManager } = require("../../../middleware/requireMaintenanceManager");
const MaintenanceRequest = require("../../../models/MaintenanceRequest");
const ProjectDevis = require("../../../models/ProjectDevis");
const CommercialContactRelance = require("../../../models/CommercialContactRelance");
const CommercialContact = require("../../../models/CommercialContact");
const UserProfile = require("../../../models/UserProfile");
const { resolveFullName } = require("../../../utils/userDisplay");

const ADMIN_ROLES = ["admin", "superadmin", "superadmin2"];
const EXPIRING_QUOTE_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Construit une seule fois par process (comme mcpServerSingleton dans les
// deux bridges) — `buildToolPermissionIndex()` instancie tous les Tools
// pour lire leur `requiredRoles` réel, pas gratuit à refaire à chaque
// requête. Toujours la MÊME classe/règles que celle utilisée par
// ProjectAgent (voir orchestrator/pipeline.js::createAiOrchestrator) —
// jamais une permission dupliquée qui pourrait diverger.
let suggestionEngineSingleton = null;
function getSuggestionEngine() {
  if (!suggestionEngineSingleton) {
    suggestionEngineSingleton = new SuggestionEngine({ toolPermissionIndex: buildToolPermissionIndex() });
  }
  return suggestionEngineSingleton;
}

// req.user est le payload JWT (middleware/auth.middleware.js) : {sub, email,
// role} — jamais {id, ...}. Même mapping que aiCopilotBridge.service.js/
// aiDashboardBridge.service.js::toActingUser, dupliqué ici volontairement —
// même convention déjà établie par ces deux fichiers (chaque module reste
// autonome plutôt que de dépendre d'un import croisé pour un mapping d'une
// ligne).
function toActingUser(reqUser) {
  return { id: reqUser.sub, role: reqUser.role, email: reqUser.email };
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// Différence en jours entre maintenant et une date DATEONLY ("YYYY-MM-DD",
// telle que renvoyée par Sequelize) — précision "jour" suffisante pour du
// classement en buckets (Aujourd'hui/Cette semaine/Plus tard), jamais
// utilisée pour un calcul métier exact.
function daysFromNow(dateOnly) {
  if (!dateOnly) return null;
  return Math.round((new Date(dateOnly).getTime() - Date.now()) / MS_PER_DAY);
}

function bucketFor(days) {
  if (days == null || days <= 0) return "today";
  if (days <= 7) return "week";
  return "later";
}

// ── Greeting — "Bonjour {prénom}" ────────────────────────────────────────
async function buildGreeting(actingUser) {
  const profile = await UserProfile.findOne({ where: { userId: actingUser.id } });
  const firstName = (profile?.prenom && profile.prenom.trim()) || null;
  const fullName = resolveFullName({ email: actingUser.email, profile }) || actingUser.email || "";
  return { firstName, fullName };
}

// ── Projets critiques + qualité CRM + cartes de risque/recommandation ────
async function buildProjectInsights(actingUser) {
  // Mêmes paramètres que ProjectAgent._runAttentionAnalysis() — projets
  // "actifs", non archivés — ET même périmètre : scopeInputForActingUser()
  // est la règle unique de list_projects (admin-tier : tous les projets ;
  // tout autre rôle : ses propres projets). Sans elle, cet appel direct au
  // service chargeait les projets de TOUS les utilisateurs : un commercial
  // voyait « 29 projets critiques » pour 14 projets à lui, et des cartes de
  // risque portant sur les projets d'autres commerciaux (constaté sur la
  // base de démonstration le 12/10/2026).
  const { data: projects } = await projectService.listProjects(scopeInputForActingUser({ limit: 100, isArchived: false }, actingUser), actingUser.id);

  const ranked = analyzeProjectAttention(projects);
  const criticalRanked = ranked.filter((r) => r.priority === "critique");

  const riskCards = criticalRanked.slice(0, 5).map((r) => ({
    projectId: r.projectId,
    projectName: r.projectName,
    score: r.score,
    priority: r.priority,
    topReason: (r.factors[0] && r.factors[0].reason) || null,
  }));

  const quality = analyzeDataQuality(projects);

  // Même règle EXACTE que ProjectAgent._suggestActionsFor() : tous les
  // projets non "faible", fusionnés — jamais une deuxième logique de
  // sélection des facteurs.
  const flaggedFactors = ranked.filter((r) => r.priority !== "faible").flatMap((r) => r.factors);
  const recommendationCards = getSuggestionEngine().suggestForFactors(flaggedFactors, actingUser).slice(0, 5);

  return { projects, criticalCount: criticalRanked.length, riskCards, qualityScore: quality.qualityScore, recommendationCards };
}

// ── Devis expirants — bornés aux projets déjà chargés (même périmètre que
// les projets critiques, jamais un deuxième chargement non scopé) ────────
async function buildExpiringQuotes(projectIds) {
  if (!projectIds.length) return { count: 0, rows: [] };

  const todayIso = isoDate(new Date());
  const windowEndIso = isoDate(addDays(new Date(), EXPIRING_QUOTE_WINDOW_DAYS));
  const where = { projectId: { [Op.in]: projectIds }, dateExpiration: { [Op.between]: [todayIso, windowEndIso] } };

  const [count, rows] = await Promise.all([
    ProjectDevis.count({ where }),
    ProjectDevis.findAll({ where, order: [["dateExpiration", "ASC"]], limit: 5 }),
  ]);
  return { count, rows };
}

// ── Interventions urgentes — réservé aux gestionnaires de maintenance,
// EXACTEMENT comme GET /maintenance-requests/stats (requireMaintenanceManager)
// — jamais un chiffre organisation-wide montré à un rôle qui n'y a normalement
// pas accès. `null` (pas 0) pour un rôle non autorisé : distingue "aucune
// intervention urgente" de "vous n'avez pas le droit de voir ce chiffre".
async function buildUrgentInterventions(actingUser) {
  if (!isMaintenanceManager(actingUser.role, actingUser.email)) {
    return { count: null, rows: [] };
  }
  const where = { urgence: "critique", statut: { [Op.in]: ["en_attente", "acceptee", "en_cours"] } };
  const [count, rows] = await Promise.all([
    MaintenanceRequest.count({ where }),
    MaintenanceRequest.findAll({ where, order: [["createdAt", "ASC"]], limit: 5 }),
  ]);
  return { count, rows };
}

// ── Clients à relancer — scopé par créateur pour tout rôle non admin,
// EXACTEMENT comme GET /commercial-contacts/calendar/relances — un compte
// de CLIENTS distincts, pas de lignes de relance (un même client peut avoir
// plusieurs relances planifiées).
async function buildClientsToFollowUp(actingUser) {
  const where = { statutRelance: "planifiee", dateRelance: { [Op.lte]: isoDate(new Date()) } };
  if (!ADMIN_ROLES.includes(actingUser.role)) where.createdBy = actingUser.id;

  const relances = await CommercialContactRelance.findAll({
    where,
    order: [["dateRelance", "ASC"]],
    limit: 20,
    include: [{ model: CommercialContact, as: "contact", attributes: ["id", "nom", "prenom", "nomSociete"], required: false }],
  });

  const distinctClientIds = new Set(relances.map((r) => r.commercialContactId));
  return { count: distinctClientIds.size, rows: relances.slice(0, 5) };
}

// ── Timeline — regroupe par bucket (Aujourd'hui / Cette semaine / Plus
// tard) plutôt qu'un tri par date brute : les cartes de risque n'ont pas de
// date unique naturelle (voir ProjectAttentionAnalyzer, plusieurs
// dimensions possibles par projet), un tri chronologique strict serait donc
// arbitraire pour elles — toujours classées "Aujourd'hui" (elles réclament
// une attention immédiate par construction).
function buildTimeline({ riskCards, expiringQuotes, urgentInterventions, clientsToFollowUp }) {
  const items = [];

  for (const card of riskCards) {
    items.push({ type: "project", bucket: "today", label: `Projet critique : ${card.projectName}`, refId: card.projectId, date: null });
  }
  for (const devis of expiringQuotes.rows) {
    const days = daysFromNow(devis.dateExpiration);
    items.push({
      type: "quote",
      bucket: bucketFor(days),
      label: `Devis "${devis.nomDevis}" expire ${days <= 0 ? "aujourd'hui" : `dans ${days} jour(s)`}`,
      refId: devis.id,
      date: devis.dateExpiration,
    });
  }
  for (const request of urgentInterventions.rows) {
    items.push({ type: "intervention", bucket: "today", label: `Intervention urgente : ${request.equipement}`, refId: request.id, date: request.createdAt });
  }
  for (const relance of clientsToFollowUp.rows) {
    const contactName = relance.contact ? `${relance.contact.prenom || ""} ${relance.contact.nom || ""}`.trim() : "";
    items.push({
      type: "relance",
      bucket: bucketFor(daysFromNow(relance.dateRelance)),
      label: `Relancer ${contactName || "un client"}`,
      refId: relance.commercialContactId,
      date: relance.dateRelance,
    });
  }

  const bucketOrder = { today: 0, week: 1, later: 2 };
  items.sort((a, b) => bucketOrder[a.bucket] - bucketOrder[b.bucket]);
  return items;
}

async function getDashboardBriefing(reqUser) {
  const actingUser = toActingUser(reqUser);

  const [greeting, projectInsights, urgentInterventions, clientsToFollowUp] = await Promise.all([
    buildGreeting(actingUser),
    buildProjectInsights(actingUser),
    buildUrgentInterventions(actingUser),
    buildClientsToFollowUp(actingUser),
  ]);

  // Dépend du périmètre de projets déjà chargé ci-dessus — ne peut pas
  // rejoindre le Promise.all précédent.
  const expiringQuotes = await buildExpiringQuotes(projectInsights.projects.map((p) => p.id));

  const today = {
    criticalProjects: projectInsights.criticalCount,
    expiringQuotes: expiringQuotes.count,
    urgentInterventions: urgentInterventions.count,
    clientsToFollowUp: clientsToFollowUp.count,
  };

  const timeline = buildTimeline({ riskCards: projectInsights.riskCards, expiringQuotes, urgentInterventions, clientsToFollowUp });

  return {
    generatedAt: new Date().toISOString(),
    greeting,
    today,
    crmQuality: { score: projectInsights.qualityScore },
    riskCards: projectInsights.riskCards,
    recommendationCards: projectInsights.recommendationCards,
    timeline,
    chart: {
      labels: ["Projets critiques", "Devis expirants", "Interventions urgentes", "Clients à relancer"],
      values: [today.criticalProjects, today.expiringQuotes, today.urgentInterventions ?? 0, today.clientsToFollowUp],
    },
  };
}

module.exports = { getDashboardBriefing, toActingUser };
