"use strict";

// Réinitialisation du mot de passe des NEUF comptes de démonstration qui ne
// peuvent pas se connecter (reports/demo-data-quality/AUDIT.md, anomalie C-01).
//
//   npm run demo:passwords
//        Simulation : transaction en lecture seule, n'écrit rien.
//   npm run demo:passwords -- --apply --batch=<batch_id>
//        Écriture, dans une seule transaction, inscrite au registre du lot.
//
// Mot de passe : lu dans la variable d'environnement DEMO_ACCOUNT_PASSWORD.
// Il n'est jamais écrit dans un fichier, une trace, un rapport ni au registre ;
// aucune empreinte n'est lue en clair ni affichée. Même algorithme que le CRM :
// bcrypt, coût 12 (src/routes/auth.routes.js).
//
// Périmètre fermé : les neuf adresses ci-dessous, et rien d'autre. Chacune doit
// être inscrite au registre du lot de démonstration. Seule la colonne
// passwordHash change. Refus si la base connectée n'est pas exactement
// cbigestionnairepfe_demo.

const DEMO_DATABASE = "cbigestionnairepfe_demo";
const BCRYPT_COST = 12;
const EXECUTED_BY = "DEMO_ACCOUNTS";
const MASK = "[masqué]";

const TARGET_ACCOUNTS = Object.freeze([
  "demo.admin01@cbi_tunisia.com",
  "demo.commercial02@cbi_tunisia.com",
  "demo.commercial03@cbi_tunisia.com",
  "demo.commercial04@cbi_tunisia.com",
  "demo.commercial05@cbi_tunisia.com",
  "demo.commercial06@cbi_tunisia.com",
  "demo.commercial_sedentaire01@cbi_tunisia.com",
  "demo.commercial_sedentaire02@cbi_tunisia.com",
  "demo.responsable_logistique_achat01@cbi_tunisia.com",
]);

// Empreinte bcrypt bien formée — évaluée dans la base, la valeur n'en sort pas.
const IS_BCRYPT_SQL = `"passwordHash" ~ '^[$]2[aby][$][0-9]{2}[$].{53}$'`;
// Même règle que POST /auth/signin : 8 à 72 caractères.
const isAcceptablePassword = (value) => typeof value === "string" && value.length >= 8 && value.length <= 72;

/**
 * @param {{ client: { query: Function }, bcrypt: { hash: Function, compare: Function }, batchId: string,
 *           password?: string, apply?: boolean, log?: (line: string) => void }} options
 * @returns {Promise<{ database: string, mode: "dry-run"|"apply", accounts: object[], updated: number, committed: boolean }>}
 */
