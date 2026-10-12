"use strict";

// RETOUR ARRIÈRE : suppression ciblée d'un lot de démonstration.
//
// - Ne supprime QUE les lignes inscrites au registre du lot (data_change_log,
//   opération INSERT, batch_id) — jamais par critère large, jamais une table.
// - Avant toute suppression, les DÉPENDANCES sont contrôlées : si une ligne
//   hors registre référence une ligne du lot (elle serait bloquée, détachée
//   ou supprimée en cascade), tout est refusé et rien n'est supprimé.
// - Une seule transaction : tout le lot disparaît, ou rien.
// - Chaque suppression est tracée (opération DELETE), ce qui demande d'étendre
//   la contrainte du journal — dans la base de démonstration seulement.

const { assertConnectedToDemo } = require("./target");
const { EXECUTED_BY } = require("./runner");

const OPERATIONS = ["INSERT", "UPDATE", "MERGE", "SKIPPED", "REVIEW_REQUIRED", "DELETE"];

// Ajoute l'opération DELETE à la contrainte de data_change_log. Modification
// de structure réservée à la base de démonstration : la connexion est
// vérifiée d'abord, et aucune ligne existante ne peut violer la contrainte
// élargie (elle accepte toutes les valeurs d'avant, plus une).
async function ensureDeleteTraceability(sequelize) {
  await assertConnectedToDemo(sequelize);
  const [[current]] = await sequelize.query(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'data_change_log'::regclass AND conname = 'data_change_log_operation_check'`);
  if (current && current.def.includes("'DELETE'")) return { changed: false };
  const [[{ n }]] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM data_change_log WHERE operation NOT IN (:operations)`, { replacements: { operations: OPERATIONS } });
  if (n) throw new Error(`${n} ligne(s) du journal portent une opération inconnue : contrainte non modifiée.`);
  await sequelize.transaction(async (transaction) => {
    await assertConnectedToDemo(sequelize, transaction);
    await sequelize.query(`ALTER TABLE data_change_log DROP CONSTRAINT IF EXISTS data_change_log_operation_check`, { transaction });
    await sequelize.query(`ALTER TABLE data_change_log ADD CONSTRAINT data_change_log_operation_check CHECK (operation IN (${OPERATIONS.map((o) => `'${o}'`).join(", ")}))`, { transaction });
  });
  return { changed: true };
}

// Registre vivant du lot : lignes créées et pas encore supprimées.
async function loadRegistry(sequelize, batchId, transaction) {
  const rows = await sequelize.query(
    `SELECT table_name AS "table", record_id AS id FROM data_change_log l
      WHERE batch_id = :batchId AND operation = 'INSERT'
        AND NOT EXISTS (SELECT 1 FROM data_change_log d WHERE d.batch_id = l.batch_id AND d.table_name = l.table_name AND d.record_id = l.record_id AND d.operation = 'DELETE' AND d.id > l.id)
      ORDER BY l.id`,
    { replacements: { batchId }, type: "SELECT", transaction }
  );
  const registry = new Map();
  for (const r of rows) (registry.get(r.table) || registry.set(r.table, new Set()).get(r.table)).add(r.id);
  return registry;
}

async function foreignKeys(sequelize, transaction) {
  return sequelize.query(
    `SELECT c.conrelid::regclass::text AS child, a.attname AS "column", c.confrelid::regclass::text AS parent, c.confdeltype AS rule
       FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1`,
    { type: "SELECT", transaction }
  ).then((rows) => rows.map((r) => ({ ...r, child: r.child.replace(/"/g, ""), parent: r.parent.replace(/"/g, "") })));
}

