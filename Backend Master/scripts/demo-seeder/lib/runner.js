"use strict";

// INJECTION du lot de démonstration, par étapes transactionnelles.
//
// - La connexion est contrôlée (current_database) avant CHAQUE étape.
// - Étapes commerciales : une transaction par étape ; la moindre erreur annule
//   toute l'étape (rien d'elle ne reste) et arrête le lot.
// - Étapes de production : chaque fiche est créée par le service métier du
//   CRM (qui gère sa propre transaction), puis marquée dataStatus = TEST et
//   inscrite au registre dans une transaction.
// - Après chaque étape, les écritures sont CONTRÔLÉES : nombre de lignes,
//   registre, statut des fiches. Le moindre écart arrête l'injection.
// - Rejouable : une ligne déjà présente (même identifiant) est ignorée. Un lot
//   interrompu reprend donc là où il s'est arrêté, sans doublon.
// - Chaque création est inscrite au registre (data_change_log, batch_id) ;
//   chaque échec aussi (opération SKIPPED).

const crypto = require("crypto");
const { assertConnectedToDemo } = require("./target");
const { serviceChildren } = require("./checks");

const EXECUTED_BY = "DEMO_SEEDER";
// Ordre des étapes = ordre des dépendances.
const STEPS = [
  { name: "utilisateurs", tables: ["users", "user_profiles"] },
  { name: "référentiels commerciaux", tables: ["companies", "engineers", "architects", "clients"] },
  { name: "projets", tables: ["projects", "user_projects"] },
  { name: "actions de projet", tables: ["project_actions"] },
  { name: "contacts", tables: ["commercial_contacts", "commercial_contact_status_histories", "commercial_contact_products", "commercial_projects", "commercial_contact_actions"] },
  { name: "relances", tables: ["commercial_contact_relances"] },
  { name: "fiches PROMESH", tables: ["por_promesh"], service: true },
  { name: "fiches PROBAR", tables: ["industrial_records"], service: true },
  { name: "fiches de déchets", tables: ["recuperable_fiches"], service: true },
];
const DATA_STATUS_TABLES = ["por_promesh", "industrial_records", "recuperable_fiches"];

// Créations du lot encore vivantes : une ligne supprimée puis réinjectée
// (retour arrière suivi d'un rejeu) ne doit compter qu'une fois.
const LIVE = `l.batch_id = :batchId AND l.table_name = :table AND l.operation = 'INSERT'
  AND NOT EXISTS (SELECT 1 FROM data_change_log d WHERE d.batch_id = l.batch_id AND d.table_name = l.table_name AND d.record_id = l.record_id AND d.operation = 'DELETE' AND d.id > l.id)`;

function batchIdOf(config) {
  return `DEMO-${config.batch.name}-s${config.batch.seed}`;
}

async function logEntry(sequelize, transaction, { batchId, table, recordId, operation, reason, source, oldValue = null }) {
  await sequelize.query(
    `INSERT INTO data_change_log (batch_id, table_name, record_id, column_name, old_value, new_value, source, reason, confidence, operation, executed_by)
     VALUES (:batchId, :table, :recordId, 'id', :oldValue, :newValue, CAST(:source AS jsonb), :reason, 'HIGH', :operation, :executedBy)`,
    { transaction, replacements: { batchId, table, recordId: String(recordId), oldValue, newValue: operation === "INSERT" ? String(recordId) : null, source: JSON.stringify(source), reason, operation, executedBy: EXECUTED_BY } }
  );
}

// Mot de passe temporaire aléatoire : jamais affiché, jamais écrit dans un
// rapport ni dans le registre. Seule son empreinte bcrypt entre en base.
async function temporaryPasswordHash() {
  const bcrypt = require("bcrypt");
  return bcrypt.hash(crypto.randomBytes(24).toString("base64"), 10);
}

// Les services du CRM écrivent des traces de diagnostic : silence pendant l'appel.
async function quiet(fn) {
  const original = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = original;
  }
}

