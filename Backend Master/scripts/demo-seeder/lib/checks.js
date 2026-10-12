"use strict";

// Contrôles AVANT écriture. Tout se fait en lecture : le schéma réel de la
// base de démonstration (colonnes, NOT NULL, énumérations, clés étrangères,
// index uniques) est lu puis confronté au plan. Les corps destinés aux
// services de production passent par les VRAIS validateurs du CRM.
//
// Deux niveaux : `violations` (l'injection est refusée) et `warnings`.

const { PROJECT_CREATOR_ROLES, PRODUCTION_ROLES } = require("./plan");

// Lignes que les services créent d'eux-mêmes en plus de la fiche demandée.
function serviceChildren(entry) {
  if (entry.table === "por_promesh") return { por_promesh_controles_qualite: (entry.values.controlesQualite || []).length, por_promesh_process_control: 4 };
  if (entry.table === "recuperable_fiches") return { recuperable_lignes: (entry.values.recuperables || []).length };
  return {};
}

async function loadSchema(q, tables) {
  const schema = {};
  const cols = await q(
    `SELECT table_name AS t, column_name AS c, is_nullable = 'NO' AS required, column_default IS NOT NULL OR is_identity = 'YES' AS has_default,
            data_type AS dt, udt_name AS udt, character_maximum_length AS len
       FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [tables]
  );
  for (const c of cols) ((schema[c.t] = schema[c.t] || { columns: {}, uniques: [], fks: [] }).columns[c.c] = c);
  const enums = {};
  for (const e of await q(`SELECT t.typname AS n, e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid`, [])) (enums[e.n] = enums[e.n] || []).push(e.v);
  for (const u of await q(
    `SELECT c.relname AS t, array_agg(a.attname::text ORDER BY k.ord) AS cols, pg_get_expr(i.indpred, i.indrelid) AS predicate
       FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
       JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
      WHERE i.indisunique AND NOT i.indisprimary AND c.relname = ANY($1)
      GROUP BY c.relname, i.indexrelid, i.indpred, i.indrelid`,
    [tables]
  )) {
    const key = u.cols.join(",");
    if (schema[u.t] && !u.predicate && !schema[u.t].uniques.some((x) => x.join(",") === key)) schema[u.t].uniques.push(u.cols);
  }
  for (const f of await q(
    `SELECT c.conrelid::regclass::text AS t, a.attname AS c, c.confrelid::regclass::text AS rt, af.attname AS rc
       FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
       JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = ANY (c.confkey)
      WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1`,
    []
  )) {
    const t = f.t.replace(/"/g, "");
    if (schema[t]) schema[t].fks.push({ column: f.c, table: f.rt.replace(/"/g, ""), key: f.rc });
  }
  return { schema, enums };
}

// Appelle un validateur Joi du CRM (un middleware Express) hors de toute requête.
function runValidator(middleware, body) {
  let outcome = { ok: false, errors: ["validateur sans réponse"] };
  const res = { status: () => ({ json: (payload) => (outcome = { ok: false, errors: payload.errors || [payload.message] }) }) };
  const req = { body: JSON.parse(JSON.stringify(body)) };
  middleware(req, res, () => (outcome = { ok: true, value: req.body }));
  return outcome;
}

async function checkPlan({ plan, config, q, validators, ficheRules }) {
  const violations = [];
  const warnings = [];
  const fail = (entry, message) => violations.push({ table: entry.table, key: entry.key, id: entry.id, message });

  const modelEntries = plan.entries.filter((e) => e.via === "model");
  const serviceEntries = plan.entries.filter((e) => e.via === "service");
  const tables = [...new Set(plan.entries.map((e) => e.table))];
  const { schema, enums } = await loadSchema(q, [...tables, "por_promesh_controles_qualite", "por_promesh_process_control", "recuperable_lignes", "data_change_log"]);

  // ── Identifiants planifiés, et ce qui existe déjà en base ────────────────
  const planned = new Map(); // table → Set(id)
  for (const e of plan.entries) if (e.id != null) (planned.get(e.table) || planned.set(e.table, new Set()).get(e.table)).add(String(e.id));
  const existing = new Map(); // table → Set(id)
  const preexistingRows = {};
  for (const table of tables) {
    if (!schema[table]) {
      violations.push({ table, message: "table absente de la base" });
      continue;
    }
    const ids = [...(planned.get(table) || [])];
    const found = ids.length ? await q(`SELECT id::text AS id FROM "${table}" WHERE id::text = ANY($1)`, [ids]) : [];
    existing.set(table, new Set(found.map((r) => r.id)));
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM "${table}"`, []);
    preexistingRows[table] = n;
  }
  const isReplay = (e) => e.id != null && existing.get(e.table) && existing.get(e.table).has(String(e.id));

  // ── Lignes créées par les modèles : confrontation au schéma réel ─────────
  const uniqueSeen = new Map();
  for (const e of modelEntries) {
    const def = schema[e.table];
    if (!def) continue;
    const values = { id: e.id, ...e.values };
    if (e.meta.needsPasswordHash) values.passwordHash = "<calculé à l'exécution>";
    for (const [column, value] of Object.entries(values)) {
      const col = def.columns[column];
      if (!col) {
        fail(e, `colonne inconnue : ${column}`);
        continue;
      }
      if (value == null) continue;
      if (col.dt === "USER-DEFINED" && enums[col.udt] && !enums[col.udt].includes(String(value))) fail(e, `valeur « ${value} » inconnue pour ${column} (${enums[col.udt].join(", ")})`);
      if (col.len && typeof value === "string" && value.length > col.len) fail(e, `${column} dépasse ${col.len} caractères`);
    }
    for (const [column, col] of Object.entries(def.columns)) {
      if (col.required && !col.has_default && values[column] == null) fail(e, `champ obligatoire absent : ${column}`);
    }
    for (const fk of def.fks) {
      const value = values[fk.column];
      if (value == null) continue;
      const inPlan = planned.get(fk.table) && planned.get(fk.table).has(String(value));
      if (inPlan) continue;
      const rows = await q(`SELECT 1 FROM "${fk.table}" WHERE "${fk.key}"::text = $1 LIMIT 1`, [String(value)]);
      if (!rows.length) fail(e, `relation invalide : ${fk.column} → ${fk.table} (${value}) introuvable`);
    }
    for (const cols of def.uniques) {
      if (cols.some((c) => values[c] == null)) continue;
      const tuple = `${e.table}|${cols.join(",")}|${cols.map((c) => String(values[c]).toLowerCase()).join("¦")}`;
      if (uniqueSeen.has(tuple)) fail(e, `doublon dans le plan sur (${cols.join(", ")}) avec ${uniqueSeen.get(tuple)}`);
      uniqueSeen.set(tuple, e.key);
      const where = cols.map((c, i) => `"${c}"::text = $${i + 1}`).join(" AND ");
      const rows = await q(`SELECT id::text AS id FROM "${e.table}" WHERE ${where}`, cols.map((c) => String(values[c])));
      const clash = rows.find((r) => r.id !== String(e.id));
      if (clash) fail(e, `conflit de clé unique sur (${cols.join(", ")}) avec une ligne existante (${clash.id})`);
    }
  }

  // ── Règles métier des routes, reproduites ────────────────────────────────
  const userById = new Map(modelEntries.filter((e) => e.table === "users").map((e) => [e.id, e.values]));
  const domain = `@${config.identity.emailDomain}`;
  // Les comptes de connexion (et leur adresse recopiée sur les relances) ont leur propre domaine.
  const accountDomain = `@${config.identity.accountEmailDomain || config.identity.emailDomain}`;
  const projectNames = new Map();
  for (const e of modelEntries) {
    const v = e.values;
    if (e.table === "users" && !String(v.email).endsWith(accountDomain)) fail(e, `adresse hors du domaine de démonstration : ${v.email}`);
    if (e.table === "projects") {
      const owner = userById.get(v.ownerId);
      if (!owner || !PROJECT_CREATOR_ROLES.includes(owner.role)) fail(e, `le rôle « ${owner && owner.role} » ne peut pas créer de projet`);
      const key = `${v.ownerId}|${String(v.nomProjet).toLowerCase().trim()}`;
      if (projectNames.has(key)) fail(e, "nom de projet déjà utilisé par ce propriétaire (la route répond 409)");
      projectNames.set(key, e.key);
      if (v.montantMarche != null && v.projectModele === "project") fail(e, "montant posé sur un projet de modèle « project » (la route ne le fait pas)");
    }
    if (e.table === "commercial_contacts") {
      for (const field of ["nom", "prenom", "telephone"]) if (!v[field]) fail(e, `${field} obligatoire`);
      const assignee = v.commercialId ? userById.get(v.commercialId) : null;
      if (v.commercialId && (!assignee || assignee.role !== "commercial")) fail(e, "un contact ne s'affecte qu'à un utilisateur de rôle commercial");
    }
    if (e.table === "commercial_contact_relances" && !v.dateRelance) fail(e, "dateRelance obligatoire");
    for (const column of ["email", "emailIngenieur", "emailArchitecte", "revendeurEmail"]) {
      if (e.table !== "users" && v[column] && !String(v[column]).endsWith(domain)) fail(e, `${column} hors du domaine de démonstration`);
    }
    if (v.commercialEmail && !String(v.commercialEmail).endsWith(accountDomain)) fail(e, "commercialEmail hors du domaine des comptes de démonstration");
  }
  // Un nom de projet déjà pris en base par le même propriétaire (hors rejeu).
  const takenNames = await q(`SELECT p.id::text AS id, p."ownerId"::text AS owner, lower(trim(p."nomProjet")) AS name FROM projects p`, []);
  for (const row of takenNames) {
    const key = `${row.owner}|${row.name}`;
    const entry = modelEntries.find((e) => e.table === "projects" && projectNames.get(key) === e.key);
    if (entry && entry.id !== row.id) fail(entry, "nom de projet déjà pris en base par ce propriétaire");
  }

  // ── Fiches de production : vrais validateurs et règles du CRM ────────────
  const machines = await q(`SELECT id::text AS id, code, "typeMachine"::text AS type, numero, statut::text AS statut FROM machines`, []);
  const today = ficheRules.businessDateTime().date;
  const combos = new Set();
  for (const e of serviceEntries) {
    const body = e.values;
    if (!PRODUCTION_ROLES.includes(e.meta.actor.role)) fail(e, `le rôle « ${e.meta.actor.role} » ne peut pas créer de fiche de production`);
    const machine = machines.find((m) => m.id === e.meta.machineId);
    if (!machine) fail(e, "machine absente du référentiel");
    else if (machine.statut !== "ACTIVE") fail(e, `machine ${machine.code} non active`);
    const validator = { por_promesh: validators.promesh, industrial_records: validators.industrial, recuperable_fiches: validators.recuperable }[e.table];
    const result = runValidator(validator, body);
    if (!result.ok) fail(e, `refusé par le validateur du CRM : ${result.errors.join(" ; ")}`);
    const date = body.dateProduction || body.dateFiche || body.date;
    if (date > today) fail(e, "date dans le futur");
    if (date < config.period.from || date > config.period.to) fail(e, "date hors de la période configurée");
    if (e.table === "por_promesh" || e.table === "industrial_records") {
      const hours = e.table === "por_promesh" ? { heureDebut: body.heureDebut, heureFin: body.heureFin } : (({ hd, hf }) => ({ heureDebut: hd, heureFin: hf }))(JSON.parse(body.description));
      // Règle de validation du lot Production, appliquée aux fiches à valider.
      const errors = ficheRules.validateFicheTimes({ date, poste: body.poste, ...hours });
      if (e.meta.validate && errors.length) fail(e, `validation refusée : ${errors.join(" ; ")}`);
      const qty = e.table === "por_promesh" ? body.productionM2 : body.quantiteProduite;
      if (qty != null && qty < 0) fail(e, "quantité négative");
    }
    if (e.table === "recuperable_fiches") {
      if (combos.has(e.meta.naturalKey)) fail(e, "combinaison module / machine / ligne / poste / date en double dans le plan");
      combos.add(e.meta.naturalKey);
      const diametres = body.recuperables.map((x) => x.diametre);
      if (new Set(diametres).size !== diametres.length) fail(e, "diamètre en double dans la fiche");
    }
  }
  const takenCombos = await q(`SELECT module::text || '|' || machine || '|' || ligne::text || '|' || poste::text || '|' || date::text AS k FROM recuperable_fiches`, []);
  const existingCombos = new Set(takenCombos.map((r) => r.k));

  // ── Volumes ───────────────────────────────────────────────────────────────
  const byTable = {};
  const bump = (table, field, n = 1) => ((byTable[table] = byTable[table] || { planned: 0, toCreate: 0, alreadyPresent: 0, via: "" })[field] += n);
  for (const e of plan.entries) {
    const replay = isReplay(e) || (e.table === "recuperable_fiches" && existingCombos.has(e.meta.naturalKey));
    bump(e.table, "planned");
    bump(e.table, replay ? "alreadyPresent" : "toCreate");
    byTable[e.table].via = e.via === "service" ? e.meta.service : "modèle Sequelize";
    for (const [child, n] of Object.entries(e.via === "service" ? serviceChildren(e) : {})) {
      bump(child, "planned", n);
      bump(child, replay ? "alreadyPresent" : "toCreate", n);
      byTable[child].via = "créée par le service de la fiche";
    }
  }
  const total = Object.values(byTable).reduce((s, t) => s + t.planned, 0);
  for (const [table, t] of Object.entries(byTable)) {
    if (t.planned > config.limits.maxRowsPerTable) violations.push({ table, message: `${t.planned} lignes : dépasse la limite par table (${config.limits.maxRowsPerTable})` });
    t.preexisting = preexistingRows[table] != null ? preexistingRows[table] : null;
  }
  if (total > config.limits.maxTotalRows) violations.push({ table: "*", message: `${total} lignes : dépasse la limite totale (${config.limits.maxTotalRows})` });

  // ── Relations qui seront créées ───────────────────────────────────────────
  const relations = {};
  for (const e of modelEntries) {
    for (const fk of (schema[e.table] || { fks: [] }).fks) {
      if (e.values[fk.column] != null) relations[`${e.table}.${fk.column} → ${fk.table}`] = (relations[`${e.table}.${fk.column} → ${fk.table}`] || 0) + 1;
    }
  }
  // Liens déclarés par les modèles mais sans clé étrangère en base.
  for (const [table, column, target] of [["projects", "companyId", "companies"], ["projects", "engineerId", "engineers"], ["projects", "architectId", "architects"]]) {
    const rows = modelEntries.filter((e) => e.table === table && e.values[column] != null);
    const broken = rows.filter((e) => !(planned.get(target) && planned.get(target).has(String(e.values[column]))));
    if (rows.length) relations[`${table}.${column} → ${target} (sans clé étrangère en base, vérifiée par le plan)`] = rows.length;
    for (const e of broken) fail(e, `relation invalide : ${column} → ${target}`);
  }
  for (const e of serviceEntries) relations[`${e.table}.machineId → machines`] = (relations[`${e.table}.machineId → machines`] || 0) + 1;

  // ── Risques de doublons signalés (sans blocage) ───────────────────────────
  const shifts = {};
  for (const e of serviceEntries.filter((x) => x.table !== "recuperable_fiches")) {
    const k = `${e.table}|${e.meta.machineCode}|${e.values.dateProduction || e.values.dateFiche}|${e.values.poste}`;
    shifts[k] = (shifts[k] || 0) + 1;
  }
  const multi = Object.entries(shifts).filter(([, n]) => n > 1);
  if (multi.length) warnings.push(`${multi.length} couple(s) machine / date / poste portent plusieurs fiches : fonctionnement métier valide, aucune règle d'unicité appliquée.`);
  const replays = Object.values(byTable).reduce((s, t) => s + t.alreadyPresent, 0);
  if (replays) warnings.push(`${replays} ligne(s) du plan existent déjà dans la base : elles seront ignorées (rejeu sans doublon).`);
  if (!schema.data_change_log) violations.push({ table: "data_change_log", message: "table de traçabilité absente" });

  return { violations, warnings, byTable, total, relations, missingFields: violations.filter((v) => /obligatoire/.test(v.message)), uniqueConflicts: violations.filter((v) => /clé unique|doublon/.test(v.message)) };
}

module.exports = { checkPlan, runValidator, serviceChildren };
