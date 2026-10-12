"use strict";

// Agent d'alimentation de la base de démonstration (scripts/demo-seeder).
//
// Ces tests ÉCRIVENT réellement, mais uniquement dans une base jetable,
// `cbigestionnairepfe_demo_test`, recréée ici à partir de la base de
// démonstration vide (structure + référentiels). Ni la base réelle ni la base
// de démonstration ne reçoivent d'écriture.

const path = require("path");
const { spawnSync } = require("child_process");

const target = require("../scripts/demo-seeder/lib/target");
const { buildPlan } = require("../scripts/demo-seeder/lib/plan");
const { checkPlan } = require("../scripts/demo-seeder/lib/checks");
const { executeBatch, batchIdOf, DATA_STATUS_TABLES } = require("../scripts/demo-seeder/lib/runner");
const { deleteBatch, loadRegistry, ensureDeleteTraceability } = require("../scripts/demo-seeder/lib/deleter");

jest.setTimeout(240000);

// Mouchard réseau : toute connexion sortante ouverte par ce processus pendant
// les tests (chargement du CRM, injection, suppression) est enregistrée.
const net = require("net");
const outbound = [];
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function recordedConnect(...args) {
  let options = args[0];
  if (Array.isArray(options)) options = options[0];
  if (options && typeof options === "object") outbound.push({ host: String(options.host || options.path || "localhost"), port: Number(options.port) || null });
  else outbound.push({ host: String(args[1] || "localhost"), port: Number(options) || null });
  return originalConnect.apply(this, args);
};

const TEST_DB = target.DEMO_TEST_DATABASE;
const PG_BIN = process.env.PG_BIN || (process.platform === "win32" ? "C:\\Program Files\\PostgreSQL\\17\\bin" : "");
const bin = (name) => (PG_BIN ? path.join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name) : name);

// Petit lot : mêmes règles que le lot réel, volumes réduits.
function testConfig() {
  const config = target.loadConfig();
  config.target.database = TEST_DB;
  config.batch = { name: "jest", seed: 4242 };
  config.volumes = { commerciaux: 3, commerciauxSedentaires: 1, responsablesProduction: 1, administrateurs: 1, societes: 5, ingenieurs: 4, architectes: 2, clients: 5, projets: 8, actionsProjet: 20, contacts: 10, relances: 8, fichesPromesh: 6, fichesProbar: 5, fichesDechets: 3 };
  return config;
}

let config;
let crm;
let plan;
let batchId;
const PRE_USER = "11111111-1111-4111-8111-111111111111";
const PRE_COMPANY = "22222222-2222-4222-8222-222222222222";
const PRE_FICHE = "33333333-3333-4333-8333-333333333333";

const rows = (sql, replacements) => crm.sequelize.query(sql, { replacements, type: "SELECT" });
const scalar = async (sql, replacements) => Object.values((await rows(sql, replacements))[0])[0];
const countOf = (table) => scalar(`SELECT COUNT(*)::int FROM "${table}"`);
const plannedCount = (table) => plan.entries.filter((e) => e.table === table).length;
// Empreinte du contenu des lignes présentes AVANT le lot.
const preexistingFingerprint = () =>
  scalar(
    `SELECT md5(
       (SELECT COALESCE(string_agg(to_jsonb(t)::text, '' ORDER BY id::text), '') FROM users t WHERE id = :user) ||
       (SELECT COALESCE(string_agg(to_jsonb(t)::text, '' ORDER BY id::text), '') FROM companies t WHERE id = :company) ||
       (SELECT COALESCE(string_agg(to_jsonb(t)::text, '' ORDER BY id::text), '') FROM por_promesh t WHERE id = :fiche) ||
       (SELECT COALESCE(string_agg(to_jsonb(t)::text, '' ORDER BY id::text), '') FROM machines t) ||
       (SELECT COALESCE(string_agg(to_jsonb(t)::text, '' ORDER BY id::text), '') FROM pipeline_stages t) ||
       (SELECT COALESCE(string_agg(to_jsonb(t)::text, '' ORDER BY id::text), '') FROM project_action_types t) ||
       (SELECT COALESCE(string_agg(to_jsonb(t)::text, '' ORDER BY id::text), '') FROM product_families t))`,
    { user: PRE_USER, company: PRE_COMPANY, fiche: PRE_FICHE }
  );

