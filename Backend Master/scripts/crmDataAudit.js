"use strict";

// Audit de la qualité des données du CRM et PLAN À BLANC d'enrichissement.
//
//   npm run data:audit
//
// LECTURE SEULE : ce script n'exécute que des SELECT. Il n'écrit rien dans la
// base ; il produit deux fichiers dans reports/data-quality/ :
//   - audit.json    : mesures (remplissage, relations, doublons, validité)
//   - dry-run.json  : modifications PROPOSÉES, chacune avec sa source, sa
//                     raison et son niveau de confiance (HIGH / MEDIUM / LOW)
//
// Règles :
// - aucune donnée n'est inventée : une valeur proposée vient toujours d'une
//   autre ligne du CRM, citée comme source ;
// - HIGH   = une seule valeur possible, rapprochement exact ;
//   MEDIUM = rapprochement approché ou plusieurs valeurs candidates ;
//   LOW    = signalé, jamais proposé à l'écriture ;
// - les colonnes sensibles (mots de passe, jetons, IP) ne sont jamais lues.

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { sequelize } = require("../src/db");
const { normalizeName, matchType, tokensOf } = require("../src/utils/nameMatch");

const OUT_DIR = path.join(__dirname, "..", "reports", "data-quality");
const SENSITIVE = /password|token|hash|secret|otp|lastLoginIp/i;
// Tables de l'application Metabase et de son ordonnanceur, hébergées dans la
// même base : hors périmètre du CRM.
const CRM_TABLES = [
  "users", "user_profiles", "clients", "companies", "engineers", "architects", "projects", "user_projects", "project_actions", "project_action_types",
  "project_activities", "project_comments", "project_devis", "project_bon_de_commande", "project_reminders", "project_members", "pipeline_stages", "tasks",
  "commercial_contacts", "commercial_contact_actions", "commercial_contact_products", "commercial_contact_relances", "commercial_contact_reminders",
  "commercial_contact_status_histories", "commercial_projects", "machines", "industrial_records", "por_promesh", "por_promesh_controles_qualite",
  "por_promesh_process_control", "por_promesh_arrets_machine", "por_promesh_consommations", "por_promesh_non_conformites", "por_promesh_attachments",
  "recuperable_fiches", "recuperable_lignes", "maintenance_requests", "maintenance_request_activities", "maintenance_request_comments", "maintenance_activities",
  "hr_requests", "hr_request_activities", "archive_requests", "archive_request_messages", "notifications", "email_queue", "calendar_event_syncs",
  "google_calendar_accounts",
];
const PLACEHOLDERS = new Set(["none", "null", "n/a", "na", "-", "--", ".", "x", "aucun", "neant", "inconnu", "test", "xxx", "?"]);

const q = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: "SELECT" });
const pct = (n, total) => (total ? Math.round((n / total) * 1000) / 10 : null);
const clean = (v) => String(v == null ? "" : v).trim().replace(/\s+/g, " ");
const isPlaceholder = (v) => PLACEHOLDERS.has(normalizeName(v));
const digits = (v) => String(v || "").replace(/\D/g, "");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Numéro tunisien : 8 chiffres, éventuellement précédés de 216.
const validTnPhone = (v) => /^(?:216)?[2-9]\d{7}$/.test(digits(v));

// ── Remplissage par colonne ────────────────────────────────────────────────
async function tableProfile(table) {
  const [{ n }] = await q(`SELECT COUNT(*)::bigint AS n FROM "${table}"`);
  const rows = Number(n);
  const cols = await q(`SELECT column_name AS c, data_type AS d FROM information_schema.columns WHERE table_schema = 'public' AND table_name = :table ORDER BY ordinal_position`, { table });
  const columns = [];
  // Table volumineuse : pas de balayage colonne par colonne.
  if (rows > 500000) return { table, rows, columns: cols.map(({ c, d }) => ({ column: c, type: d, sensitive: SENSITIVE.test(c), filled: null })), skipped: "volume" };
  for (const { c, d } of cols) {
    if (SENSITIVE.test(c)) {
      columns.push({ column: c, type: d, sensitive: true, filled: null });
      continue;
    }
    const text = /char|text/.test(d);
    const [{ f }] = await q(`SELECT COUNT(*)::int AS f FROM "${table}" WHERE "${c}" IS NOT NULL ${text ? `AND TRIM("${c}"::text) <> ''` : ""}`);
    columns.push({ column: c, type: d, sensitive: false, filled: f, fillRate: pct(f, rows) });
  }
  return { table, rows, columns };
}

