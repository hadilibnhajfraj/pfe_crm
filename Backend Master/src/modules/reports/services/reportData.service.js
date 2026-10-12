"use strict";

// Module Rapports — données des exports PDF / Excel.
//
// Chaque rapport applique le MÊME périmètre que l'écran correspondant du CRM :
//   - projets : administrateurs = tous ; commercial = projets dont il est
//     propriétaire (définition des KPI du dashboard, dashboard.service) ;
//   - contacts : contactAccess.policy.contactListScope (politique existante) ;
//   - actions / relances : celles des projets et contacts du périmètre ;
//   - production : production.service.getExportData (périmètre existant) ;
//   - synthèse : la réponse de GET /dashboard/me.
// Le rôle est relu en base ; aucun identifiant d'utilisateur venant du client
// n'élargit le périmètre. Seules les colonnes listées ici sont lues : aucune
// donnée d'authentification ni identifiant technique n'est exporté.

const { Op } = require("sequelize");
const { ROLES, ADMIN_TIER_ROLES } = require("../../../constants/roles");

const MAX_ROWS = 5000; // lignes par feuille Excel
const ALL_ROLES = Object.values(ROLES);

const REPORTS = {
  projects: {
    type: "projects",
    title: "Rapport des projets",
    roles: [...ADMIN_TIER_ROLES, ROLES.COMMERCIAL],
    filters: ["from", "to", "status", "ownerId"],
  },
  contacts: {
    type: "contacts",
    title: "Rapport des clients et contacts",
    roles: [...ADMIN_TIER_ROLES, ROLES.COMMERCIAL_SEDENTAIRE, ROLES.COMMERCIAL],
    filters: ["from", "to", "status"],
  },
  followups: {
    type: "followups",
    title: "Rapport des actions et relances",
    roles: [...ADMIN_TIER_ROLES, ROLES.COMMERCIAL, ROLES.COMMERCIAL_SEDENTAIRE],
    filters: ["from", "to"],
  },
  production: {
    type: "production",
    title: "Rapport industriel et de production",
    roles: [...ADMIN_TIER_ROLES, ROLES.RESPONSABLE_LOGISTIQUE_ACHAT],
    filters: ["period", "from", "to", "line"],
  },
  dashboard: {
    type: "dashboard",
    title: "Synthèse du tableau de bord",
    roles: ALL_ROLES,
    filters: ["period"],
  },
};

class ReportError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isAdmin = (user) => ADMIN_TIER_ROLES.includes(user.role);
const models = () => require("../../../models/associations");

async function loadUser(userId) {
  const { User, UserProfile } = models();
  const user = await User.findByPk(userId, { attributes: ["id", "email", "role", "isActive"] });
  if (!user) throw new ReportError(401, "Compte introuvable");
  if (!user.isActive) throw new ReportError(403, "Compte désactivé");
  let displayName = null;
  try {
    const profile = await UserProfile.findOne({ where: { userId }, attributes: ["name", "nom", "prenom"] });
    if (profile) displayName = profile.name || [profile.prenom, profile.nom].filter(Boolean).join(" ") || null;
  } catch (_) {
    displayName = null;
  }
  return { id: user.id, email: user.email, role: user.role, displayName };
}

function catalogFor(user) {
  return Object.values(REPORTS)
    .filter((r) => r.roles.includes(user.role))
    .map((r) => ({
      type: r.type,
      title: r.title,
      formats: ["xlsx", "pdf"],
      filters: r.filters.filter((f) => f !== "ownerId" || isAdmin(user)),
    }));
}

function assertAllowed(type, user, filters) {
  const report = REPORTS[type];
  if (!report) throw new ReportError(404, "Rapport inconnu");
  if (!report.roles.includes(user.role)) throw new ReportError(403, "Ce rapport n'est pas disponible pour votre profil");
  if (filters.ownerId && !isAdmin(user)) throw new ReportError(403, "Le filtre par commercial est réservé aux administrateurs");
  for (const key of Object.keys(filters)) {
    if (key !== "format" && filters[key] !== undefined && !report.filters.includes(key)) {
      throw new ReportError(400, `Le filtre « ${key} » ne s'applique pas à ce rapport`);
    }
  }
  return report;
}

// ── Outils ────────────────────────────────────────────────────────────────

function dateRange(field, filters) {
  if (!filters.from && !filters.to) return {};
  const range = {};
  if (filters.from) range[Op.gte] = new Date(`${filters.from}T00:00:00.000Z`);
  if (filters.to) range[Op.lt] = new Date(new Date(`${filters.to}T00:00:00.000Z`).getTime() + 86400000);
  return { [field]: range };
}

function frDate(ymd) {
  const [y, m, d] = String(ymd).split("-");
  return `${d}/${m}/${y}`;
}

