"use strict";

// Agent d'alimentation de la base de DÉMONSTRATION du CRM.
//
//   node scripts/demo-seeder/index.js --dry-run
//        Simulation : transaction en lecture seule, ne modifie rien.
//   node scripts/demo-seeder/index.js --apply --batch=<batch_id>
//        Injection par étapes transactionnelles, contrôlée après chaque étape.
//        <batch_id> doit être celui de la simulation validée.
//   node scripts/demo-seeder/index.js --verify
//        Contrôle après injection, en lecture seule.
//   node scripts/demo-seeder/index.js --rename-account-emails [--apply --batch=<batch_id>]
//        Change l'adresse des comptes du lot (colonne email seulement). Sans
//        --apply : montre la correspondance, n'écrit rien.
//   node scripts/demo-seeder/index.js --delete-batch=<batch_id> [--simulate]
//        Retour arrière : supprime uniquement les lignes inscrites au registre.
//
// N'écrit JAMAIS ailleurs que dans cbigestionnairepfe_demo : la cible vient de
// demo.config.json (pas du .env) et le nom de la base réellement connectée
// (current_database) est vérifié avant chaque étape d'écriture.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { loadConfig, DEMO_DATABASE } = require("./lib/target");
const { buildPlan } = require("./lib/plan");
const { checkPlan } = require("./lib/checks");
const { openCrm } = require("./lib/crm");
const { executeBatch, batchIdOf, DATA_STATUS_TABLES } = require("./lib/runner");
const { deleteBatch, ensureDeleteTraceability, loadRegistry } = require("./lib/deleter");

const ROOT = path.join(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, "reports", "demo-seeder");
const flag = (name) => process.argv.includes(`--${name}`);
const option = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || "").split("=").slice(1).join("=");
const fingerprint = (plan) => crypto.createHash("sha256").update(JSON.stringify(plan.entries)).digest("hex").slice(0, 16);
const save = (name, data) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(data, null, 2));
};

async function simulate(config, crm) {
  const plan = buildPlan(config, crm.refs);
  const deterministic = fingerprint(plan) === fingerprint(buildPlan(config, crm.refs));
  // Lecture seule : la base refuserait toute écriture pendant les contrôles.
  const checks = await crm.sequelize.transaction({ readOnly: true }, async (transaction) => {
    const q = (sql, params = []) => crm.sequelize.query(sql, { bind: params, type: "SELECT", transaction });
    return checkPlan({ plan, config, q, validators: crm.validators, ficheRules: crm.ficheRules });
  });
  const missingRefs = [];
  for (const e of plan.entries.filter((x) => x.table === "projects" && !x.values.pipelineStageId)) missingRefs.push(`projet ${e.key} : étape « ${e.meta.stage} » absente du référentiel`);
  for (const e of plan.entries.filter((x) => x.table === "project_actions" && !x.values.actionTypeId)) missingRefs.push(`action ${e.key} : type « ${e.values.typeAction_legacy} » absent du référentiel`);
  return { plan, checks, missingRefs, deterministic, injectionAllowed: checks.violations.length === 0 && missingRefs.length === 0 && deterministic };
}

function printSimulation(config, crm, sim) {
  const { checks, missingRefs } = sim;
  console.log(`Base : ${crm.database} — lot : ${batchIdOf(config)} — plan ${fingerprint(sim.plan)} — déterministe : ${sim.deterministic ? "oui" : "NON"}`);
  console.log(`Volume total prévu : ${checks.total} lignes (limite ${config.limits.maxTotalRows})`);
  for (const [table, t] of Object.entries(checks.byTable)) console.log(`  ${table.padEnd(38)} prévues ${String(t.planned).padStart(4)}  à créer ${String(t.toCreate).padStart(4)}  déjà là ${String(t.alreadyPresent).padStart(4)}  [${t.via}]`);
  console.log(`Violations : ${checks.violations.length} — références manquantes : ${missingRefs.length} — avertissements : ${checks.warnings.length}`);
  for (const v of checks.violations.slice(0, 15)) console.log(`  ✗ ${v.table} ${v.key || ""} : ${v.message}`);
  for (const m of missingRefs.slice(0, 10)) console.log(`  ✗ ${m}`);
  for (const w of checks.warnings) console.log(`  ! ${w}`);
}