// ── Doublons : noms proches dans une même table ───────────────────────────
// Regroupe d'abord par nom normalisé (identiques → confiance 0,95), puis
// compare les noms restants deux à deux (approché → 0,6 ; mêmes mots → 0,8).
function duplicateCandidates(rows, { label }) {
  const out = [];
  const byKey = new Map();
  for (const r of rows) {
    const key = normalizeName(r.name);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r);
  }
  for (const group of byKey.values()) {
    for (let i = 1; i < group.length; i++) out.push({ entity: label, record1: group[0], record2: group[i], reason: "même nom (casse / accents / espaces ignorés)", confidence: 0.95 });
  }
  const unique = [...byKey.values()].map((g) => g[0]);
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      const a = unique[i];
      const b = unique[j];
      const type = matchType(a.name, b.name) || matchType(b.name, a.name);
      if (!type) continue;
      // « tokens » avec un seul mot en commun (« Immo ») n'est pas un doublon.
      const ta = tokensOf(a.name);
      const tb = tokensOf(b.name);
      if (type === "tokens" && Math.min(ta.length, tb.length) < 2) continue;
      if (type === "fuzzy" && ta.length !== tb.length) continue;
      out.push({ entity: label, record1: a, record2: b, reason: type === "fuzzy" ? "orthographe très proche" : "mêmes mots, ordre ou longueur différents", confidence: type === "fuzzy" ? 0.6 : 0.8 });
    }
  }
  return out;
}

// ── Rapprochement d'un libellé libre avec un référentiel ──────────────────
function resolve(label, referential) {
  const value = clean(label);
  if (!value || isPlaceholder(value)) return { status: "empty" };
  const key = normalizeName(value);
  const exact = referential.filter((r) => normalizeName(r.name) === key);
  if (exact.length === 1) return { status: "exact", match: exact[0] };
  if (exact.length > 1) return { status: "ambiguous", matches: exact };
  const near = referential.filter((r) => matchType(value, r.name) === "fuzzy" || matchType(r.name, value) === "fuzzy");
  if (near.length === 1) return { status: "near", match: near[0] };
  return { status: near.length ? "ambiguous" : "none", matches: near };
}

