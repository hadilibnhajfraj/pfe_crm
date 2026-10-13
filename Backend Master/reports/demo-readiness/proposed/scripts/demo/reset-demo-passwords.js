"use strict";

// Réinitialisation du mot de passe des comptes de DÉMONSTRATION (demo.*).
//
//   node scripts/demo/reset-demo-passwords.js
//        Simulation : transaction en lecture seule, n'écrit rien.
//   node scripts/demo/reset-demo-passwords.js --apply --batch=<batch_id>
//        Écriture, dans une seule transaction, journalisée au registre.
//   Options : --all   traite aussi les comptes dont l'empreinte est déjà valide
//                     (par défaut : seulement ceux qui ne peuvent pas se connecter).
//
// Mot de passe : lu dans la variable d'environnement DEMO_ACCOUNT_PASSWORD.
// Il n'est jamais écrit dans un fichier, une trace, un rapport ni au registre ;
// aucune empreinte n'est affichée. Même algorithme que le CRM : bcrypt, coût 12
// (src/routes/auth.routes.js).
//
// Périmètre : uniquement les comptes inscrits au registre du lot ET dont
// l'adresse commence par « demo. ». Seule la colonne passwordHash est modifiée.
// Refus si la base connectée n'est pas exactement cbigestionnairepfe_demo.

const fs = require("fs");
const path = require("path");

const DEMO_DATABASE = "cbigestionnairepfe_demo";
const BCRYPT_COST = 12;
const EXECUTED_BY = "DEMO_ACCOUNTS";
const EXPECTED_ACCOUNTS = 10;

function findBackendRoot() {
  for (let dir = __dirname; dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const manifest = path.join(dir, "package.json");
    if (fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest, "utf8")).name === "backend-master") return dir;
  }
  throw new Error("racine du backend introuvable");
}

const ROOT = findBackendRoot();
const { Client } = require(path.join(ROOT, "node_modules", "pg"));
const bcrypt = require(path.join(ROOT, "node_modules", "bcrypt"));
const { loadConfig, resolvePassword } = require(path.join(ROOT, "scripts", "demo-seeder", "lib", "target"));

const flag = (name) => process.argv.includes(`--${name}`);
const option = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || "").split("=").slice(1).join("=");
const isBcrypt = `"passwordHash" ~ '^[$]2[aby][$][0-9]{2}[$].{53}$'`;