// Lignes HORS registre qui dépendent d'une ligne du lot.
async function findBlockingDependencies(sequelize, registry, transaction) {
  const blocking = [];
  for (const fk of await foreignKeys(sequelize, transaction)) {
    const parentIds = registry.get(fk.parent);
    if (!parentIds || !parentIds.size) continue;
    const own = [...(registry.get(fk.child) || [])];
    const rows = await sequelize.query(
      `SELECT id::text AS id FROM "${fk.child}" WHERE "${fk.column}"::text IN (:parentIds) ${own.length ? "AND id::text NOT IN (:own)" : ""} LIMIT 20`,
      { replacements: { parentIds: [...parentIds], own }, type: "SELECT", transaction }
    );
    if (rows.length) blocking.push({ table: fk.child, column: fk.column, references: fk.parent, effect: { c: "serait supprimée en cascade", n: "serait détachée", r: "bloquerait la suppression", a: "bloquerait la suppression" }[fk.rule] || "dépend du lot", rows: rows.map((r) => r.id) });
  }
  return blocking;
}

// Enfants avant parents, d'après les clés étrangères entre tables du registre.
function deletionOrder(tables, fks) {
  const remaining = new Set(tables);
  const order = [];
  while (remaining.size) {
    const leaf = [...remaining].find((t) => !fks.some((fk) => fk.parent === t && fk.child !== t && remaining.has(fk.child)));
    if (!leaf) throw new Error(`cycle de dépendances entre : ${[...remaining].join(", ")}`);
    order.push(leaf);
    remaining.delete(leaf);
  }
  return order;
}

async function deleteBatch({ sequelize, batchId, dryRun = false }) {
  await assertConnectedToDemo(sequelize);
  const report = { batchId, dryRun, deleted: {}, total: 0, blocking: [], refused: false };
  const registry = await loadRegistry(sequelize, batchId);
  report.registered = Object.fromEntries([...registry].map(([t, ids]) => [t, ids.size]));
  if (!registry.size) return { ...report, message: "aucune ligne vivante au registre de ce lot" };

  report.blocking = await findBlockingDependencies(sequelize, registry);
  if (report.blocking.length) return { ...report, refused: true, message: "suppression refusée : des lignes hors du lot dépendent de lignes du lot" };
  const order = deletionOrder([...registry.keys()], await foreignKeys(sequelize));
  report.order = order;
  if (dryRun) return { ...report, message: "simulation : rien n'a été supprimé" };

  await ensureDeleteTraceability(sequelize);
  await sequelize.transaction(async (transaction) => {
    await assertConnectedToDemo(sequelize, transaction);
    // Recontrôle dans la transaction : rien n'a pu s'ajouter entre-temps.
    const blocking = await findBlockingDependencies(sequelize, registry, transaction);
    if (blocking.length) throw new Error("une dépendance hors lot est apparue : suppression annulée");
    for (const table of order) {
      const ids = [...registry.get(table)];
      // Uniquement par identifiant inscrit au registre.
      const removed = await sequelize.query(`DELETE FROM "${table}" WHERE id::text IN (:ids) RETURNING id::text AS id`, { replacements: { ids }, type: "SELECT", transaction });
      const removedIds = new Set(removed.map((r) => r.id));
      for (const id of ids) {
        // Une ligne déjà partie avec son parent (cascade interne au lot) est tracée de même.
        await sequelize.query(
          `INSERT INTO data_change_log (batch_id, table_name, record_id, column_name, old_value, new_value, source, reason, confidence, operation, executed_by)
           VALUES (:batchId, :table, :id, 'id', :id, NULL, CAST(:source AS jsonb), :reason, 'HIGH', 'DELETE', :executedBy)`,
          { transaction, replacements: { batchId, table, id, source: JSON.stringify({ generator: "scripts/demo-seeder", action: "delete-batch", direct: removedIds.has(id) }), reason: "Suppression ciblée du lot de démonstration (retour arrière)", executedBy: EXECUTED_BY } }
        );
      }
      report.deleted[table] = ids.length;
      report.total += ids.length;
    }
    // Contrôle : plus aucune ligne du registre ne subsiste.
    for (const [table, ids] of registry) {
      const [{ n }] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM "${table}" WHERE id::text IN (:ids)`, { replacements: { ids: [...ids] }, type: "SELECT", transaction });
      if (n) throw new Error(`${n} ligne(s) de ${table} subsistent : suppression annulée`);
    }
  });
  return { ...report, message: "lot supprimé" };
}

module.exports = { deleteBatch, loadRegistry, findBlockingDependencies, ensureDeleteTraceability, deletionOrder, OPERATIONS };