// Contrôle après injection — lecture seule.
async function verify(config, crm) {
  const batchId = batchIdOf(config);
  const plan = buildPlan(config, crm.refs);
  const one = async (sql, replacements) => Object.values((await crm.sequelize.query(sql, { replacements, type: "SELECT" }))[0])[0];
  const registry = await loadRegistry(crm.sequelize, batchId);
  const results = [];
  const check = (label, ok, detail) => results.push({ label, ok: Boolean(ok), detail: String(detail) });

  const expected = {};
  for (const e of plan.entries) expected[e.table] = (expected[e.table] || 0) + 1;
  for (const [table, n] of Object.entries(expected)) {
    const inTable = await one(`SELECT COUNT(*)::int FROM "${table}"`);
    const registered = registry.get(table) ? registry.get(table).size : 0;
    check(`volume ${table}`, inTable === n && registered === n, `${inTable} en base, ${registered} au registre, ${n} prévues`);
  }
  for (const [table, ids] of registry) {
    const found = await one(`SELECT COUNT(*)::int FROM "${table}" WHERE id::text IN (:ids)`, { ids: [...ids] });
    check(`registre ${table} : lignes retrouvées`, found === ids.size, `${found} sur ${ids.size}`);
  }
  for (const table of DATA_STATUS_TABLES) check(`${table} : dataStatus = TEST partout`, (await one(`SELECT COUNT(*)::int FROM "${table}" WHERE "dataStatus" <> 'TEST'`)) === 0, `${await one(`SELECT COUNT(*)::int FROM "${table}" WHERE "dataStatus" <> 'TEST'`)} fiche(s) non TEST`);
  const orphanChecks = {
    "projets sans propriétaire ou sans étape": `SELECT COUNT(*)::int FROM projects p WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p."ownerId") OR NOT EXISTS (SELECT 1 FROM pipeline_stages s WHERE s.id = p."pipelineStageId")`,
    "projets : société, ingénieur ou architecte inconnu": `SELECT COUNT(*)::int FROM projects p WHERE (p."companyId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = p."companyId")) OR (p."engineerId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engineers c WHERE c.id = p."engineerId")) OR (p."architectId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM architects c WHERE c.id = p."architectId"))`,
    "actions sans projet ou sans type": `SELECT COUNT(*)::int FROM project_actions a WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = a."projectId") OR NOT EXISTS (SELECT 1 FROM project_action_types t WHERE t.id = a."actionTypeId")`,
    "contacts sans créateur, ou affectés à un non-commercial": `SELECT COUNT(*)::int FROM commercial_contacts c WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c."createdBy") OR (c."commercialId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c."commercialId" AND u.role = 'commercial'))`,
    "relances sans contact": `SELECT COUNT(*)::int FROM commercial_contact_relances r WHERE NOT EXISTS (SELECT 1 FROM commercial_contacts c WHERE c.id = r."commercialContactId")`,
    "fiches sans machine du bon type": `SELECT (SELECT COUNT(*) FROM por_promesh f WHERE NOT EXISTS (SELECT 1 FROM machines m WHERE m.id = f."machineId" AND m."typeMachine" = 'PROMESH'))::int + (SELECT COUNT(*) FROM industrial_records f WHERE NOT EXISTS (SELECT 1 FROM machines m WHERE m.id = f."machineId" AND m."typeMachine" = 'PROBAR'))::int + (SELECT COUNT(*) FROM recuperable_fiches f WHERE NOT EXISTS (SELECT 1 FROM machines m WHERE m.id = f."machineId"))::int`,
    "doublons : e-mail d'utilisateur": `SELECT COUNT(*)::int FROM (SELECT 1 FROM users GROUP BY lower(email) HAVING COUNT(*) > 1) d`,
    "doublons : nom de projet pour un même propriétaire": `SELECT COUNT(*)::int FROM (SELECT 1 FROM projects GROUP BY "ownerId", lower(trim("nomProjet")) HAVING COUNT(*) > 1) d`,
    "doublons : nom de société, d'ingénieur ou d'architecte": `SELECT (SELECT COUNT(*) FROM (SELECT 1 FROM companies GROUP BY lower(name) HAVING COUNT(*) > 1) d)::int + (SELECT COUNT(*) FROM (SELECT 1 FROM engineers GROUP BY lower(name) HAVING COUNT(*) > 1) d)::int + (SELECT COUNT(*) FROM (SELECT 1 FROM architects GROUP BY lower(name) HAVING COUNT(*) > 1) d)::int`,
    "doublons au registre": `SELECT COUNT(*)::int FROM (SELECT 1 FROM data_change_log l WHERE batch_id = '${batchId}' AND operation = 'INSERT' AND NOT EXISTS (SELECT 1 FROM data_change_log d WHERE d.batch_id = l.batch_id AND d.table_name = l.table_name AND d.record_id = l.record_id AND d.operation = 'DELETE' AND d.id > l.id) GROUP BY table_name, record_id HAVING COUNT(*) > 1) d`,
    "fiches validées incohérentes (statut, verrou, heures)": `SELECT COUNT(*)::int FROM por_promesh WHERE (status = 'VALIDE') <> "isLocked" OR (status = 'VALIDE' AND "validatedAt" IS NULL) OR "heureFin" = "heureDebut" OR (poste = 'matin' AND "heureFin" < "heureDebut")`,
    "adresses hors du domaine de démonstration": `SELECT COUNT(*)::int FROM users WHERE email NOT LIKE '%@${config.identity.accountEmailDomain || config.identity.emailDomain}'`,
    "comptes sans mot de passe chiffré": `SELECT COUNT(*)::int FROM users WHERE "passwordHash" !~ '^\\$2[aby]\\$'`,
    "e-mails, notifications ou événements d'agenda créés": `SELECT (SELECT COUNT(*) FROM notifications)::int + (SELECT COUNT(*) FROM email_queue)::int + (SELECT COUNT(*) FROM tasks)::int + (SELECT COUNT(*) FROM calendar_event_syncs)::int`,
    "lignes hors registre dans les tables du lot": `SELECT ${Object.keys(expected).map((t) => `(SELECT COUNT(*) FROM "${t}" x WHERE NOT EXISTS (SELECT 1 FROM data_change_log l WHERE l.batch_id = '${batchId}' AND l.table_name = '${t}' AND l.operation = 'INSERT' AND l.record_id = x.id::text))::int`).join(" + ")}`,
  };
  for (const [label, sql] of Object.entries(orphanChecks)) {
    const n = await one(sql);
    check(label, n === 0, `${n}`);
  }
  check("référentiels intacts", (await one(`SELECT (SELECT COUNT(*) FROM machines)::text || '/' || (SELECT COUNT(*) FROM pipeline_stages) || '/' || (SELECT COUNT(*) FROM project_action_types) || '/' || (SELECT COUNT(*) FROM product_families)`)) === "9/10/20/2", "machines / étapes / types d'action / familles");
  return { batchId, database: crm.database, ok: results.every((r) => r.ok), results };
}

