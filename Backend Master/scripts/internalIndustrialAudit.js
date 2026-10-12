"use strict";

// Inventaire des tables des modules internes et industriels (services
// internes, maintenance, machines, production, RH, archivage / documents).
//
//   npm run data:audit:internal
//
// LECTURE SEULE : toutes les requêtes s'exécutent dans une transaction
// PostgreSQL ouverte en READ ONLY — la base refuse toute écriture. Le script
// écrit un seul fichier : reports/data-quality/internal-industrial-inventory.json
//
// Pour chaque table retenue : nombre de lignes, colonnes (type, NULL, valeurs
// distinctes, répartition si peu de valeurs, bornes des dates), clé primaire,
// clés étrangères sortantes et entrantes. Les colonnes sensibles ne sont pas lues.

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { sequelize } = require("../src/db");

const OUT = path.join(__dirname, "..", "reports", "data-quality", "internal-industrial-inventory.json");
const KEYWORDS = /maintenance|machine|production|product|fabrication|atelier|intervention|panne|incident|repair|equipment|asset|rh|ressource|human|employee|salarie|request|demande|conge|absence|document|archive|attachment|file|upload|service|internal|ticket|task|purchase|stock|industrial|por_|recuperable|devis|bon_de_commande/i;
const SENSITIVE = /password|token|hash|secret|otp|lastLoginIp/i;
const MAX_ROWS = 500000;

async function main() {
  const t = await sequelize.transaction();
  await sequelize.query("SET TRANSACTION READ ONLY", { transaction: t });
  const q = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: "SELECT", transaction: t });

  // Tables du CRM = tables décrites par un modèle Sequelize du projet.
  const modelDir = path.join(__dirname, "..", "src", "models");
  const modelTables = new Set();
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.isDirectory()) walk(path.join(dir, f.name));
      else if (f.name.endsWith(".js")) for (const m of fs.readFileSync(path.join(dir, f.name), "utf8").matchAll(/tableName:\s*["'`]([^"'`]+)["'`]/g)) modelTables.add(m[1]);
    }
  };
  walk(modelDir);

  const all = (await q(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`)).map((r) => r.t);
  const fks = await q(
    `SELECT c.conrelid::regclass::text AS "from", a.attname AS "column", c.confrelid::regclass::text AS "to", af.attname AS "toColumn", c.confdeltype AS "onDelete"
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
       JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = ANY (c.confkey)
      WHERE c.contype = 'f'`
  );
  const pks = await q(`SELECT c.conrelid::regclass::text AS t, a.attname AS c FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey) WHERE c.contype = 'p'`);
  const strip = (s) => s.replace(/"/g, "");

  const inventory = { generatedAt: new Date().toISOString(), readOnly: true, tablesInDatabase: all.length, modelTables: [...modelTables].sort(), keywordMatches: { crm: [], otherApplication: [] }, tables: [] };
  for (const table of all) {
    const isCrm = modelTables.has(table);
    if (!KEYWORDS.test(table)) continue;
    if (!isCrm) {
      inventory.keywordMatches.otherApplication.push(table);
      continue;
    }
    inventory.keywordMatches.crm.push(table);
    const [{ n }] = await q(`SELECT COUNT(*)::bigint AS n FROM "${table}"`);
    const rows = Number(n);
    const cols = await q(`SELECT column_name AS c, data_type AS d, udt_name AS u, is_nullable AS nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = :table ORDER BY ordinal_position`, { table });
    const columns = [];
    for (const { c, d, u, nullable } of cols) {
      const col = { column: c, type: d === "USER-DEFINED" ? `enum ${u}` : d, nullable: nullable === "YES" };
      if (SENSITIVE.test(c)) {
        columns.push({ ...col, sensitive: true });
        continue;
      }
      if (rows && rows <= MAX_ROWS) {
        const json = /json/.test(d);
        const [s] = await q(`SELECT COUNT(*) FILTER (WHERE "${c}" IS NULL)::int AS nulls, COUNT(*) FILTER (WHERE "${c}" IS NOT NULL AND TRIM("${c}"::text) IN ('', '[]', '{}'))::int AS empty, COUNT(DISTINCT "${c}"::text)::int AS "distinct" FROM "${table}"`);
        Object.assign(col, s);
        if (/date|timestamp/.test(d)) {
          const [b] = await q(`SELECT MIN("${c}") AS min, MAX("${c}") AS max FROM "${table}"`);
          Object.assign(col, b);
        } else if (!json && s.distinct > 0 && s.distinct <= 15 && !/^id$/i.test(c)) {
          col.values = await q(`SELECT "${c}"::text AS value, COUNT(*)::int AS n FROM "${table}" WHERE "${c}" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`);
        }
      }
      columns.push(col);
    }
    inventory.tables.push({
      table,
      rows,
      primaryKey: pks.filter((p) => strip(p.t) === table).map((p) => p.c),
      foreignKeys: fks.filter((f) => strip(f.from) === table).map((f) => ({ column: f.column, references: `${strip(f.to)}.${f.toColumn}`, onDelete: { a: "NO ACTION", r: "RESTRICT", c: "CASCADE", n: "SET NULL", d: "SET DEFAULT" }[f.onDelete] })),
      referencedBy: fks.filter((f) => strip(f.to) === table).map((f) => `${strip(f.from)}.${f.column}`),
      columns,
    });
  }

  await t.rollback();
  fs.writeFileSync(OUT, JSON.stringify(inventory, null, 2));
  console.log(`Inventaire en lecture seule : ${inventory.tables.length} tables CRM retenues, ${inventory.keywordMatches.otherApplication.length} tables d'une autre application écartées (${all.length} tables dans la base).`);
  for (const tb of inventory.tables) console.log(`  ${tb.table} : ${tb.rows} lignes, ${tb.columns.length} colonnes, FK → ${tb.foreignKeys.map((f) => `${f.column}→${f.references}`).join(", ") || "aucune"}`);
  await sequelize.close();
}

main().catch(async (err) => {
  console.error("Inventaire interrompu :", err.message);
  try {
    await sequelize.close();
  } catch (_e) {
    /* connexion déjà fermée */
  }
  process.exit(1);
});