async function main() {
  const startedAt = new Date().toISOString();
  const audit = { generatedAt: startedAt, database: process.env.DB_NAME || null, readOnly: true };
  const plan = { generatedAt: startedAt, dryRun: true, changes: [], skipped: [], schemaProposals: [] };
  const propose = (change) => plan.changes.push(change);
  const skip = (item) => plan.skipped.push(item);

  // 1. Inventaire des tables
  const allTables = (await q(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`)).map((r) => r.t);
  const crmTables = CRM_TABLES.filter((t) => allTables.includes(t));
  audit.tables = {
    total: allTables.length,
    crm: crmTables.length,
    other: allTables.length - crmTables.length,
    otherNote: "Tables de l'application Metabase (core_user, report_card, qrtz_*…) et SequelizeMeta : hors périmètre CRM.",
    profiles: [],
  };
  for (const t of crmTables) audit.tables.profiles.push(await tableProfile(t));

  // 2. Référentiels
  const companies = await q(`SELECT id, TRIM(name) AS name FROM companies`);
  const engineers = await q(`SELECT id, TRIM(name) AS name, phone, email FROM engineers`);
  const architects = await q(`SELECT id, TRIM(name) AS name, phone, email FROM architects`);
  const clients = await q(`SELECT id, code, TRIM("raisonSociale") AS name, "matriculeFiscal", region FROM clients`);
  const users = await q(`SELECT id, email, role, "isActive" FROM users`);
  const projects = await q(
    `SELECT id, "nomProjet" AS name, entreprise, "companyId", "ingenieurResponsable", "engineerId", "telephoneIngenieur", "emailIngenieur", architecte, "architectId",
            "telephoneArchitecte", "emailArchitecte", promoteur, statut, "pipelineStageId", "ownerId", "productFamily", "typeProjet", latitude, longitude,
            "dateDemarrage", "isArchived", "createdAt"
       FROM projects`
  );
  const contacts = await q(`SELECT id, TRIM(COALESCE(prenom, '') || ' ' || COALESCE(nom, '')) AS name, "nomSociete", telephone, email, "matriculeFiscale", "commercialId", "createdBy", statut, "typeClient" FROM commercial_contacts`);

  // 3. Utilisateurs / commerciaux
  const roleCounts = {};
  for (const u of users) roleCounts[u.role] = (roleCounts[u.role] || 0) + 1;
  const [{ n: profiles }] = await q(`SELECT COUNT(*)::int AS n FROM user_profiles WHERE NULLIF(TRIM(name), '') IS NOT NULL`);
  audit.users = {
    total: users.length,
    active: users.filter((u) => u.isActive).length,
    inactive: users.filter((u) => !u.isActive).length,
    byRole: roleCounts,
    withDisplayName: profiles,
    note: "Le type de commercial est le rôle (commercial = terrain, commercial_sedentaire). Aucune zone, équipe ni responsable n'existe dans le schéma.",
  };

  // 4. Doublons
  const dup = {
    companies: duplicateCandidates(companies, { label: "company" }),
    engineers: duplicateCandidates(engineers, { label: "engineer" }),
    architects: duplicateCandidates(architects, { label: "architect" }),
    clients: duplicateCandidates(clients.map((c) => ({ id: c.id, name: c.name, code: c.code })), { label: "client" }),
  };
  // Contacts : même téléphone = même personne probable.
  const byPhone = new Map();
  for (const c of contacts) {
    const d = digits(c.telephone).slice(-8);
    if (d.length < 8) continue;
    if (!byPhone.has(d)) byPhone.set(d, []);
    byPhone.get(d).push(c);
  }
  dup.contacts = [];
  for (const group of byPhone.values()) {
    for (let i = 1; i < group.length; i++) {
      const sameName = normalizeName(group[0].name) === normalizeName(group[i].name);
      dup.contacts.push({
        entity: "contact",
        record1: { id: group[0].id, name: group[0].name, company: group[0].nomSociete },
        record2: { id: group[i].id, name: group[i].name, company: group[i].nomSociete },
        reason: sameName ? "même téléphone et même nom" : "même téléphone, noms différents",
        confidence: sameName ? 0.95 : 0.6,
      });
    }
  }
  // Clients : même matricule fiscal.
  const byTax = new Map();
  for (const c of clients) {
    const key = clean(c.matriculeFiscal).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (key.length < 6) continue;
    if (!byTax.has(key)) byTax.set(key, []);
    byTax.get(key).push(c);
  }
  dup.clientsByTaxId = [];
  for (const group of byTax.values()) {
    for (let i = 1; i < group.length; i++) dup.clientsByTaxId.push({ entity: "client", record1: { id: group[0].id, name: group[0].name, code: group[0].code }, record2: { id: group[i].id, name: group[i].name, code: group[i].code }, reason: "même matricule fiscal", confidence: 0.9 });
  }
  audit.duplicates = Object.fromEntries(Object.entries(dup).map(([k, v]) => [k, { count: v.length, candidates: v.sort((a, b) => b.confidence - a.confidence) }]));

  // 5. Projets : relations et plan
  const stats = { total: projects.length, archived: projects.filter((p) => p.isArchived).length };
  const count = (fn) => projects.filter(fn).length;
  stats.withoutCompanyText = count((p) => !clean(p.entreprise));
  stats.withoutCompanyLink = count((p) => !p.companyId);
  stats.companyTextButNoLink = count((p) => clean(p.entreprise) && !p.companyId);
  stats.withoutEngineerText = count((p) => !clean(p.ingenieurResponsable));
  stats.engineerTextButNoLink = count((p) => clean(p.ingenieurResponsable) && !p.engineerId);
  stats.architectTextButNoLink = count((p) => clean(p.architecte) && !p.architectId);
  stats.withoutStatus = count((p) => !clean(p.statut));
  stats.withoutPipelineStage = count((p) => !p.pipelineStageId);
  stats.withoutProductFamily = count((p) => !p.productFamily);
  stats.withoutStartDate = count((p) => !p.dateDemarrage);
  stats.withoutCoordinates = count((p) => p.latitude == null || p.longitude == null);
  // Tunisie : latitude 30–38, longitude 7–12.
  stats.coordinatesOutsideTunisia = count((p) => p.latitude != null && p.longitude != null && (Number(p.latitude) < 30 || Number(p.latitude) > 38 || Number(p.longitude) < 7 || Number(p.longitude) > 12));
  stats.placeholderPromoter = count((p) => clean(p.promoteur) && isPlaceholder(p.promoteur));
  const userIds = new Set(users.map((u) => u.id));
  stats.ownerMissingUser = count((p) => !userIds.has(p.ownerId));
  const inactiveIds = new Set(users.filter((u) => !u.isActive).map((u) => u.id));
  stats.ownerInactive = count((p) => inactiveIds.has(p.ownerId));
  stats.startDateInFuture = count((p) => p.dateDemarrage && new Date(p.dateDemarrage) > new Date(Date.now() + 366 * 86400000));
  stats.startDateBefore2015 = count((p) => p.dateDemarrage && new Date(p.dateDemarrage) < new Date("2015-01-01"));

  const link = (project, { text, idColumn, referential, table, label }) => {
    if (!clean(text) || project[idColumn]) return;
    const r = resolve(text, referential);
    const base = { table: "projects", record: project.id, recordLabel: project.name, column: idColumn, oldValue: null, source: { type: "CRM_database", table: "projects", record: project.id, column: label, value: clean(text) } };
    if (r.status === "exact") propose({ ...base, action: "UPDATE", newValue: r.match.id, newValueLabel: r.match.name, reason: `libellé « ${clean(text)} » identique à ${table}.name`, confidence: "HIGH" });
    else if (r.status === "near") propose({ ...base, action: "UPDATE", newValue: r.match.id, newValueLabel: r.match.name, reason: `libellé « ${clean(text)} » proche de « ${r.match.name} » (${table})`, confidence: "MEDIUM" });
    else if (r.status === "none") skip({ ...base, action: "SKIPPED", reason: `« ${clean(text)} » absent de ${table} : créer la fiche est une décision métier`, confidence: "LOW" });
    else if (r.status === "ambiguous") skip({ ...base, action: "SKIPPED", reason: `« ${clean(text)} » correspond à plusieurs lignes de ${table}`, confidence: "LOW" });
    else skip({ ...base, action: "SKIPPED", reason: "valeur de remplissage", confidence: "LOW" });
  };
  for (const p of projects) {
    link(p, { text: p.entreprise, idColumn: "companyId", referential: companies, table: "companies", label: "entreprise" });
    link(p, { text: p.ingenieurResponsable, idColumn: "engineerId", referential: engineers, table: "engineers", label: "ingenieurResponsable" });
    link(p, { text: p.architecte, idColumn: "architectId", referential: architects, table: "architects", label: "architecte" });
  }
  audit.projects = stats;

  // 6. Coordonnées des ingénieurs / architectes : reprises des projets liés
  const fillFromProjects = (people, { table, idColumn, phoneColumn, emailColumn }) => {
    for (const person of people) {
      const own = projects.filter((p) => p[idColumn] === person.id);
      for (const [column, projectColumn, valid] of [["phone", phoneColumn, (v) => digits(v).length >= 8], ["email", emailColumn, (v) => EMAIL_RE.test(clean(v))]]) {
        if (clean(person[column])) continue;
        const values = new Map();
        for (const p of own) {
          const v = clean(p[projectColumn]);
          if (!v || !valid(v)) continue;
          const key = column === "phone" ? digits(v).slice(-8) : v.toLowerCase();
          if (!values.has(key)) values.set(key, { value: v, projects: [] });
          values.get(key).projects.push({ id: p.id, name: p.name });
        }
        if (!values.size) continue;
        const candidates = [...values.values()];
        const base = { table, record: person.id, recordLabel: person.name, column, oldValue: null };
        if (candidates.length === 1) {
          propose({ ...base, action: "UPDATE", newValue: candidates[0].value, reason: `seule valeur saisie sur ses ${candidates[0].projects.length} projet(s)`, confidence: "HIGH", enriched: true, source: { type: "CRM_database", table: "projects", column: projectColumn, records: candidates[0].projects } });
        } else {
          skip({ ...base, action: "SKIPPED", reason: `${candidates.length} valeurs différentes sur ses projets : choix à valider`, confidence: "MEDIUM", candidates: candidates.map((c) => ({ value: c.value, projects: c.projects.length })) });
        }
      }
    }
  };
  fillFromProjects(engineers, { table: "engineers", idColumn: "engineerId", phoneColumn: "telephoneIngenieur", emailColumn: "emailIngenieur" });
  fillFromProjects(architects, { table: "architects", idColumn: "architectId", phoneColumn: "telephoneArchitecte", emailColumn: "emailArchitecte" });
  audit.engineers = { total: engineers.length, withPhone: engineers.filter((e) => clean(e.phone)).length, withEmail: engineers.filter((e) => clean(e.email)).length, withoutProject: engineers.filter((e) => !projects.some((p) => p.engineerId === e.id)).length };
  audit.architects = { total: architects.length, withPhone: architects.filter((e) => clean(e.phone)).length, withEmail: architects.filter((e) => clean(e.email)).length, withoutProject: architects.filter((e) => !projects.some((p) => p.architectId === e.id)).length };
  audit.companies = { total: companies.length, withoutProject: companies.filter((c) => !projects.some((p) => p.companyId === c.id)).length, note: "La table ne contient que le nom : ni adresse, ni téléphone, ni matricule fiscal, ni secteur." };

  // 7. Clients (import comptable) ↔ contacts ↔ sociétés
  const clientTax = new Map(clients.filter((c) => clean(c.matriculeFiscal)).map((c) => [clean(c.matriculeFiscal).toUpperCase().replace(/[^A-Z0-9]/g, ""), c]));
  let contactsMatchingClient = 0;
  for (const c of contacts) {
    const key = clean(c.matriculeFiscale).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (key.length >= 6 && clientTax.has(key)) contactsMatchingClient += 1;
  }
  const companyKeys = new Set(companies.map((c) => normalizeName(c.name)));
  audit.clients = {
    total: clients.length,
    withTaxId: clients.filter((c) => clean(c.matriculeFiscal)).length,
    alsoInCompanies: clients.filter((c) => companyKeys.has(normalizeName(c.name))).length,
    contactsSharingTaxId: contactsMatchingClient,
    note: "clients n'a aucune clé étrangère vers companies, projects ou commercial_contacts : les rapprochements ci-dessus sont possibles mais aucun lien n'existe dans le schéma.",
  };
  if (contactsMatchingClient) {
    plan.schemaProposals.push({ proposal: "Ajouter commercial_contacts.clientId (clé étrangère vers clients)", reason: `${contactsMatchingClient} contacts portent le matricule fiscal d'un client`, requiresDecision: true });
  }

  // 8. Contacts
  const cStats = { total: contacts.length };
  const cc = (fn) => contacts.filter(fn).length;
  cStats.withoutCompany = cc((c) => !clean(c.nomSociete));
  cStats.withoutEmail = cc((c) => !clean(c.email));
  cStats.invalidEmail = cc((c) => clean(c.email) && !EMAIL_RE.test(clean(c.email)));
  cStats.invalidPhone = cc((c) => !validTnPhone(c.telephone));
  cStats.placeholderName = cc((c) => !clean(c.name) || isPlaceholder(c.name) || tokensOf(c.name).every((t) => PLACEHOLDERS.has(t)));
  cStats.withoutTaxId = cc((c) => !clean(c.matriculeFiscale));
  cStats.commercialMissingUser = cc((c) => c.commercialId && !userIds.has(c.commercialId));
  cStats.commercialInactive = cc((c) => inactiveIds.has(c.commercialId));
  const commercialRoles = new Map(users.map((u) => [u.id, u.role]));
  cStats.assignedToNonCommercial = cc((c) => c.commercialId && !["commercial", "commercial_sedentaire"].includes(commercialRoles.get(c.commercialId)));
  cStats.byType = {};
  for (const c of contacts) cStats.byType[c.typeClient] = (cStats.byType[c.typeClient] || 0) + 1;
  cStats.byStatus = {};
  for (const c of contacts) cStats.byStatus[c.statut] = (cStats.byStatus[c.statut] || 0) + 1;
  audit.contacts = cStats;

  // 9. Actions, relances, produits
  const [pa] = await q(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE "actionTypeId" IS NULL)::int AS "withoutTypeId",
            COUNT(*) FILTER (WHERE NULLIF(TRIM(commentaire), '') IS NULL)::int AS "withoutComment",
            COUNT(*) FILTER (WHERE "dateAction" > NOW() + INTERVAL '366 days')::int AS "dateInFarFuture",
            COUNT(*) FILTER (WHERE "dateAction" < '2015-01-01')::int AS "dateBefore2015"
       FROM project_actions`
  );
  const legacyTypes = await q(`SELECT TRIM("typeAction_legacy"::text) AS type, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE "actionTypeId" IS NULL)::int AS unlinked FROM project_actions GROUP BY 1 ORDER BY 2 DESC`);
  const actionTypes = await q(`SELECT id, TRIM(name) AS name FROM project_action_types`);
  for (const t of legacyTypes) {
    if (!t.unlinked) continue;
    const r = resolve(t.type, actionTypes);
    const base = { table: "project_actions", record: `typeAction_legacy = « ${t.type} »`, column: "actionTypeId", oldValue: null, rows: t.unlinked, source: { type: "CRM_database", table: "project_actions", column: "typeAction_legacy", value: t.type } };
    if (r.status === "exact") propose({ ...base, action: "UPDATE", newValue: r.match.id, newValueLabel: r.match.name, reason: "type d'action identique à project_action_types.name", confidence: "HIGH" });
    else skip({ ...base, action: "SKIPPED", reason: r.status === "near" ? `proche de « ${r.match.name} » : à valider` : "aucun type d'action du même nom", confidence: r.status === "near" ? "MEDIUM" : "LOW" });
  }
  audit.projectActions = { ...pa, legacyTypes };

  const [ca] = await q(`SELECT COUNT(*)::int AS total, COUNT(DISTINCT "commercialContactId")::int AS contacts FROM commercial_contact_actions`);
  const caTypes = await q(`SELECT "typeAction"::text AS type, COUNT(*)::int AS n FROM commercial_contact_actions GROUP BY 1 ORDER BY 2 DESC`);
  const [rel] = await q(
    `SELECT COUNT(*)::int AS total, COUNT(DISTINCT "commercialContactId")::int AS contacts,
            COUNT(*) FILTER (WHERE "statutRelance" = 'planifiee' AND "dateRelance" < CURRENT_DATE)::int AS "plannedInThePast",
            COUNT(*) FILTER (WHERE "commercialId" IS NULL)::int AS "withoutCommercial"
       FROM commercial_contact_relances`
  );
  const relStatus = await q(`SELECT "statutRelance"::text AS status, COUNT(*)::int AS n FROM commercial_contact_relances GROUP BY 1 ORDER BY 2 DESC`);
  audit.contactActions = { ...ca, byType: caTypes, note: "Actions de CONTACT (commercial_contact_actions) — distinctes des actions de PROJET (project_actions)." };
  audit.relances = { ...rel, byStatus: relStatus };

  const products = await q(`SELECT TRIM(produit::text) AS product, COUNT(*)::int AS lines, COUNT(*) FILTER (WHERE qte IS NOT NULL AND qte::text <> '' AND qte::text <> '0')::int AS "withQuantity" FROM commercial_contact_products GROUP BY 1 ORDER BY 2 DESC`);
  const families = await q(`SELECT COALESCE("productFamily"::text, '(non renseigné)') AS family, COUNT(*)::int AS n FROM projects GROUP BY 1 ORDER BY 2 DESC`);
  audit.products = {
    contactProducts: products,
    projectFamilies: families,
    note: "Aucune table produits, devis chiffrés ni commandes : le produit est une valeur saisie sur un contact (commercial_contact_products) ou la famille d'un projet (projects.productFamily). Ni référence, ni prix.",
  };

  const [shells] = await q(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE NULLIF(TRIM("nomProjet"), '') IS NULL)::int AS empty FROM commercial_projects`);
  audit.commercialProjects = { ...shells, note: "Lignes créées avec chaque contact ; presque toutes sans nom de projet." };

  // 10. Production, services internes, volumétrie
  const machines = await q(`SELECT "typeMachine"::text AS type, statut::text AS statut, COUNT(*)::int AS n FROM machines GROUP BY 1, 2 ORDER BY 1, 2`);
  const [prod] = await q(`SELECT (SELECT COUNT(*)::int FROM por_promesh) AS promesh, (SELECT COUNT(*)::int FROM por_promesh WHERE "machineId" IS NULL) AS "promeshWithoutMachine", (SELECT COUNT(*)::int FROM por_promesh WHERE "productionM2" IS NULL) AS "promeshWithoutQuantity", (SELECT COUNT(*)::int FROM industrial_records WHERE module = 'probar') AS probar, (SELECT COUNT(*)::int FROM industrial_records WHERE module = 'probar' AND "quantiteProduite" IS NULL) AS "probarWithoutQuantity", (SELECT COUNT(*)::int FROM industrial_records WHERE module = 'probar' AND "machineId" IS NULL) AS "probarWithoutMachine"`);
  const [internal] = await q(`SELECT (SELECT COUNT(*)::int FROM hr_requests) AS "hrRequests", (SELECT COUNT(*)::int FROM maintenance_requests) AS "maintenanceRequests", (SELECT COUNT(*)::int FROM industrial_records WHERE module = 'maintenance') AS "maintenanceRecords", (SELECT COUNT(*)::int FROM archive_requests) AS "archiveRequests"`);
  audit.production = { machines, ...prod };
  audit.internalServices = { ...internal, note: "Aucune donnée d'achats, de logistique, d'informatique ni de tickets dans la base." };

  const [notif] = await q(`SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = 'notifications'`);
  const notifTypes = await q(`SELECT type::text AS type, COUNT(*)::bigint AS n FROM notifications GROUP BY 1 ORDER BY 2 DESC LIMIT 6`);
  const [notifSpan] = await q(`SELECT MIN("createdAt") AS first, MAX("createdAt") AS last, COUNT(DISTINCT "userId")::int AS users FROM notifications`);
  audit.volumeAnomalies = { notifications: { estimatedRows: Number(notif.estimate), byType: notifTypes.map((t) => ({ type: t.type, rows: Number(t.n) })), ...notifSpan, note: "Volume anormal pour 74 utilisateurs : à traiter avant tout branchement BI (aucune suppression proposée ici)." } };
  plan.schemaProposals.push({ proposal: "Créer une table de traçabilité (data_change_log : table, record, colonne, ancienne valeur, nouvelle valeur, source, raison, confiance, horodatage)", reason: "aucune table d'audit des modifications de données n'existe ; indispensable pour journaliser INSERT / UPDATE / MERGE / SKIPPED", requiresDecision: true });

  // 11. Scores de qualité par domaine (0–100) : moyenne de taux mesurés
  const rate = (ok, total) => (total ? ok / total : 1);
  const score = (rates) => Math.round((rates.reduce((s, r) => s + r, 0) / rates.length) * 100);
  const P = stats.total;
  const C = cStats.total;
  audit.qualityScores = {
    projects: {
      score: score([rate(P - stats.withoutCompanyLink, P), rate(P - stats.withoutStatus, P), rate(P - stats.withoutPipelineStage, P), rate(P - stats.withoutProductFamily, P), rate(P - stats.withoutCoordinates, P), rate(P - stats.withoutStartDate, P), rate(P - stats.ownerInactive, P)]),
      basis: "lien société, statut, étape, famille de produit, coordonnées, date de démarrage, propriétaire actif",
    },
    contacts: {
      score: score([rate(C - cStats.withoutCompany, C), rate(C - cStats.withoutEmail, C), rate(C - cStats.invalidPhone, C), rate(C - cStats.placeholderName, C), rate(C - audit.duplicates.contacts.count, C), rate(C - cStats.commercialInactive, C)]),
      basis: "société, e-mail, téléphone valide, nom réel, absence de doublon, commercial actif",
    },
    companies: { score: score([rate(companies.length - audit.duplicates.companies.count, companies.length), rate(companies.length - audit.companies.withoutProject, companies.length), 0, 0]), basis: "absence de doublon, liée à un projet, coordonnées (aucune colonne), identifiant fiscal (aucune colonne)" },
    engineers: { score: score([rate(engineers.length - audit.duplicates.engineers.count, engineers.length), rate(audit.engineers.withPhone, engineers.length), rate(audit.engineers.withEmail, engineers.length), rate(engineers.length - audit.engineers.withoutProject, engineers.length)]), basis: "absence de doublon, téléphone, e-mail, lié à un projet" },
    architects: { score: score([rate(architects.length - audit.duplicates.architects.count, architects.length), rate(audit.architects.withPhone, architects.length), rate(audit.architects.withEmail, architects.length), rate(architects.length - audit.architects.withoutProject, architects.length)]), basis: "absence de doublon, téléphone, e-mail, lié à un projet" },
    clients: { score: score([rate(audit.clients.withTaxId, clients.length), rate(clients.length - audit.duplicates.clients.count - audit.duplicates.clientsByTaxId.count, clients.length)]), basis: "matricule fiscal, absence de doublon" },
    projectActions: { score: score([rate(pa.total - pa.withoutTypeId, pa.total), rate(pa.total - pa.withoutComment, pa.total)]), basis: "type d'action lié, commentaire" },
    production: { score: score([rate(prod.promesh - prod.promeshWithoutMachine, prod.promesh), rate(prod.promesh - prod.promeshWithoutQuantity, prod.promesh), rate(prod.probar - prod.probarWithoutMachine, prod.probar), rate(prod.probar - prod.probarWithoutQuantity, prod.probar)]), basis: "machine liée et quantité renseignée, PROMESH et PROBAR" },
  };

  // 12. Synthèse du plan
  const tally = (list, key) => list.reduce((acc, x) => ((acc[x[key]] = (acc[x[key]] || 0) + (x.rows || 1)), acc), {});
  plan.summary = {
    toCreate: 0,
    toUpdate: plan.changes.reduce((s, c) => s + (c.rows || 1), 0),
    toMerge: 0,
    skipped: plan.skipped.reduce((s, c) => s + (c.rows || 1), 0),
    byConfidence: tally(plan.changes, "confidence"),
    byTable: tally(plan.changes, "table"),
    duplicateCandidates: Object.values(audit.duplicates).reduce((s, d) => s + d.count, 0),
    note: "Aucune création ni fusion proposée : créer une fiche ou fusionner deux doublons est une décision métier. Les doublons sont listés comme candidats.",
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "audit.json"), JSON.stringify(audit, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "dry-run.json"), JSON.stringify(plan, null, 2));

  console.log(`Audit en lecture seule terminé — ${crmTables.length} tables CRM analysées (${allTables.length} dans la base).`);
  console.log(`Scores : ${Object.entries(audit.qualityScores).map(([k, v]) => `${k} ${v.score}`).join(" · ")}`);
  console.log(`Plan à blanc : je modifierais ${plan.summary.toUpdate} valeur(s) (${JSON.stringify(plan.summary.byConfidence)}), je créerais 0 fiche, je fusionnerais 0 doublon, j'ignorerais ${plan.summary.skipped} cas.`);
  console.log(`Doublons candidats : ${plan.summary.duplicateCandidates}`);
  console.log(`Fichiers : ${path.relative(process.cwd(), OUT_DIR)}${path.sep}audit.json, dry-run.json`);
  await sequelize.close();
}

main().catch(async (err) => {
  console.error("Audit interrompu :", err.message);
  try {
    await sequelize.close();
  } catch (_e) {
    /* connexion déjà fermée */
  }
  process.exit(1);
});