async function main() {
  const config = loadConfig();
  const batchId = `DEMO-${config.batch.name}-s${config.batch.seed}`;
  const apply = flag("apply");
  if (apply && option("batch") !== batchId) throw new Error(`confirmation manquante : relancer avec --batch=${batchId}`);

  // Même règle que POST /auth/signin : 8 à 72 caractères.
  const password = process.env.DEMO_ACCOUNT_PASSWORD;
  if (apply && (typeof password !== "string" || password.length < 8 || password.length > 72)) {
    throw new Error("DEMO_ACCOUNT_PASSWORD absent ou hors des 8 à 72 caractères acceptés par la connexion.");
  }

  const { target } = config;
  const client = new Client({ host: target.host, port: target.port, user: target.user, password: resolvePassword(config), database: target.database });
  await client.connect();
  try {
    const assertDemo = async () => {
      const { rows } = await client.query("SELECT current_database() AS d");
      if (rows[0].d !== DEMO_DATABASE) throw new Error(`OPÉRATION REFUSÉE : la connexion vise « ${rows[0].d} », pas « ${DEMO_DATABASE} ».`);
    };
    await assertDemo();
    await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
    await assertDemo();

    // Comptes du lot : inscrits au registre, adresse en « demo. ». L'empreinte n'est jamais lue, seulement son format.
    const { rows: accounts } = await client.query(
      `SELECT u.id::text AS id, u.email, u.role::text AS role, u."isActive" AS active, (${isBcrypt}) AS valid
         FROM users u
        WHERE u.email LIKE 'demo.%'
          AND EXISTS (SELECT 1 FROM data_change_log l WHERE l.batch_id = $1 AND l.table_name = 'users' AND l.operation = 'INSERT' AND l.record_id = u.id::text)
        ORDER BY u.role, u.email`,
      [batchId]
    );
    if (accounts.length !== EXPECTED_ACCOUNTS) throw new Error(`${accounts.length} compte(s) de démonstration trouvé(s), ${EXPECTED_ACCOUNTS} attendus : arrêt.`);
    const inactive = accounts.filter((a) => !a.active);
    if (inactive.length) throw new Error(`compte(s) inactif(s) : ${inactive.map((a) => a.email).join(", ")} : arrêt.`);

    const todo = accounts.filter((a) => flag("all") || !a.valid);
    console.log(`Base : ${DEMO_DATABASE} — lot : ${batchId} — ${apply ? "ÉCRITURE" : "simulation, lecture seule"}`);
    for (const a of accounts) console.log(`  ${a.role.padEnd(30)} ${a.email.padEnd(54)} empreinte ${a.valid ? "valide  " : "INVALIDE"} ${todo.includes(a) ? "→ à réinitialiser" : "→ inchangé"}`);

    if (!apply) {
      await client.query("ROLLBACK");
      console.log(`Simulation : ${todo.length} compte(s) seraient réinitialisés, ${accounts.length - todo.length} inchangé(s). Rien n'a été écrit.`);
      return;
    }

    const others = async () => (await client.query(`SELECT COUNT(*)::int AS n, md5(COALESCE(string_agg(md5((to_jsonb(t) - 'passwordHash' - 'updatedAt')::text), '' ORDER BY t.id::text), '')) AS h FROM users t`)).rows[0];
    const before = await others();
    for (const a of todo) {
      const hash = await bcrypt.hash(password, BCRYPT_COST);
      const res = await client.query(`UPDATE users SET "passwordHash" = $1, "updatedAt" = now() WHERE id::text = $2 AND email = $3`, [hash, a.id, a.email]);
      if (res.rowCount !== 1) throw new Error(`compte ${a.email} : ${res.rowCount} ligne(s) modifiée(s) au lieu de 1`);
      await client.query(
        `INSERT INTO data_change_log (batch_id, table_name, record_id, column_name, old_value, new_value, source, reason, confidence, operation, executed_by)
         VALUES ($1, 'users', $2, 'passwordHash', '[masqué]', '[masqué]', $3::jsonb, $4, 'HIGH', 'UPDATE', $5)`,
        [batchId, a.id, JSON.stringify({ script: "scripts/demo/reset-demo-passwords.js", role: a.role }), "Réinitialisation du mot de passe d'un compte de démonstration (préparation de la soutenance)", EXECUTED_BY]
      );
    }

    // Contrôles AVANT validation : le moindre écart annule tout.
    const after = await others();
    if (before.n !== after.n || before.h !== after.h) throw new Error("une autre colonne ou un autre compte a changé : annulation.");
    const { rows: check } = await client.query(`SELECT id::text AS id, "passwordHash" AS hash FROM users WHERE id::text = ANY($1)`, [todo.map((a) => a.id)]);
    for (const row of check) if (!(await bcrypt.compare(password, row.hash))) throw new Error("vérification bcrypt échouée : annulation.");
    const { rows: invalid } = await client.query(`SELECT COUNT(*)::int AS n FROM users WHERE email LIKE 'demo.%' AND NOT (${isBcrypt})`);
    if (invalid[0].n !== 0) throw new Error(`${invalid[0].n} compte(s) de démonstration encore sans empreinte valide : annulation.`);
    await assertDemo();
    await client.query("COMMIT");
    console.log(`Terminé : ${todo.length} compte(s) réinitialisé(s), vérifiés par bcrypt, inscrits au registre (${EXECUTED_BY}).`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Arrêt (rien n'est modifié) :", err.message);
  process.exit(1);
});
