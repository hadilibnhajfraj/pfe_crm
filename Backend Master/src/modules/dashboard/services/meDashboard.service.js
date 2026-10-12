"use strict";

// GET /dashboard/me — tableau de bord personnalisé.
//
// Le profil vient TOUJOURS de la base (users.role, users.isActive), jamais du
// rôle porté par le jeton ni d'un paramètre client. Les indicateurs ne sont
// pas recalculés ici : ce service compose les services existants, chacun
// gardant son propre périmètre :
//   - dashboard.service.getKPIByRole        (GET /dashboard/kpi)
//   - commercialContactKpi.service          (GET /commercial-contacts/kpi, /my-kpi)
//   - production.service.getDashboard       (GET /production/dashboard)
// Aucun de ces services n'est modifié (le Copilot IA les appelle aussi).
//
// Un bloc d'indicateurs en erreur n'empêche pas la réponse : il est omis et
// signalé dans `limitations`.

const { ROLES, ADMIN_TIER_ROLES } = require("../../../constants/roles");
const { ALLOWED_PREFIXES_BY_ROLE } = require("../../../middleware/moduleAccessGuard");

const PERIOD_KEYS = ["today", "week", "month", "year"];

const ROLE_LABELS = {
  [ROLES.COMMERCIAL]: "Commercial",
  [ROLES.COMMERCIAL_SEDENTAIRE]: "Commercial sédentaire",
  [ROLES.ACCUEIL]: "Accueil",
  [ROLES.ADMIN]: "Administrateur",
  [ROLES.SUPERADMIN]: "Super administrateur",
  [ROLES.SUPERADMIN2]: "Super administrateur 2",
  [ROLES.RESPONSABLE_LOGISTIQUE_ACHAT]: "Responsable Logistique & Achat",
};

// Modules : clé stable (l'application en déduit sa route), libellé, et la
// règle d'accès réellement appliquée par le backend.
const MODULES = {
  projects: { key: "projects", label: "Projets", api: "/projects" },
  pipeline: { key: "pipeline", label: "Pipeline (Kanban)", api: "/pipeline" },
  commercial_contacts: { key: "commercial_contacts", label: "Contacts commerciaux", api: "/commercial-contacts" },
  contacts_kpi: { key: "contacts_kpi", label: "KPI des contacts", api: "/commercial-contacts/kpi" },
  clients: { key: "clients", label: "Clients", api: "/api/clients" },
  users_admin: { key: "users_admin", label: "Utilisateurs", api: "/admin/users" },
  project_user_stats: { key: "project_user_stats", label: "Projets par utilisateur", api: "/projects/kpi/projects-per-user-summary" },
  production: { key: "production", label: "Production", api: "/production" },
  por_promesh: { key: "por_promesh", label: "POR PROMESH", api: "/por-promesh" },
  industrial_records: { key: "industrial_records", label: "Fiches industrielles", api: "/industrial-records" },
  recuperables: { key: "recuperables", label: "Récupérables", api: "/recuperables" },
  machines: { key: "machines", label: "Machines", api: "/machines" },
  maintenance: { key: "maintenance", label: "Maintenance", api: "/maintenance-requests" },
  hr_requests: { key: "hr_requests", label: "Demandes RH", api: "/hr-requests" },
};
const pick = (...keys) => keys.map((k) => ({ ...MODULES[k] }));

// Responsable logistique : la liste vient de la table réellement appliquée
// par moduleAccessGuard, pour ne jamais annoncer un module qu'il refuserait.
function logisticsModules() {
  const prefixes = ALLOWED_PREFIXES_BY_ROLE[ROLES.RESPONSABLE_LOGISTIQUE_ACHAT] || [];
  return Object.values(MODULES)
    .filter((m) => prefixes.some((p) => m.api === p || m.api.startsWith(`${p}/`)))
    .map((m) => ({ ...m }));
}

function modulesFor(role) {
  if (ADMIN_TIER_ROLES.includes(role)) {
    return pick("projects", "pipeline", "commercial_contacts", "contacts_kpi", "clients", "users_admin", "project_user_stats",
      "production", "por_promesh", "industrial_records", "recuperables", "machines", "maintenance", "hr_requests");
  }
  if (role === ROLES.COMMERCIAL) return pick("projects", "pipeline", "commercial_contacts");
  if (role === ROLES.COMMERCIAL_SEDENTAIRE) return pick("commercial_contacts", "contacts_kpi");
  if (role === ROLES.ACCUEIL) return pick("commercial_contacts", "project_user_stats");
  if (role === ROLES.RESPONSABLE_LOGISTIQUE_ACHAT) return logisticsModules();
  return [];
}

function profileKey(role) {
  if (ADMIN_TIER_ROLES.includes(role)) return "administration";
  if (role === ROLES.RESPONSABLE_LOGISTIQUE_ACHAT) return "logistique";
  return ROLE_LABELS[role] ? role : "inconnu";
}

const num = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
function kpi(key, label, value, { unit = null, format = "integer", group, source }) {
  return { key, label, value: num(value), unit, format, group, source };
}

// ── Blocs d'indicateurs : un bloc = un appel à un service existant ─────────