beforeAll(async () => {
  config = testConfig();
  const password = target.resolvePassword(config);
  const base = ["-h", config.target.host, "-p", String(config.target.port), "-U", config.target.user];
  const env = { ...process.env, PGPASSWORD: password };
  // Base jetable : supprimée puis recréée à partir de la base de démonstration vide.
  spawnSync(bin("dropdb"), [...base, "--if-exists", TEST_DB], { env });
  const created = spawnSync(bin("createdb"), [...base, "-T", target.DEMO_DATABASE, TEST_DB], { env, encoding: "utf8" });
  if (created.status !== 0) throw new Error(`création de ${TEST_DB} impossible : ${created.stderr}`);

  crm = await require("../scripts/demo-seeder/lib/crm").openCrm(config);
  // La base de démonstration de départ doit être vide de toute donnée métier.
  for (const table of ["users", "projects", "commercial_contacts", "por_promesh", "data_change_log"]) expect(await countOf(table)).toBe(0);

  // Données « préexistantes », étrangères au lot : elles ne doivent jamais bouger.
  await crm.sequelize.query(`INSERT INTO users (id, email, "passwordHash", "isActive", role, "createdAt", "updatedAt") VALUES (:id, 'preexistant@demo.invalid', 'x', true, 'admin', NOW(), NOW())`, { replacements: { id: PRE_USER } });
  await crm.sequelize.query(`INSERT INTO companies (id, name, "createdAt", "updatedAt") VALUES (:id, 'PREEXISTANTE', NOW(), NOW())`, { replacements: { id: PRE_COMPANY } });
  await crm.sequelize.query(
    `INSERT INTO por_promesh (id, "dateProduction", "heureDebut", "heureFin", machine, "machineId", poste, operateur, "createdBy", "createdAt", "updatedAt")
     SELECT :id, '2026-03-01', '08:00', '12:00', '1', m.id, 'matin', 'préexistant', :user, NOW(), NOW() FROM machines m WHERE m.code = 'PROMESH-01'`,
    { replacements: { id: PRE_FICHE, user: PRE_USER } }
  );
  plan = buildPlan(config, crm.refs);
  batchId = batchIdOf(config);
});