async function executeBatch({ config, plan, crm, options = {} }) {
  const { sequelize, modelByTable, services } = crm;
  const batchId = batchIdOf(config);
  const source = { generator: "scripts/demo-seeder", batch: config.batch.name, seed: config.batch.seed, simulation: true };
  const reason = config.simulation.provenance;
  const report = { batchId, startedAt: new Date().toISOString(), steps: [], created: 0, skippedExisting: 0, stoppedAt: null, error: null };
  const count = async (sql, replacements) => (await sequelize.query(sql, { replacements, type: "SELECT" }))[0].n;

  for (const step of STEPS) {
    if (options.onlySteps && !options.onlySteps.includes(step.name)) continue;
    const where = await assertConnectedToDemo(sequelize);
    report.database = where.database;
    const entries = plan.entries.filter((e) => step.tables.includes(e.table));
    const result = { step: step.name, planned: entries.length, created: 0, alreadyPresent: 0, byTable: {} };
    report.steps.push(result);
    const tally = (table, field) => ((result.byTable[table] = result.byTable[table] || { created: 0, alreadyPresent: 0 })[field] += 1);

    try {
      if (!step.service) {
        // ── Étape commerciale : tout ou rien ─────────────────────────────────
        await sequelize.transaction(async (transaction) => {
          await assertConnectedToDemo(sequelize, transaction);
          for (const e of entries) {
            const Model = modelByTable.get(e.table);
            if (!Model) throw new Error(`aucun modèle pour la table ${e.table}`);
            if (await Model.findByPk(e.id, { transaction, attributes: ["id"] })) {
              tally(e.table, "alreadyPresent");
              result.alreadyPresent += 1;
              continue;
            }
            const values = { id: e.id, ...e.values };
            if (e.meta.needsPasswordHash) values.passwordHash = await temporaryPasswordHash();
            if (options.failAt && options.failAt(e)) throw new Error(`échec simulé sur ${e.table} ${e.key}`);
            // silent : les dates createdAt / updatedAt du plan sont conservées.
            await Model.create(values, { transaction, silent: true });
            await logEntry(sequelize, transaction, { batchId, table: e.table, recordId: e.id, operation: "INSERT", reason, source: { ...source, key: e.key, via: "model" } });
            tally(e.table, "created");
            result.created += 1;
          }
        });
      } else {
        // ── Étape de production : une fiche à la fois, par le service du CRM ──
        for (const e of entries) {
          await assertConnectedToDemo(sequelize);
          const actor = e.meta.actor;
          let ficheId = e.id;
          let created = false;
          if (e.table === "por_promesh") {
            if (await modelByTable.get("por_promesh").findByPk(e.id, { attributes: ["id"] })) {
              tally(e.table, "alreadyPresent");
              result.alreadyPresent += 1;
              continue;
            }
            if (options.failAt && options.failAt(e)) throw new Error(`échec simulé sur ${e.table} ${e.key}`);
            await quiet(() => services.promesh.createPorPromesh({ ...e.values, id: e.id }, actor));
            if (e.meta.validate) await quiet(() => services.promesh.validatePorPromesh(e.id, actor));
            created = true;
          } else if (e.table === "industrial_records") {
            if (await modelByTable.get("industrial_records").findByPk(e.id, { attributes: ["id"] })) {
              tally(e.table, "alreadyPresent");
              result.alreadyPresent += 1;
              continue;
            }
            if (options.failAt && options.failAt(e)) throw new Error(`échec simulé sur ${e.table} ${e.key}`);
            await quiet(() => services.industrial.createRecord({ ...e.values, id: e.id }, actor));
            if (e.meta.validate) await quiet(() => services.industrial.updateRecord(e.id, { statut: "validee" }, actor));
            created = true;
          } else if (e.table === "recuperable_fiches") {
            const v = e.values;
            // Identifiant attribué par le service : la fiche se retrouve par
            // sa combinaison unique module / machine / ligne / poste / date.
            const [existing] = await sequelize.query(`SELECT id::text AS id FROM recuperable_fiches WHERE module = :module AND machine = :machine AND ligne = :ligne AND poste = :poste AND date = :date`, { replacements: v, type: "SELECT" });
            if (existing) {
              tally(e.table, "alreadyPresent");
              result.alreadyPresent += 1;
              continue;
            }
            if (options.failAt && options.failAt(e)) throw new Error(`échec simulé sur ${e.table} ${e.key}`);
            const fiche = await quiet(() => services.recuperable.saveFiche(v, actor));
            ficheId = fiche.id;
            created = true;
          }
          if (!created) continue;
          // Marquage TEST et registre de la fiche et de ses lignes filles.
          await sequelize.transaction(async (transaction) => {
            await sequelize.query(`UPDATE "${e.table}" SET "dataStatus" = 'TEST' WHERE id = :id`, { transaction, replacements: { id: ficheId } });
            await logEntry(sequelize, transaction, { batchId, table: e.table, recordId: ficheId, operation: "INSERT", reason, source: { ...source, key: e.key, via: e.meta.service, validated: Boolean(e.meta.validate) } });
            const children = { por_promesh: [["por_promesh_controles_qualite", "porPromeshId"], ["por_promesh_process_control", "porPromeshId"]], recuperable_fiches: [["recuperable_lignes", "ficheId"]] }[e.table] || [];
            for (const [childTable, fk] of children) {
              const rows = await sequelize.query(`SELECT id::text AS id FROM "${childTable}" WHERE "${fk}" = :id`, { transaction, replacements: { id: ficheId }, type: "SELECT" });
              for (const row of rows) {
                await logEntry(sequelize, transaction, { batchId, table: childTable, recordId: row.id, operation: "INSERT", reason, source: { ...source, key: e.key, via: `${e.meta.service} (ligne fille)`, parent: ficheId } });
                tally(childTable, "created");
              }
            }
          });
          tally(e.table, "created");
          result.created += 1;
        }
      }

      // ── Contrôle des écritures de l'étape ──────────────────────────────────
      result.controls = [];
      const control = (label, ok, detail) => {
        result.controls.push({ label, ok, detail });
        if (!ok) throw new Error(`contrôle après écriture en échec — ${label} : ${detail}`);
      };
      for (const table of step.tables) {
        const tableEntries = entries.filter((e) => e.table === table);
        const ids = tableEntries.map((e) => e.id).filter((x) => x != null).map(String);
        if (ids.length) {
          const present = await count(`SELECT COUNT(*)::int AS n FROM "${table}" WHERE id::text IN (:ids)`, { ids });
          control(`${table} : lignes présentes`, present === ids.length, `${present} sur ${ids.length}`);
        }
        const logged = await count(`SELECT COUNT(DISTINCT l.record_id)::int AS n FROM data_change_log l WHERE ${LIVE}`, { batchId, table });
        const inTable = await count(`SELECT COUNT(*)::int AS n FROM "${table}" t WHERE EXISTS (SELECT 1 FROM data_change_log l WHERE ${LIVE} AND l.record_id = t.id::text)`, { batchId, table });
        control(`${table} : registre`, logged === tableEntries.length && inTable === logged, `${logged} inscrites, ${inTable} retrouvées, ${tableEntries.length} prévues`);
        if (DATA_STATUS_TABLES.includes(table)) {
          const notTest = await count(`SELECT COUNT(*)::int AS n FROM "${table}" t WHERE "dataStatus" <> 'TEST' AND EXISTS (SELECT 1 FROM data_change_log l WHERE ${LIVE} AND l.record_id = t.id::text)`, { batchId, table });
          control(`${table} : dataStatus = TEST`, notTest === 0, `${notTest} fiche(s) non TEST`);
        }
      }
      if (step.service) {
        const expectedChildren = {};
        for (const e of entries) for (const [child, n] of Object.entries(serviceChildren(e))) expectedChildren[child] = (expectedChildren[child] || 0) + n;
        for (const [child, expected] of Object.entries(expectedChildren)) {
          const logged = await count(`SELECT COUNT(DISTINCT l.record_id)::int AS n FROM data_change_log l WHERE ${LIVE}`, { batchId, table: child });
          control(`${child} : lignes filles`, logged === expected, `${logged} inscrites, ${expected} prévues`);
        }
      }
      report.created += result.created;
      report.skippedExisting += result.alreadyPresent;
    } catch (err) {
      // Échec : journalisé (hors de la transaction annulée), puis arrêt du lot.
      result.error = err.message;
      report.stoppedAt = step.name;
      report.error = err.message;
      try {
        await logEntry(sequelize, null, { batchId, table: step.tables[0], recordId: `step:${step.name}`, operation: "SKIPPED", reason: `Étape « ${step.name} » interrompue : ${String(err.message).slice(0, 400)}`, source });
      } catch (_e) {
        /* le diagnostic reste dans le rapport */
      }
      break;
    }
  }
  report.finishedAt = new Date().toISOString();
  report.completed = !report.stoppedAt;
  return report;
}

module.exports = { executeBatch, batchIdOf, STEPS, DATA_STATUS_TABLES, EXECUTED_BY, logEntry };