async function crmGlobalBlock(user) {
  const dashboardService = require("./dashboard.service");
  const data = await dashboardService.getKPIByRole(user.id, user.role);
  const s = data.stats || {};
  const source = "dashboard.service.getKPIByRole (GET /dashboard/kpi)";
  const group = "Projets (toute l'entreprise)";
  return [
    kpi("projects_total", "Projets", s.totalProjects, { group, source }),
    kpi("projects_validated", "Projets validés", s.totalValidated, { group, source }),
    kpi("projects_not_validated", "Projets non validés", s.totalNonValidated, { group, source }),
    kpi("projects_archived", "Projets archivés", s.totalArchived, { group, source }),
    kpi("projects_validation_rate", "Taux de validation", s.validationRate, { unit: "%", format: "percent", group, source }),
    kpi("users_total", "Utilisateurs", s.totalUsers, { group, source }),
  ];
}

async function crmPersonalBlock(user) {
  const dashboardService = require("./dashboard.service");
  const data = await dashboardService.getKPIByRole(user.id, user.role);
  const s = data.stats || {};
  const source = "dashboard.service.getKPIByRole (GET /dashboard/kpi)";
  const g1 = "Mes projets";
  const g2 = "Mes relances";
  return [
    kpi("my_projects", "Projets actifs", s.myProjects, { group: g1, source }),
    kpi("my_projects_validated", "Projets validés", s.myValidated, { group: g1, source }),
    kpi("my_projects_not_validated", "Projets non validés", s.myNonValidated, { group: g1, source }),
    kpi("my_projects_archived", "Projets archivés", s.myArchived, { group: g1, source }),
    kpi("my_validation_rate", "Taux de validation", s.successRate, { unit: "%", format: "percent", group: g1, source }),
    kpi("my_followups", "Relances planifiées", s.myRelances, { group: g2, source }),
    kpi("my_followups_today", "Relances du jour", s.myRelancesToday, { group: g2, source }),
    kpi("my_followups_week", "Relances de la semaine", s.myRelancesWeek, { group: g2, source }),
    kpi("my_followups_late", "Relances en retard", s.myRelancesLate, { group: g2, source }),
  ];
}

async function contactsGlobalBlock() {
  const contactKpi = require("../../commercial-contacts/services/commercialContactKpi.service");
  const { global: g = {} } = await contactKpi.getCommercialContactKPI(null);
  const source = "commercialContactKpi.service.getCommercialContactKPI (GET /commercial-contacts/kpi)";
  const group = "Contacts commerciaux (toute l'entreprise)";
  return [
    kpi("contacts_total", "Contacts", g.totalContacts, { group, source }),
    kpi("contacts_active", "Contacts au statut « ok »", g.contactsActifs, { group, source }),
    kpi("contacts_calls", "Appels enregistrés", g.totalCalls, { group, source }),
    kpi("contacts_companies", "Sociétés distinctes", g.totalCompanies, { group, source }),
  ];
}

async function contactsPersonalBlock(user) {
  const contactKpi = require("../../commercial-contacts/services/commercialContactKpi.service");
  const k = await contactKpi.getMyKPI(user.id);
  const source = "commercialContactKpi.service.getMyKPI (GET /commercial-contacts/my-kpi)";
  const group = "Contacts que j'ai saisis";
  return [
    kpi("my_contacts", "Contacts saisis", k.totalContacts, { group, source }),
    kpi("my_contacts_ok", "Contacts au statut « ok »", k.validatedContacts, { group, source }),
    kpi("my_contacts_other", "Contacts à un autre statut", k.invalidContacts, { group, source }),
    kpi("my_calls", "Appels enregistrés", k.totalCalls, { group, source }),
    kpi("my_companies", "Sociétés distinctes", k.totalCompanies, { group, source }),
  ];
}

async function productionBlock(user, period, meta) {
  const productionService = require("../../production/services/production.service");
  const d = await productionService.getDashboard({ id: user.id, role: user.role, email: user.email }, { period });
  meta.production = { period: d.period || null, generatedAt: d.generatedAt || null };
  const source = "production.service.getDashboard (GET /production/dashboard)";
  const group = `Production${d.period && d.period.label ? ` — ${d.period.label}` : ""}`;
  const promesh = d.promesh || {};
  const probar = d.probar || {};
  const machines = d.machines || {};
  return [
    kpi("promesh_fiches", "Fiches PROMESH", promesh.fiches, { group, source }),
    kpi("promesh_quantity", "Production PROMESH", promesh.quantity, { unit: "m²", format: "decimal", group, source }),
    kpi("probar_fiches", "Fiches PROBAR", probar.fiches, { group, source }),
    kpi("probar_quantity", "Quantité PROBAR", probar.quantity, { unit: null, format: "decimal", group, source }),
    kpi("waste_kg", "Déchets", d.waste ? d.waste.kg : null, { unit: "kg", format: "decimal", group, source }),
    kpi("machines_active", "Machines actives", machines.active, { group, source }),
    kpi("machines_total", "Machines du référentiel", machines.total, { group, source }),
  ];
}