// Changement d'adresse des comptes : sans le code du CRM (aucun service chargé).
async function renameEmails(config) {
  const { Client } = require("pg");
  const { resolvePassword } = require("./lib/target");
  const { renameAccountEmails } = require("./lib/accounts");
  const apply = flag("apply");
  if (apply && option("batch") !== batchIdOf(config)) throw new Error(`Confirmation manquante : relancer avec --batch=${batchIdOf(config)}`);
  const client = new Client({ host: config.target.host, port: config.target.port, user: config.target.user, password: resolvePassword(config), database: config.target.database });
  await client.connect();
  try {
    if (!apply) await client.query("SET default_transaction_read_only = on");
    const report = await renameAccountEmails({ client, config, apply });
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/..+/, "").replace("T", "-");
    save(`rename-emails-${config.batch.name}-${apply ? stamp : "dry-run"}.json`, report);
    console.log(`Base : ${report.database} — lot : ${report.batchId} — ${apply ? "ÉCRITURE" : "simulation, lecture seule"}`);
    for (const a of report.accounts) console.log(`  ${a.role.padEnd(30)} ${a.oldEmail.padEnd(52)} → ${a.newEmail.padEnd(54)} ${a.state}`);
    console.log(`Comptes : ${report.accounts.length} — modifiés : ${report.updated} — déjà à jour : ${report.alreadyDone} — contrôles : ${report.controls.filter((c) => c.ok).length}/${report.controls.length}`);
    if (report.error) {
      console.log(`ERREUR (transaction annulée, rien n'est modifié) : ${report.error}`);
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

async function main() {
  if (flag("rename-account-emails")) return renameEmails(loadConfig());
  const mode = ["dry-run", "apply", "verify"].find(flag) || (option("delete-batch") ? "delete-batch" : null);
  if (!mode) throw new Error("usage : --dry-run | --apply --batch=<batch_id> | --verify | --delete-batch=<batch_id> [--simulate]");
  const config = loadConfig();
  const batchId = batchIdOf(config);
  const crm = await openCrm(config);
  try {
    if (crm.database !== DEMO_DATABASE) throw new Error(`REFUS : connexion sur « ${crm.database} ».`);

    if (mode === "dry-run") {
      const sim = await simulate(config, crm);
      printSimulation(config, crm, sim);
      save(`dry-run-${config.batch.name}.json`, { mode, generatedAt: new Date().toISOString(), database: crm.database, batchId, seed: config.batch.seed, planFingerprint: fingerprint(sim.plan), deterministic: sim.deterministic, injectionAllowed: sim.injectionAllowed, totalRows: sim.checks.total, byTable: sim.checks.byTable, relations: sim.checks.relations, missingReferences: sim.missingRefs, missingFields: sim.checks.missingFields, uniqueConflicts: sim.checks.uniqueConflicts, violations: sim.checks.violations, warnings: sim.checks.warnings, simulation: config.simulation });
      console.log(sim.injectionAllowed ? "Injection possible (non exécutée)." : "INJECTION REFUSÉE tant que les points ci-dessus ne sont pas corrigés.");
      return;
    }

    if (mode === "apply") {
      if (option("batch") !== batchId) throw new Error(`Confirmation manquante : relancer avec --batch=${batchId}`);
      const sim = await simulate(config, crm);
      printSimulation(config, crm, sim);
      if (!sim.injectionAllowed) throw new Error("injection refusée : la simulation signale des violations.");
      // Le plan injecté doit être celui de la simulation validée.
      const validated = JSON.parse(fs.readFileSync(path.join(OUT_DIR, `dry-run-${config.batch.name}.json`), "utf8"));
      if (validated.batchId !== batchId || validated.planFingerprint !== fingerprint(sim.plan)) throw new Error("le plan a changé depuis la simulation validée : refaire --dry-run et le faire valider.");
      await ensureDeleteTraceability(crm.sequelize);
      const report = await executeBatch({ config, plan: sim.plan, crm });
      const verification = report.completed ? await verify(config, crm) : null;
      const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
      save(`apply-${config.batch.name}-${stamp}.json`, { ...report, verification });
      console.log(`Injection ${report.completed ? "TERMINÉE" : `ARRÊTÉE à l'étape « ${report.stoppedAt} » : ${report.error}`} — créées : ${report.created}, déjà présentes : ${report.skippedExisting}`);
      for (const s of report.steps) console.log(`  ${s.step.padEnd(26)} prévues ${String(s.planned).padStart(4)}  créées ${String(s.created).padStart(4)}  déjà là ${String(s.alreadyPresent).padStart(4)}  contrôles ${s.controls ? `${s.controls.filter((c) => c.ok).length}/${s.controls.length}` : "non faits"}${s.error ? `  ERREUR : ${s.error}` : ""}`);
      if (verification) console.log(`Contrôle final : ${verification.results.filter((r) => r.ok).length}/${verification.results.length} conformes`);
      if (!report.completed || (verification && !verification.ok)) process.exitCode = 1;
      return;
    }

    if (mode === "verify") {
      const verification = await verify(config, crm);
      save(`verify-${config.batch.name}.json`, verification);
      for (const r of verification.results) console.log(`  ${r.ok ? "ok " : "ÉCART"} ${r.label} : ${r.detail}`);
      console.log(`Contrôle : ${verification.results.filter((r) => r.ok).length}/${verification.results.length} conformes`);
      if (!verification.ok) process.exitCode = 1;
      return;
    }

    if (mode === "delete-batch") {
      const report = await deleteBatch({ sequelize: crm.sequelize, batchId: option("delete-batch"), dryRun: flag("simulate") });
      save(`delete-${config.batch.name}-${Date.now()}.json`, report);
      console.log(`${report.message} — lignes concernées : ${Object.values(report.registered || {}).reduce((s, n) => s + n, 0)}, supprimées : ${report.total}`);
      for (const b of report.blocking) console.log(`  ✗ ${b.table}.${b.column} → ${b.references} : ${b.rows.length} ligne(s) hors lot (${b.effect})`);
      if (report.refused) process.exitCode = 1;
    }
  } finally {
    await crm.sequelize.close();
  }
}

main().catch((err) => {
  console.error("Arrêt :", err.message);
  process.exit(1);
});