async function resetDemoPasswords({ client, bcrypt, batchId, password, apply = false, log = () => {} }) {
  if (apply && !isAcceptablePassword(password)) throw new Error("DEMO_ACCOUNT_PASSWORD absent ou hors des 8 à 72 caractères acceptés par la connexion.");

  const assertDemo = async () => {
    const { rows } = await client.query("SELECT current_database() AS d");
    if (rows[0].d !== DEMO_DATABASE) throw new Error(`OPÉRATION REFUSÉE : la connexion vise « ${rows[0].d} », pas « ${DEMO_DATABASE} ».`);
    return rows[0].d;
  };
  const database = await assertDemo();
  const report = { database, mode: apply ? "apply" : "dry-run", accounts: [], updated: 0, committed: false };

  await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
  try {
    await assertDemo();

    // Les neuf comptes, leur appartenance au registre du lot et la FORME de leur empreinte.
    const { rows } = await client.query(
      `SELECT u.id::text AS id, u.email, u.role::text AS role, u."isActive" AS active, (${IS_BCRYPT_SQL}) AS valid,
              EXISTS (SELECT 1 FROM data_change_log l WHERE l.batch_id = $2 AND l.table_name = 'users' AND l.operation = 'INSERT' AND l.record_id = u.id::text) AS registered
         FROM users u WHERE u.email = ANY($1) ORDER BY u.role, u.email`,
      [[...TARGET_ACCOUNTS], batchId]
    );
    const missing = TARGET_ACCOUNTS.filter((email) => !rows.some((r) => r.email === email));
    if (missing.length) throw new Error(`compte(s) introuvable(s) : ${missing.join(", ")}`);
    if (rows.length !== TARGET_ACCOUNTS.length) throw new Error(`${rows.length} ligne(s) pour ${TARGET_ACCOUNTS.length} comptes attendus`);
    for (const r of rows) {
      if (!r.registered) throw new Error(`compte hors du registre du lot ${batchId} : ${r.email}`);
      if (!r.active) throw new Error(`compte inactif : ${r.email}`);
    }
    report.accounts = rows.map((r) => ({ id: r.id, email: r.email, role: r.role, state: r.valid ? "empreinte déjà valide" : "à réinitialiser" }));
    for (const a of report.accounts) log(`  ${a.role.padEnd(30)} ${a.email.padEnd(54)} ${a.state}`);
    const todo = rows.filter((r) => !r.valid);

    if (!apply) {
      await client.query("ROLLBACK");
      log(`Simulation : ${todo.length} compte(s) seraient réinitialisés. Rien n'a été écrit.`);
      return report;
    }

    // Tout ce qui n'est pas l'empreinte doit rester identique, pour tous les comptes.
    const fingerprint = async () =>
      (await client.query(`SELECT COUNT(*)::int AS n, md5(COALESCE(string_agg(md5((to_jsonb(t) - 'passwordHash' - 'updatedAt')::text), '' ORDER BY t.id::text), '')) AS h FROM users t`)).rows[0];
    const before = await fingerprint();

    for (const a of todo) {
      const hash = await bcrypt.hash(password, BCRYPT_COST);
      const res = await client.query(`UPDATE users SET "passwordHash" = $1, "updatedAt" = now() WHERE id::text = $2 AND email = $3 AND NOT (${IS_BCRYPT_SQL})`, [hash, a.id, a.email]);
      if (res.rowCount !== 1) throw new Error(`compte ${a.email} : ${res.rowCount} ligne(s) modifiée(s) au lieu de 1`);
      await client.query(
        `INSERT INTO data_change_log (batch_id, table_name, record_id, column_name, old_value, new_value, source, reason, confidence, operation, executed_by)
         VALUES ($1, 'users', $2, 'passwordHash', $3, $4, $5::jsonb, $6, 'HIGH', 'UPDATE', $7)`,
        [batchId, a.id, MASK, MASK, JSON.stringify({ script: "scripts/demo/reset-demo-passwords.js", role: a.role }), "Réinitialisation du mot de passe d'un compte de démonstration (préparation de la soutenance)", EXECUTED_BY]
      );
      report.updated += 1;
    }

    // Contrôles AVANT validation : le moindre écart annule tout.
    const after = await fingerprint();
    if (before.n !== after.n || before.h !== after.h) throw new Error("une autre colonne ou un autre compte a changé");
    const { rows: stored } = await client.query(`SELECT "passwordHash" AS hash FROM users WHERE id::text = ANY($1)`, [todo.map((a) => a.id)]);
    if (stored.length !== todo.length) throw new Error("relecture des comptes incomplète");
    for (const row of stored) if (!(await bcrypt.compare(password, row.hash))) throw new Error("vérification bcrypt échouée");
    const { rows: left } = await client.query(`SELECT COUNT(*)::int AS n FROM users WHERE email = ANY($1) AND NOT (${IS_BCRYPT_SQL})`, [[...TARGET_ACCOUNTS]]);
    if (left[0].n !== 0) throw new Error(`${left[0].n} compte(s) encore sans empreinte valide`);
    await assertDemo();
    await client.query("COMMIT");
    report.committed = true;
    log(`Terminé : ${report.updated} compte(s) réinitialisé(s), vérifiés par bcrypt, inscrits au registre (${EXECUTED_BY}).`);
    return report;
  } catch (err) {
    await Promise.resolve(client.query("ROLLBACK")).catch(() => {});
    throw err;
  }
}

async function main() {
  const path = require("path");
  const root = path.join(__dirname, "..", "..");
  const { Client } = require("pg");
  const bcrypt = require("bcrypt");
  const { loadConfig, resolvePassword } = require(path.join(root, "scripts", "demo-seeder", "lib", "target"));
  const { batchIdOf } = require(path.join(root, "scripts", "demo-seeder", "lib", "runner"));

  const config = loadConfig();
  const batchId = batchIdOf(config);
  const apply = process.argv.includes("--apply");
  const confirmed = (process.argv.find((a) => a.startsWith("--batch=")) || "").slice("--batch=".length);
  if (apply && confirmed !== batchId) throw new Error(`confirmation manquante : relancer avec --batch=${batchId}`);
  const password = process.env.DEMO_ACCOUNT_PASSWORD;
  if (apply && !isAcceptablePassword(password)) throw new Error("DEMO_ACCOUNT_PASSWORD absent ou hors des 8 à 72 caractères acceptés par la connexion.");

  const { target } = config;
  const client = new Client({ host: target.host, port: target.port, user: target.user, password: resolvePassword(config), database: target.database });
  await client.connect();
  try {
    console.log(`Base : ${target.database} — lot : ${batchId} — ${apply ? "ÉCRITURE" : "simulation, lecture seule"}`);
    await resetDemoPasswords({ client, bcrypt, batchId, password, apply, log: (line) => console.log(line) });
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Arrêt (rien n'est modifié) :", err.message);
    process.exit(1);
  });
}

module.exports = { resetDemoPasswords, TARGET_ACCOUNTS, DEMO_DATABASE, BCRYPT_COST, EXECUTED_BY, isAcceptablePassword };