const PERIOD_FILTER = {
  key: "period",
  label: "Période (production)",
  type: "enum",
  options: [
    { value: "today", label: "Aujourd'hui" },
    { value: "week", label: "Cette semaine" },
    { value: "month", label: "Ce mois" },
    { value: "year", label: "Cette année" },
  ],
  default: "month",
  appliesTo: ["Production"],
};

function planFor(role) {
  if (ADMIN_TIER_ROLES.includes(role)) {
    return {
      blocks: [["Projets", crmGlobalBlock], ["Contacts commerciaux", contactsGlobalBlock], ["Production", productionBlock]],
      filters: [PERIOD_FILTER],
      limitations: [
        "Les indicateurs de projets et de contacts portent sur toutes les périodes : seul le bloc Production suit le filtre de période.",
        "Quantité PROBAR : l'unité de ce champ n'est pas définie dans le CRM ; elle n'est pas additionnée à PROMESH (m²).",
      ],
    };
  }
  if (role === ROLES.COMMERCIAL) {
    return {
      blocks: [["Projets et relances", crmPersonalBlock]],
      filters: [],
      limitations: [
        "Périmètre : uniquement les projets dont vous êtes propriétaire, et les relances de ces projets.",
        "Aucun filtre de période n'est disponible pour ces indicateurs.",
      ],
    };
  }
  if (role === ROLES.COMMERCIAL_SEDENTAIRE) {
    return {
      blocks: [["Contacts commerciaux", contactsPersonalBlock]],
      filters: [],
      limitations: [
        "Périmètre : uniquement les contacts que vous avez saisis.",
        "Aucun filtre de période n'est disponible pour ces indicateurs.",
      ],
    };
  }
  if (role === ROLES.RESPONSABLE_LOGISTIQUE_ACHAT) {
    return {
      blocks: [["Production", productionBlock]],
      filters: [PERIOD_FILTER],
      limitations: [
        "Périmètre : uniquement les fiches que vous avez créées.",
        "Quantité PROBAR : l'unité de ce champ n'est pas définie dans le CRM ; elle n'est pas additionnée à PROMESH (m²).",
      ],
    };
  }
  if (role === ROLES.ACCUEIL) {
    return {
      blocks: [],
      filters: [],
      limitations: ["Aucun indicateur n'est défini pour le profil Accueil : seuls les modules accessibles sont listés."],
    };
  }
  return { blocks: [], filters: [], limitations: ["Rôle non reconnu : aucun module ni indicateur n'est exposé."] };
}

class DashboardAccessError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function loadUser(userId) {
  const { User, UserProfile } = require("../../../models/associations");
  const user = await User.findByPk(userId, { attributes: ["id", "email", "role", "isActive"] });
  if (!user) throw new DashboardAccessError(401, "Compte introuvable");
  if (!user.isActive) throw new DashboardAccessError(403, "Compte désactivé");
  let displayName = null;
  try {
    // Lecture seule : aucun profil n'est créé s'il n'existe pas.
    const profile = await UserProfile.findOne({ where: { userId }, attributes: ["name", "nom", "prenom"] });
    if (profile) displayName = profile.name || [profile.prenom, profile.nom].filter(Boolean).join(" ") || null;
  } catch (_) {
    displayName = null;
  }
  return { id: user.id, email: user.email, role: user.role, isActive: user.isActive, displayName };
}

/**
 * @param {{ sub: string, role?: string }} tokenUser  identité du jeton (seul `sub` fait foi)
 * @param {{ period?: string }} query
 */
async function getMyDashboard(tokenUser, query = {}) {
  const user = await loadUser(tokenUser && tokenUser.sub);
  const period = PERIOD_KEYS.includes(query.period) ? query.period : "month";
  const plan = planFor(user.role);
  const meta = {};
  const limitations = [...plan.limitations];

  const settled = await Promise.allSettled(plan.blocks.map(([, build]) => build(user, period, meta)));
  const kpis = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") kpis.push(...result.value);
    else limitations.push(`Indicateurs « ${plan.blocks[i][0]} » momentanément indisponibles.`);
  });
  if (query.period && !PERIOD_KEYS.includes(query.period)) limitations.push(`Période « ${query.period} » inconnue : « month » a été appliquée.`);

  const roleInToken = tokenUser && tokenUser.role;
  if (roleInToken && roleInToken !== user.role) {
    limitations.push("Votre rôle a changé depuis votre connexion : reconnectez-vous pour que tous les écrans en tiennent compte.");
  }

  return {
    profile: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      roleLabel: ROLE_LABELS[user.role] || user.role,
      key: profileKey(user.role),
      source: "database",
    },
    modules: modulesFor(user.role),
    kpis,
    filters: plan.filters.map((f) => (f.key === "period" ? { ...f, value: period } : { ...f })),
    freshness: {
      generatedAt: new Date().toISOString(),
      mode: "live",
      description: "Indicateurs calculés à la demande sur la base du CRM.",
      production: meta.production || null,
    },
    limitations,
  };
}

module.exports = { getMyDashboard, DashboardAccessError, modulesFor, PERIOD_KEYS };