afterAll(async () => {
  if (crm) await crm.sequelize.close();
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Interdiction d'écrire ailleurs que dans la base de démonstration", () => {
  const fakeSequelize = (database, calls = []) => ({
    calls,
    query: jest.fn(async (sql) => {
      calls.push(sql);
      return [[{ database, username: "postgres", host: "127.0.0.1", port: 5432 }]];
    }),
    transaction: jest.fn(async () => {
      throw new Error("une transaction a été ouverte");
    }),
  });

  test.each(["cbigestionnairepfe", "cbigestionnairepfe_test", "cbigestionnairepfe_mig_test", "postgres", "cbigestionnairepfe_demo2", "CBIGESTIONNAIREPFE_DEMO", "", null])("nom de base refusé : %s", (name) => {
    expect(() => target.assertDemoName(name)).toThrow(/Base cible refusée/);
  });

  test("seule la base de démonstration est acceptée (et la base jetable, uniquement sous Jest)", () => {
    expect(() => target.assertDemoName("cbigestionnairepfe_demo")).not.toThrow();
    expect(target.allowedDatabases()).toEqual(["cbigestionnairepfe_demo", TEST_DB]);
    const worker = process.env.JEST_WORKER_ID;
    delete process.env.JEST_WORKER_ID;
    try {
      expect(target.allowedDatabases()).toEqual(["cbigestionnairepfe_demo"]);
      expect(() => target.assertDemoName(TEST_DB)).toThrow(/Base cible refusée/);
    } finally {
      process.env.JEST_WORKER_ID = worker;
    }
  });

  test("une configuration visant la base réelle est refusée au chargement", () => {
    const fs = require("fs");
    const os = require("os");
    const file = path.join(os.tmpdir(), `demo-config-${Date.now()}.json`);
    const bad = target.loadConfig();
    bad.target.database = "cbigestionnairepfe";
    fs.writeFileSync(file, JSON.stringify(bad));
    try {
      expect(() => target.loadConfig(file)).toThrow(/Base cible refusée/);
    } finally {
      fs.unlinkSync(file);
    }
  });

  test("une connexion ouverte sur la base réelle est refusée, quelle que soit la configuration", async () => {
    await expect(target.assertConnectedToDemo(fakeSequelize("cbigestionnairepfe"))).rejects.toThrow(/ÉCRITURE REFUSÉE/);
    await expect(target.assertConnectedToDemo(fakeSequelize("cbigestionnairepfe_mig_test"))).rejects.toThrow(/ÉCRITURE REFUSÉE/);
  });

  test("l'injection s'arrête avant toute écriture si la connexion vise la base réelle", async () => {
    const sequelize = fakeSequelize("cbigestionnairepfe");
    const create = jest.fn();
    const fakeCrm = { sequelize, modelByTable: new Map([["users", { findByPk: create, create }]]), services: {} };
    await expect(executeBatch({ config, plan, crm: fakeCrm })).rejects.toThrow(/ÉCRITURE REFUSÉE/);
    expect(create).not.toHaveBeenCalled();
    expect(sequelize.transaction).not.toHaveBeenCalled();
    expect(sequelize.calls.every((sql) => /^SELECT current_database/.test(sql))).toBe(true);
  });

  test("la suppression d'un lot et la modification du journal sont refusées de même", async () => {
    const sequelize = fakeSequelize("cbigestionnairepfe");
    await expect(deleteBatch({ sequelize, batchId: "x" })).rejects.toThrow(/ÉCRITURE REFUSÉE/);
    await expect(ensureDeleteTraceability(sequelize)).rejects.toThrow(/ÉCRITURE REFUSÉE/);
    expect(sequelize.calls.every((sql) => /^SELECT current_database/.test(sql))).toBe(true);
  });

  test("le processus de test est bien branché sur la base jetable", async () => {
    expect(await scalar("SELECT current_database()")).toBe(TEST_DB);
    expect(process.env.DB_NAME).toBe(TEST_DB);
    expect(process.env.AUTO_EMAIL_JOBS_ENABLED).toBe("false");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Plan et simulation", () => {
  test("le plan est déterministe : même graine, même configuration, mêmes lignes et mêmes identifiants", () => {
    const again = buildPlan(testConfig(), crm.refs);
    expect(JSON.stringify(again.entries)).toBe(JSON.stringify(plan.entries));
  });

  test("une autre graine donne un autre plan", () => {
    const other = testConfig();
    other.batch.seed = 4243;
    expect(JSON.stringify(buildPlan(other, crm.refs).entries)).not.toBe(JSON.stringify(plan.entries));
  });

  test("identités clairement fictives : domaine .invalid, préfixe DEMO, téléphones à l'indicatif inexistant", () => {
    const users = plan.entries.filter((e) => e.table === "users");
    expect(users.every((e) => e.values.email.endsWith("@cbi_tunisia.com"))).toBe(true);
    expect(plan.entries.filter((e) => e.table === "companies").every((e) => e.values.name.startsWith("DEMO "))).toBe(true);
    expect(plan.entries.filter((e) => e.table === "commercial_contacts").every((e) => e.values.telephone.startsWith("+216 00 "))).toBe(true);
    expect(new Set(users.map((e) => e.values.role))).toEqual(new Set(["commercial", "commercial_sedentaire", "responsable_logistique_achat", "admin"]));
  });

  test("aucun mot de passe ni empreinte dans le plan", () => {
    expect(JSON.stringify(plan)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  test("les horaires de poste sont déclarés comme simulés", () => {
    expect(config.simulation.postes.note).toMatch(/SIMULÉS/);
    expect(config.simulation.provenance).toMatch(/SIMULATION/);
    const fiche = plan.entries.find((e) => e.table === "por_promesh");
    expect(fiche.values.observationsGenerales).toBe(config.simulation.provenance);
  });

  test("la simulation ne signale aucune violation et n'écrit rien", async () => {
    const before = await countOf("data_change_log");
    const checks = await checkPlan({ plan, config, q: crm.q, validators: crm.validators, ficheRules: crm.ficheRules });
    expect(checks.violations).toEqual([]);
    expect(await countOf("data_change_log")).toBe(before);
    expect(await countOf("projects")).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Injection, arrêt et reprise", () => {
  let fingerprintBefore;

  test("arrêt sur erreur : l'étape fautive est annulée en entier, les précédentes restent, l'échec est journalisé", async () => {
    fingerprintBefore = await preexistingFingerprint();
    const actions = plan.entries.filter((e) => e.table === "project_actions");
    const report = await executeBatch({ config, plan, crm, options: { failAt: (e) => e === actions[5] } });

    expect(report.completed).toBe(false);
    expect(report.stoppedAt).toBe("actions de projet");
    expect(report.error).toMatch(/échec simulé/);
    // Étapes précédentes : validées.
    expect(await countOf("projects")).toBe(plannedCount("projects"));
    expect(await countOf("companies")).toBe(plannedCount("companies") + 1);
    // Étape fautive : aucune ligne, pas même les 5 premières.
    expect(await countOf("project_actions")).toBe(0);
    expect(await scalar(`SELECT COUNT(*)::int FROM data_change_log WHERE batch_id = :b AND table_name = 'project_actions' AND operation = 'INSERT'`, { b: batchId })).toBe(0);
    // Étapes suivantes : non commencées.
    expect(await countOf("commercial_contacts")).toBe(0);
    expect(await countOf("por_promesh")).toBe(1);
    // L'échec est tracé.
    expect(await scalar(`SELECT COUNT(*)::int FROM data_change_log WHERE batch_id = :b AND operation = 'SKIPPED' AND reason LIKE '%actions de projet%'`, { b: batchId })).toBe(1);
  });

  test("reprise, puis arrêt en cours d'étape de production : les fiches déjà créées restent et sont au registre", async () => {
    const fiches = plan.entries.filter((e) => e.table === "por_promesh");
    const report = await executeBatch({ config, plan, crm, options: { failAt: (e) => e === fiches[2] } });
    expect(report.stoppedAt).toBe("fiches PROMESH");
    const done = Object.fromEntries(report.steps.map((s) => [s.step, s]));
    // Les étapes déjà faites ne recréent rien ; l'étape annulée est refaite en entier.
    expect(done.projets.created).toBe(0);
    expect(done.projets.alreadyPresent).toBe(plannedCount("projects") + plannedCount("user_projects"));
    expect(done["actions de projet"].created).toBe(plannedCount("project_actions"));
    expect(done.contacts.error).toBeUndefined();
    // Production : chaque fiche a sa propre transaction — les 2 premières restent.
    expect(await countOf("por_promesh")).toBe(1 + 2);
    expect(await scalar(`SELECT COUNT(*)::int FROM data_change_log WHERE batch_id = :b AND table_name = 'por_promesh' AND operation = 'INSERT'`, { b: batchId })).toBe(2);
    expect(await scalar(`SELECT COUNT(*)::int FROM por_promesh WHERE id <> :pre AND "dataStatus" <> 'TEST'`, { pre: PRE_FICHE })).toBe(0);
    expect(await countOf("industrial_records")).toBe(0);
  });

  test("seconde reprise : le lot se termine, sans doublon et avec tous les contrôles d'étape au vert", async () => {
    const report = await executeBatch({ config, plan, crm });
    expect(report.error).toBeNull();
    expect(report.completed).toBe(true);
    const done = Object.fromEntries(report.steps.map((s) => [s.step, s]));
    expect(done["fiches PROMESH"].alreadyPresent).toBe(2);
    expect(done["fiches PROMESH"].created).toBe(plannedCount("por_promesh") - 2);
    expect(report.steps.every((s) => s.controls && s.controls.every((c) => c.ok))).toBe(true);
  });

  test("un second lot aux mêmes identités est refusé par la simulation (conflit de clé unique), sans rien écrire", async () => {
    const other = testConfig();
    other.batch = { name: "jest-autre-lot", seed: 99 };
    const before = await countOf("users");
    const checks = await checkPlan({ plan: buildPlan(other, crm.refs), config: other, q: crm.q, validators: crm.validators, ficheRules: crm.ficheRules });
    expect(checks.uniqueConflicts.length).toBeGreaterThan(0);
    expect(checks.violations.some((v) => v.table === "users" && /clé unique/.test(v.message))).toBe(true);
    expect(await countOf("users")).toBe(before);
  });

  test("volumes : chaque table contient exactement les lignes prévues", async () => {
    for (const table of ["user_profiles", "engineers", "architects", "clients", "projects", "user_projects", "project_actions", "commercial_contacts", "commercial_contact_status_histories", "commercial_contact_products", "commercial_projects", "commercial_contact_actions", "commercial_contact_relances", "industrial_records", "recuperable_fiches"]) {
      expect([table, await countOf(table)]).toEqual([table, plannedCount(table)]);
    }
    expect(await countOf("users")).toBe(plannedCount("users") + 1);
    expect(await countOf("companies")).toBe(plannedCount("companies") + 1);
    expect(await countOf("por_promesh")).toBe(plannedCount("por_promesh") + 1);
    const lignes = plan.entries.filter((e) => e.table === "recuperable_fiches").reduce((s, e) => s + e.values.recuperables.length, 0);
    expect(await countOf("recuperable_lignes")).toBe(lignes);
    expect(await countOf("por_promesh_controles_qualite")).toBe(plannedCount("por_promesh") * 2);
  });

  test("relations : aucune référence orpheline", async () => {
    const orphans = await rows(
      `SELECT 'projet sans propriétaire' AS k, COUNT(*)::int AS n FROM projects p WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p."ownerId")
       UNION ALL SELECT 'projet sans étape', COUNT(*)::int FROM projects p WHERE NOT EXISTS (SELECT 1 FROM pipeline_stages s WHERE s.id = p."pipelineStageId")
       UNION ALL SELECT 'société de projet inconnue', COUNT(*)::int FROM projects p WHERE p."companyId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = p."companyId")
       UNION ALL SELECT 'ingénieur de projet inconnu', COUNT(*)::int FROM projects p WHERE p."engineerId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engineers c WHERE c.id = p."engineerId")
       UNION ALL SELECT 'architecte de projet inconnu', COUNT(*)::int FROM projects p WHERE p."architectId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM architects c WHERE c.id = p."architectId")
       UNION ALL SELECT 'projet sans lien propriétaire', COUNT(*)::int FROM projects p WHERE NOT EXISTS (SELECT 1 FROM user_projects up WHERE up."projectId" = p.id AND up."userId" = p."ownerId" AND up.permission = 'owner')
       UNION ALL SELECT 'action sans projet', COUNT(*)::int FROM project_actions a WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = a."projectId")
       UNION ALL SELECT 'action sans type', COUNT(*)::int FROM project_actions a WHERE NOT EXISTS (SELECT 1 FROM project_action_types t WHERE t.id = a."actionTypeId" AND t.name = a."typeAction_legacy")
       UNION ALL SELECT 'action créée par un autre que le propriétaire', COUNT(*)::int FROM project_actions a JOIN projects p ON p.id = a."projectId" WHERE a."createdBy" <> p."ownerId"
       UNION ALL SELECT 'contact sans créateur', COUNT(*)::int FROM commercial_contacts c WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c."createdBy")
       UNION ALL SELECT 'contact affecté à un non-commercial', COUNT(*)::int FROM commercial_contacts c JOIN users u ON u.id = c."commercialId" WHERE u.role <> 'commercial'
       UNION ALL SELECT 'relance sans contact', COUNT(*)::int FROM commercial_contact_relances r WHERE NOT EXISTS (SELECT 1 FROM commercial_contacts c WHERE c.id = r."commercialContactId")
       UNION ALL SELECT 'relance dont le commercial n''est pas celui du contact', COUNT(*)::int FROM commercial_contact_relances r JOIN commercial_contacts c ON c.id = r."commercialContactId" WHERE r."commercialId" IS DISTINCT FROM c."commercialId"
       UNION ALL SELECT 'fiche PROMESH sans machine PROMESH', COUNT(*)::int FROM por_promesh f WHERE NOT EXISTS (SELECT 1 FROM machines m WHERE m.id = f."machineId" AND m."typeMachine" = 'PROMESH')
       UNION ALL SELECT 'fiche PROBAR sans machine PROBAR', COUNT(*)::int FROM industrial_records f WHERE NOT EXISTS (SELECT 1 FROM machines m WHERE m.id = f."machineId" AND m."typeMachine" = 'PROBAR')
       UNION ALL SELECT 'fiche de déchets sans machine', COUNT(*)::int FROM recuperable_fiches f WHERE NOT EXISTS (SELECT 1 FROM machines m WHERE m.id = f."machineId")`
    );
    expect(orphans.filter((o) => o.n > 0)).toEqual([]);
  });

  test("contacts : les quatre lignes automatiques de la route sont reproduites", async () => {
    const stats = (await rows(
      `SELECT COUNT(*)::int AS contacts,
              COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM commercial_contact_status_histories h WHERE h."commercialContactId" = c.id AND h.type = 'CREATED' AND h."nouveauStatut" = c.statut::text) = 1)::int AS historique,
              COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM commercial_contact_products p WHERE p."commercialContactId" = c.id) = 1)::int AS produit,
              COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM commercial_contact_actions a WHERE a."commercialContactId" = c.id AND a.statut = 'Terminé' AND a.commentaire = 'Création du contact') = 1)::int AS action
         FROM commercial_contacts c`
    ))[0];
    expect(stats).toEqual({ contacts: plannedCount("commercial_contacts"), historique: stats.contacts, produit: stats.contacts, action: stats.contacts });
    // Le type de l'action initiale suit l'étape du contact (mapStageToAction).
    const mismatch = await scalar(
      `SELECT COUNT(*)::int FROM commercial_contacts c JOIN commercial_contact_actions a ON a."commercialContactId" = c.id
        WHERE a."typeAction"::text <> CASE c."pipelineStage"::text WHEN 'Prospect' THEN 'Visite' WHEN 'Contacté' THEN 'Plan technique' WHEN 'Visite' THEN 'Visite' WHEN 'Devis envoyé' THEN 'Devis envoyé' WHEN 'Negociation' THEN 'Negociation' WHEN 'Gagné' THEN 'Commande gagnée' WHEN 'Perdu' THEN 'Commande perdue' END`
    );
    expect(mismatch).toBe(0);
    expect(await scalar(`SELECT COUNT(*)::int FROM commercial_projects WHERE NULLIF(TRIM("nomProjet"), '') IS NULL`)).toBe(0);
  });

  test("règles des routes : nom de projet unique par propriétaire, montant réservé aux revendeurs et applicateurs", async () => {
    expect(await scalar(`SELECT COUNT(*)::int FROM (SELECT 1 FROM projects GROUP BY "ownerId", lower(trim("nomProjet")) HAVING COUNT(*) > 1) d`)).toBe(0);
    expect(await scalar(`SELECT COUNT(*)::int FROM projects WHERE "projectModele" = 'project' AND "montantMarche" IS NOT NULL`)).toBe(0);
    expect(await scalar(`SELECT COUNT(*)::int FROM projects p JOIN users u ON u.id = p."ownerId" WHERE u.role NOT IN ('commercial', 'admin', 'superadmin', 'superadmin2')`)).toBe(0);
  });

  test("dates : celles du plan sont conservées et toutes tombent dans la période", async () => {
    const project = plan.entries.find((e) => e.table === "projects");
    const stored = (await rows(`SELECT "createdAt" FROM projects WHERE id = :id`, { id: project.id }))[0];
    expect(new Date(stored.createdAt).toISOString()).toBe(project.values.createdAt.toISOString());
    expect(await scalar(`SELECT COUNT(*)::int FROM por_promesh WHERE id <> :pre AND ("dateProduction" < :from OR "dateProduction" > :to)`, { pre: PRE_FICHE, from: config.period.from, to: config.period.to })).toBe(0);
    expect(await scalar(`SELECT COUNT(*)::int FROM industrial_records WHERE "dateFiche" < :from OR "dateFiche" > :to`, { from: config.period.from, to: config.period.to })).toBe(0);
  });

  test("statuts : uniquement des valeurs autorisées, et les fiches validées le sont par le service", async () => {
    expect(await scalar(`SELECT COUNT(*)::int FROM por_promesh WHERE id <> :pre AND ((status = 'VALIDE') <> "isLocked" OR (status = 'VALIDE' AND "validatedAt" IS NULL))`, { pre: PRE_FICHE })).toBe(0);
    const toValidate = plan.entries.filter((e) => e.table === "por_promesh" && e.meta.validate).length;
    expect(await scalar(`SELECT COUNT(*)::int FROM por_promesh WHERE status = 'VALIDE'`)).toBe(toValidate);
    expect(await scalar(`SELECT COUNT(*)::int FROM industrial_records WHERE statut = 'validee'`)).toBe(plan.entries.filter((e) => e.table === "industrial_records" && e.meta.validate).length);
    expect(await scalar(`SELECT COUNT(*)::int FROM industrial_records WHERE statut NOT IN ('enregistree', 'validee')`)).toBe(0);
    // Heures simulées, cohérentes avec la règle de validation.
    expect(await scalar(`SELECT COUNT(*)::int FROM por_promesh WHERE id <> :pre AND "heureFin" = "heureDebut"`, { pre: PRE_FICHE })).toBe(0);
    expect(await scalar(`SELECT COUNT(*)::int FROM por_promesh WHERE id <> :pre AND poste = 'matin' AND "heureFin" < "heureDebut"`, { pre: PRE_FICHE })).toBe(0);
  });

  test("isolation : toutes les fiches de production du lot sont TEST, aucune ligne préexistante n'est marquée", async () => {
    for (const table of DATA_STATUS_TABLES) {
      expect([table, await scalar(`SELECT COUNT(*)::int FROM "${table}" WHERE "dataStatus" <> 'TEST' AND id::text <> :pre`, { pre: PRE_FICHE })]).toEqual([table, 0]);
    }
    expect(await scalar(`SELECT "dataStatus"::text FROM por_promesh WHERE id = :pre`, { pre: PRE_FICHE })).toBe("REAL");
  });

  test("aucun e-mail, aucune notification, aucun événement d'agenda", async () => {
    for (const table of ["notifications", "email_queue", "tasks", "calendar_event_syncs"]) expect([table, await countOf(table)]).toEqual([table, 0]);
  });

  test("comptes : mots de passe temporaires aléatoires, jamais en clair, jamais au registre", async () => {
    const hashes = (await rows(`SELECT "passwordHash" AS h FROM users WHERE id <> :pre`, { pre: PRE_USER })).map((r) => r.h);
    expect(hashes.every((h) => /^\$2[aby]\$10\$.{53}$/.test(h))).toBe(true);
    expect(new Set(hashes).size).toBe(hashes.length);
    expect(await scalar(`SELECT COUNT(*)::int FROM data_change_log WHERE source::text LIKE '%$2b$%' OR COALESCE(new_value, '') LIKE '$2%' OR reason ILIKE '%mot de passe%'`)).toBe(0);
  });

  test("traçabilité : une ligne de registre par ligne créée, toutes retrouvables", async () => {
    const registry = await loadRegistry(crm.sequelize, batchId);
    for (const [table, ids] of registry) {
      expect([table, await scalar(`SELECT COUNT(*)::int FROM "${table}" WHERE id::text IN (:ids)`, { ids: [...ids] })]).toEqual([table, ids.size]);
    }
    expect(registry.get("projects").size).toBe(plannedCount("projects"));
    expect(registry.get("por_promesh").size).toBe(plannedCount("por_promesh"));
    // Rien de préexistant n'est au registre.
    for (const ids of registry.values()) for (const pre of [PRE_USER, PRE_COMPANY, PRE_FICHE]) expect(ids.has(pre)).toBe(false);
    expect(await scalar(`SELECT COUNT(*)::int FROM data_change_log WHERE batch_id = :b AND (executed_by <> 'DEMO_SEEDER' OR source->>'simulation' IS DISTINCT FROM 'true') AND operation = 'INSERT'`, { b: batchId })).toBe(0);
  });

  test("les données préexistantes n'ont pas été modifiées par l'injection", async () => {
    expect(await preexistingFingerprint()).toBe(fingerprintBefore);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Deuxième exécution", () => {
  test("aucun doublon : rien n'est créé, les comptages et le registre ne bougent pas", async () => {
    const tables = ["users", "companies", "projects", "project_actions", "commercial_contacts", "commercial_contact_actions", "commercial_contact_relances", "por_promesh", "por_promesh_process_control", "industrial_records", "recuperable_fiches", "recuperable_lignes", "data_change_log"];
    const before = {};
    for (const t of tables) before[t] = await countOf(t);
    const report = await executeBatch({ config, plan, crm });
    expect(report.completed).toBe(true);
    expect(report.created).toBe(0);
    expect(report.skippedExisting).toBe(plan.entries.length);
    const after = {};
    for (const t of tables) after[t] = await countOf(t);
    expect(after).toEqual(before);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Suppression ciblée d'un lot (retour arrière)", () => {
  let fingerprintBefore;
  const extraAction = "44444444-4444-4444-8444-444444444444";

  test("simulation de suppression : ne supprime rien", async () => {
    fingerprintBefore = await preexistingFingerprint();
    const before = await countOf("projects");
    const report = await deleteBatch({ sequelize: crm.sequelize, batchId, dryRun: true });
    expect(report.refused).toBe(false);
    expect(await countOf("projects")).toBe(before);
  });

  test("refusée si une ligne HORS du lot dépend d'une ligne du lot ; rien n'est supprimé", async () => {
    const project = plan.entries.find((e) => e.table === "projects");
    await crm.sequelize.query(
      `INSERT INTO project_actions (id, "projectId", "typeAction_legacy", "dateAction", statut, priorite, "createdBy", "googleCalendarSynced", "createdAt", "updatedAt")
       VALUES (:id, :project, 'Visite', NOW(), 'A faire', 'normale', :user, false, NOW(), NOW())`,
      { replacements: { id: extraAction, project: project.id, user: PRE_USER } }
    );
    const before = { projects: await countOf("projects"), actions: await countOf("project_actions"), users: await countOf("users") };
    const report = await deleteBatch({ sequelize: crm.sequelize, batchId });
    expect(report.refused).toBe(true);
    expect(report.blocking.some((b) => b.table === "project_actions" && b.rows.includes(extraAction))).toBe(true);
    expect({ projects: await countOf("projects"), actions: await countOf("project_actions"), users: await countOf("users") }).toEqual(before);
    expect(await scalar(`SELECT COUNT(*)::int FROM data_change_log WHERE batch_id = :b AND operation = 'DELETE'`, { b: batchId })).toBe(0);
    await crm.sequelize.query(`DELETE FROM project_actions WHERE id = :id`, { replacements: { id: extraAction } });
  });

  test("suppression : seules les lignes du registre disparaissent, chacune est tracée", async () => {
    const registry = await loadRegistry(crm.sequelize, batchId);
    const registered = [...registry.values()].reduce((s, ids) => s + ids.size, 0);
    const report = await deleteBatch({ sequelize: crm.sequelize, batchId });
    expect(report.refused).toBe(false);
    expect(report.total).toBe(registered);
    // Le lot a disparu…
    for (const table of ["user_profiles", "engineers", "architects", "clients", "projects", "user_projects", "project_actions", "commercial_contacts", "commercial_contact_status_histories", "commercial_contact_products", "commercial_projects", "commercial_contact_actions", "commercial_contact_relances", "industrial_records", "recuperable_fiches", "recuperable_lignes", "por_promesh_controles_qualite", "por_promesh_process_control"]) {
      expect([table, await countOf(table)]).toEqual([table, 0]);
    }
    // … les lignes préexistantes et les référentiels sont toujours là.
    expect(await countOf("users")).toBe(1);
    expect(await countOf("companies")).toBe(1);
    expect(await countOf("por_promesh")).toBe(1);
    expect(await countOf("machines")).toBe(9);
    expect(await countOf("pipeline_stages")).toBe(10);
    expect(await countOf("project_action_types")).toBe(20);
    expect(await countOf("product_families")).toBe(2);
    // Chaque suppression est tracée.
    expect(await scalar(`SELECT COUNT(*)::int FROM data_change_log WHERE batch_id = :b AND operation = 'DELETE'`, { b: batchId })).toBe(registered);
    expect((await loadRegistry(crm.sequelize, batchId)).size).toBe(0);
  });

  test("les données préexistantes n'ont pas été modifiées par la suppression", async () => {
    expect(await preexistingFingerprint()).toBe(fingerprintBefore);
  });

  test("une seconde suppression ne fait rien", async () => {
    const report = await deleteBatch({ sequelize: crm.sequelize, batchId });
    expect(report.total).toBe(0);
    expect(report.message).toMatch(/aucune ligne vivante/);
  });

  test("après suppression, le lot peut être réinjecté à l'identique", async () => {
    const report = await executeBatch({ config, plan, crm });
    expect(report.completed).toBe(true);
    expect(await countOf("projects")).toBe(plannedCount("projects"));
    expect((await loadRegistry(crm.sequelize, batchId)).get("projects").size).toBe(plannedCount("projects"));
  });

  test("la contrainte du journal accepte DELETE dans la base jetable, sans avoir perdu ses autres valeurs", async () => {
    const def = await scalar(`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'data_change_log'::regclass AND conname = 'data_change_log_operation_check'`);
    for (const op of ["INSERT", "UPDATE", "MERGE", "SKIPPED", "REVIEW_REQUIRED", "DELETE"]) expect(def).toContain(`'${op}'`);
    await expect(crm.sequelize.query(`INSERT INTO data_change_log (batch_id, table_name, record_id, column_name, source, reason, confidence, operation, executed_by) VALUES ('x', 'x', 'x', 'x', '{}', 'x', 'HIGH', 'TRUNCATE', 'x')`)).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Aucun effet externe", () => {
  test("toutes les connexions ouvertes pendant le chargement du CRM, l'injection et la suppression sont locales", () => {
    const LOCAL = ["127.0.0.1", "localhost", "::1"];
    expect(outbound.length).toBeGreaterThan(0); // le mouchard a bien vu la base
    expect(outbound.filter((c) => !LOCAL.includes(c.host))).toEqual([]);
    // PostgreSQL local, et le port 1 vers lequel l'envoi d'e-mails est neutralisé.
    expect([...new Set(outbound.map((c) => c.port))].sort((a, b) => a - b)).toEqual(expect.arrayContaining([Number(config.target.port)]));
    expect(outbound.filter((c) => ![Number(config.target.port), 1].includes(c.port))).toEqual([]);
  });

  test("aucune tâche planifiée n'a été programmée par le chargement du CRM", () => {
    const cron = require("node-cron");
    expect(cron.getTasks().size).toBe(0);
  });

  test("l'application elle-même (src/app.js) n'a pas été chargée : ni serveur, ni tâches de fond", () => {
    const loaded = Object.keys(require.cache).map((f) => f.split(path.sep).join("/"));
    expect(loaded.filter((f) => f.endsWith("/src/app.js") || f.includes("/src/cron/"))).toEqual([]);
  });

  test("l'envoi d'e-mails est neutralisé pour ce processus", () => {
    expect(process.env.EMAIL_HOST).toBe("127.0.0.1");
    expect(process.env.EMAIL_PORT).toBe("1");
    expect(process.env.AUTO_EMAIL_JOBS_ENABLED).toBe("false");
  });
});