function periodLabel(filters) {
  if (filters.from && filters.to) return `du ${frDate(filters.from)} au ${frDate(filters.to)}`;
  if (filters.from) return `à partir du ${frDate(filters.from)}`;
  if (filters.to) return `jusqu'au ${frDate(filters.to)}`;
  return "Toutes périodes";
}

const plain = (row) => (row && typeof row.get === "function" ? row.get({ plain: true }) : row);
const clip = (text, max = 300) => {
  if (text === null || text === undefined) return null;
  const s = String(text).replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/** Lit au plus MAX_ROWS lignes et indique si la source en contenait davantage. */
async function limited(model, options) {
  const found = await model.findAll({ ...options, limit: MAX_ROWS + 1 });
  const truncated = found.length > MAX_ROWS;
  return { rows: found.slice(0, MAX_ROWS).map(plain), truncated };
}

async function emailsById(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { User } = models();
  const users = await User.findAll({ where: { id: { [Op.in]: unique } }, attributes: ["id", "email"] });
  return new Map(users.map(plain).map((u) => [u.id, u.email]));
}

const col = (header, key, type = "text", width = 18, unit = null) => ({ header: unit ? `${header} (${unit})` : header, key, type, width });
const kpi = (label, value, unit = null) => ({ label, value, unit });
const scopeLabel = (user, own, all) => (isAdmin(user) ? all : own);

// ── Rapport des projets ───────────────────────────────────────────────────

const PROJECT_ATTRIBUTES = ["id", "nomProjet", "entreprise", "statut", "projectModele", "typeProjet", "productFamily", "validationStatut",
  "createdAt", "dateDemarrage", "montantMarche", "surfaceProspectee", "isArchived", "ownerId"];

function projectWhere(user, filters) {
  const where = { ...dateRange("createdAt", filters) };
  if (filters.status) where.statut = filters.status;
  if (isAdmin(user)) {
    if (filters.ownerId) where.ownerId = filters.ownerId;
  } else {
    where.ownerId = user.id; // jamais un identifiant venu du client
  }
  return where;
}

async function buildProjects(user, filters) {
  const { Project } = models();
  const where = projectWhere(user, filters);
  const [{ rows, truncated }, active, validated, notValidated, archived] = await Promise.all([
    limited(Project, { where, attributes: PROJECT_ATTRIBUTES, order: [["createdAt", "DESC"]] }),
    Project.count({ where: { ...where, isArchived: false } }),
    Project.count({ where: { ...where, isArchived: false, validationStatut: "Validé" } }),
    Project.count({ where: { ...where, isArchived: false, validationStatut: "Non validé" } }),
    Project.count({ where: { ...where, isArchived: true } }),
  ]);
  const owners = isAdmin(user) ? await emailsById(rows.map((r) => r.ownerId)) : new Map();
  const columns = [
    col("Projet", "nomProjet", "text", 34), col("Client (société)", "entreprise", "text", 26), col("Statut du projet", "statut", "text", 18),
    col("Modèle de projet", "projectModele", "text", 14), col("Type de projet", "typeProjet", "text", 14), col("Famille de produit", "productFamily", "text", 14),
    col("Validation", "validationStatut", "text", 13), col("Date de création", "createdAt", "date", 14), col("Date de démarrage", "dateDemarrage", "date", 14),
    col("Montant du marché", "montantMarche", "number", 16), col("Surface prospectée", "surfaceProspectee", "number", 16), col("Archivé", "archive", "text", 9),
  ];
  if (isAdmin(user)) columns.push(col("Commercial", "commercial", "text", 30));
  return {
    kpis: [kpi("Projets actifs", active), kpi("Projets validés", validated), kpi("Projets non validés", notValidated), kpi("Projets archivés", archived)],
    sheets: [{
      name: "Projets",
      columns,
      truncated,
      rows: rows.map((r) => ({ ...r, archive: r.isArchived ? "Oui" : "Non", commercial: owners.get(r.ownerId) || null })),
    }],
    scope: scopeLabel(user, "Projets dont vous êtes propriétaire", filters.ownerId ? "Projets du commercial sélectionné" : "Tous les projets"),
    notes: ["Projets actifs = projets non archivés ; même définition que les indicateurs du tableau de bord."],
  };
}

// ── Rapport des clients et contacts ───────────────────────────────────────

const CONTACT_ATTRIBUTES = ["id", "nomSociete", "nom", "prenom", "typeClient", "localisation", "telephone", "email", "statut", "pipelineStage",
  "nbAppels", "createdAt", "commercialId"];
const CLIENT_ATTRIBUTES = ["id", "code", "raisonSociale", "region", "regime", "creeLe", "derniereFacturation"];

async function contactScopeWhere(user) {
  const { contactListScope } = require("../../commercial-contacts/policies/contactAccess.policy");
  const scope = await contactListScope({ sub: user.id, id: user.id, role: user.role });
  if (!scope) throw new ReportError(403, "Accès refusé aux contacts commerciaux");
  return scope.all ? {} : scope.where;
}

async function buildContacts(user, filters) {
  const { CommercialContact } = models();
  const scope = await contactScopeWhere(user);
  const where = { [Op.and]: [scope], ...dateRange("createdAt", filters) };
  if (filters.status) where.statut = filters.status;
  const [{ rows, truncated }, total, ok] = await Promise.all([
    limited(CommercialContact, { where, attributes: CONTACT_ATTRIBUTES, order: [["createdAt", "DESC"]] }),
    CommercialContact.count({ where }),
    CommercialContact.count({ where: { ...where, statut: "ok" } }),
  ]);
  const commercials = await emailsById(rows.map((r) => r.commercialId));
  const sheets = [{
    name: "Contacts",
    truncated,
    columns: [
      col("Société", "nomSociete", "text", 28), col("Nom", "nom", "text", 18), col("Prénom", "prenom", "text", 16), col("Type de client", "typeClient", "text", 14),
      col("Localisation", "localisation", "text", 18), col("Téléphone", "telephone", "text", 16), col("E-mail", "email", "text", 26),
      col("Statut du contact", "statut", "text", 18), col("Étape", "pipelineStage", "text", 14), col("Nombre d'appels", "nbAppels", "integer", 12),
      col("Date de création", "createdAt", "date", 14), col("Commercial affecté", "commercial", "text", 30),
    ],
    rows: rows.map((r) => ({ ...r, commercial: commercials.get(r.commercialId) || null })),
  }];
  const kpis = [kpi("Contacts", total), kpi("Contacts au statut « ok »", ok)];
  const notes = [];
  if (isAdmin(user)) {
    // La table clients n'a ni propriétaire ni lien vers un commercial : liste réservée aux administrateurs.
    const Client = require("../../../models/client.model");
    const clients = await limited(Client, { attributes: CLIENT_ATTRIBUTES, order: [["id", "ASC"]] });
    sheets.push({
      name: "Clients",
      truncated: clients.truncated,
      columns: [col("Code client", "code", "text", 14), col("Raison sociale", "raisonSociale", "text", 36), col("Région", "region", "text", 16),
        col("Régime", "regime", "text", 14), col("Date de création", "creeLe", "date", 14), col("Dernière facturation", "derniereFacturation", "date", 16)],
      rows: clients.rows,
    });
    kpis.push(kpi("Clients", await Client.count()));
    notes.push("La feuille Clients n'est pas filtrée par période : la table clients n'est pas reliée aux contacts ni aux commerciaux.");
  } else {
    notes.push("La liste des clients est réservée aux administrateurs.");
  }
  return {
    kpis, sheets, notes,
    scope: scopeLabel(user, user.role === ROLES.COMMERCIAL ? "Contacts qui vous sont affectés, que vous avez créés ou que vous suivez" : "Tous les contacts", "Tous les contacts et clients"),
  };
}

// ── Rapport des actions et relances ───────────────────────────────────────

async function buildFollowups(user, filters) {
  const { Project, ProjectAction, CommercialContact, CommercialContactRelance } = models();
  const sheets = [];
  const kpis = [];

  if (isAdmin(user) || user.role === ROLES.COMMERCIAL) {
    const where = { ...dateRange("dateAction", filters) };
    let projectNames = new Map();
    if (!isAdmin(user)) {
      const mine = (await Project.findAll({ where: { ownerId: user.id }, attributes: ["id", "nomProjet"] })).map(plain);
      projectNames = new Map(mine.map((p) => [p.id, p.nomProjet]));
      where.projectId = { [Op.in]: mine.map((p) => p.id) };
    }
    const [{ rows, truncated }, total] = await Promise.all([
      limited(ProjectAction, { where, attributes: ["id", "projectId", "dateAction", "typeAction_legacy", "statut", "priorite", "dateRelance", "commentaire"], order: [["dateAction", "DESC"]] }),
      ProjectAction.count({ where }),
    ]);
    if (isAdmin(user)) {
      const ids = [...new Set(rows.map((r) => r.projectId).filter(Boolean))];
      const found = ids.length ? (await Project.findAll({ where: { id: { [Op.in]: ids } }, attributes: ["id", "nomProjet"] })).map(plain) : [];
      projectNames = new Map(found.map((p) => [p.id, p.nomProjet]));
    }
    sheets.push({
      name: "Actions projet",
      truncated,
      columns: [col("Date de l'action", "dateAction", "date", 14), col("Projet", "projet", "text", 34), col("Type d'action", "typeAction_legacy", "text", 20),
        col("Statut de l'action", "statut", "text", 14), col("Priorité", "priorite", "text", 11), col("Date de relance", "dateRelance", "date", 14), col("Commentaire", "commentaire", "text", 46)],
      rows: rows.map((r) => ({ ...r, projet: projectNames.get(r.projectId) || null, commentaire: clip(r.commentaire) })),
    });
    kpis.push(kpi("Actions projet", total));
  }

  const scope = await contactScopeWhere(user);
  const where = { ...dateRange("dateRelance", filters) };
  const contacts = (await CommercialContact.findAll({ where: scope, attributes: ["id", "nomSociete", "nom", "prenom"] })).map(plain);
  const contactNames = new Map(contacts.map((c) => [c.id, [c.nomSociete, [c.prenom, c.nom].filter(Boolean).join(" ")].filter(Boolean).join(" — ")]));
  if (Object.keys(scope).length || Object.getOwnPropertySymbols(scope).length) where.commercialContactId = { [Op.in]: contacts.map((c) => c.id) };
  const [{ rows, truncated }, total, done, planned, cancelled] = await Promise.all([
    limited(CommercialContactRelance, { where, attributes: ["id", "commercialContactId", "dateRelance", "heureRelance", "statutRelance", "commercialName", "commentaire"], order: [["dateRelance", "DESC"]] }),
    CommercialContactRelance.count({ where }),
    CommercialContactRelance.count({ where: { ...where, statutRelance: "faite" } }),
    CommercialContactRelance.count({ where: { ...where, statutRelance: "planifiee" } }),
    CommercialContactRelance.count({ where: { ...where, statutRelance: "annulee" } }),
  ]);
  sheets.push({
    name: "Relances contacts",
    truncated,
    columns: [col("Date de relance", "dateRelance", "date", 14), col("Heure", "heureRelance", "text", 9), col("Contact", "contact", "text", 40),
      col("Statut de la relance", "statutRelance", "text", 16), col("Commercial", "commercialName", "text", 26), col("Commentaire", "commentaire", "text", 46)],
    rows: rows.map((r) => ({ ...r, contact: contactNames.get(r.commercialContactId) || null, commentaire: clip(r.commentaire) })),
  });
  kpis.push(kpi("Relances de contacts", total), kpi("Relances faites", done), kpi("Relances planifiées", planned), kpi("Relances annulées", cancelled));

  return {
    kpis, sheets,
    scope: scopeLabel(user, user.role === ROLES.COMMERCIAL ? "Actions de vos projets et relances de vos contacts" : "Relances de tous les contacts", "Toutes les actions et relances"),
    notes: ["La période s'applique à la date de l'action et à la date de la relance."],
  };
}

// ── Synthèse du tableau de bord ───────────────────────────────────────────

async function buildDashboard(user, filters) {
  const me = require("../../dashboard/services/meDashboard.service");
  const data = await me.getMyDashboard({ sub: user.id, role: user.role }, { period: filters.period });
  return {
    kpis: data.kpis.map((k) => kpi(k.label, k.value, k.unit)),
    sheets: [
      {
        name: "Indicateurs",
        truncated: false,
        columns: [col("Groupe", "group", "text", 34), col("Indicateur", "label", "text", 30), col("Valeur", "value", "number", 14), col("Unité", "unit", "text", 9), col("Source", "source", "text", 62)],
        rows: data.kpis,
      },
      { name: "Modules", truncated: false, columns: [col("Module accessible", "label", "text", 34)], rows: data.modules },
    ],
    scope: `Profil ${data.profile.roleLabel}`,
    notes: data.limitations,
    period: (data.freshness.production && data.freshness.production.period && data.freshness.production.period.label) || null,
  };
}

const BUILDERS = { projects: buildProjects, contacts: buildContacts, followups: buildFollowups, dashboard: buildDashboard };

/**
 * Construit la définition complète d'un rapport (hors production, déléguée
 * au service existant — voir report.controller.js).
 */
async function buildReport(type, user, filters, now = new Date()) {
  const report = assertAllowed(type, user, filters);
  const body = await BUILDERS[type](user, filters);
  const applied = [];
  if (filters.status) applied.push(`Statut : ${filters.status}`);
  if (filters.ownerId) applied.push("Commercial sélectionné");
  if (filters.period) applied.push(`Période : ${filters.period}`);
  return {
    type,
    title: report.title,
    period: body.period || periodLabel(filters),
    filters: applied,
    generatedAt: now,
    requestedBy: user.displayName ? `${user.displayName} (${user.email})` : user.email,
    scope: body.scope,
    kpis: body.kpis,
    sheets: body.sheets,
    notes: body.notes || [],
    maxRows: MAX_ROWS,
  };
}

module.exports = { REPORTS, MAX_ROWS, ReportError, loadUser, catalogFor, assertAllowed, buildReport, isAdmin };
