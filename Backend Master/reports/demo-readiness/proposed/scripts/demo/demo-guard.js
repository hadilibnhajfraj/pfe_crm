"use strict";

// Garde-fou du lancement de DÉMONSTRATION — à précharger avant le CRM :
//
//   node -r ./scripts/demo/demo-guard.js src/app.js
//
// Ne modifie ni le .env ni aucun fichier du CRM, et n'a aucun effet sur un
// lancement normal (`npm start`, `npm run dev`), qui ne le charge pas.
//
// Ce qu'il garantit, dans cet ordre :
//   1. la cible vient de scripts/demo-seeder/demo.config.json, pas du .env ;
//   2. les variables de CE processus sont fixées avant le chargement du CRM :
//      dotenv ne remplace jamais une variable déjà définie, donc DB_NAME et
//      DATABASE_URL du .env sont ignorés ;
//   3. la base réellement connectée est interrogée (current_database()) AVANT
//      tout chargement du CRM : arrêt si ce n'est pas exactement la base de
//      démonstration ;
//   4. chaque connexion ouverte ensuite par le CRM est contrôlée de la même façon ;
//   5. tâches planifiées, archivage automatique, surveillance proactive et
//      envoi d'e-mails sont désactivés pour ce processus.
// Aucun secret n'est écrit dans les traces.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DEMO_DATABASE = "cbigestionnairepfe_demo";
const LOCAL_HOSTS = ["127.0.0.1", "localhost", "::1"];

function refuse(message) {
  console.error(`[demo-guard] DÉMARRAGE REFUSÉ : ${message}`);
  process.exit(1);
}

// Racine du backend : premier dossier parent dont le package.json est celui du CRM.
function findBackendRoot() {
  for (let dir = __dirname; dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const manifest = path.join(dir, "package.json");
    if (fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest, "utf8")).name === "backend-master") return dir;
  }
  return refuse("racine du backend introuvable");
}

const ROOT = findBackendRoot();
const { loadConfig, resolvePassword } = require(path.join(ROOT, "scripts", "demo-seeder", "lib", "target"));

if (process.env.NODE_ENV === "production") refuse("NODE_ENV=production : le lancement de démonstration ne se fait jamais en mode production.");

// 1. Cible : fichier de configuration du lot de démonstration.
const { target } = loadConfig();
if (target.database !== DEMO_DATABASE) refuse(`la configuration vise « ${target.database} », pas « ${DEMO_DATABASE} ».`);
if (!LOCAL_HOSTS.includes(target.host)) refuse(`la configuration vise l'hôte « ${target.host} » : seule une base locale est acceptée.`);
const password = resolvePassword({ target }); // lit le .env sans l'écrire ; la valeur n'est jamais affichée

// 2. Variables du processus — posées APRÈS la lecture du .env, elles priment sur lui.
Object.assign(process.env, {
  DB_HOST: target.host,
  DB_PORT: String(target.port),
  DB_USER: target.user,
  DB_PASSWORD: password,
  DB_NAME: DEMO_DATABASE,
  DATABASE_URL: `postgres://${encodeURIComponent(target.user)}:${encodeURIComponent(password)}@${target.host}:${target.port}/${DEMO_DATABASE}`,
  AUTO_EMAIL_JOBS_ENABLED: "false",
  AUTO_ARCHIVE_ENABLED: "false",
  AI_PROACTIVE_MONITORING_ENABLED: "false",
  // Aucun e-mail ne sort : port local fermé. Les adresses des comptes de démonstration n'existent pas.
  EMAIL_HOST: "127.0.0.1",
  EMAIL_PORT: "1",
  DEMO_MODE: "true",
});

// 3. Contrôle sur la connexion elle-même, avant tout chargement du CRM.
//    Processus enfant : le contrôle est terminé avant que la moindre ligne du CRM s'exécute.
const probe = spawnSync(
  process.execPath,
  [
    "-e",
    `const { Client } = require("pg");
     const e = process.env;
     const c = new Client({ host: e.DB_HOST, port: Number(e.DB_PORT), user: e.DB_USER, password: e.DB_PASSWORD, database: e.DB_NAME });
     c.connect().then(() => c.query("SELECT current_database() AS d")).then((r) => { process.stdout.write(r.rows[0].d); return c.end(); })
       .catch((err) => { process.stderr.write(String(err.code || err.message)); process.exit(2); });`,
  ],
  { cwd: ROOT, env: process.env, encoding: "utf8", timeout: 15000 }
);
if (probe.status !== 0) refuse(`connexion de contrôle impossible (${(probe.stderr || "délai dépassé").trim()}).`);
if (probe.stdout.trim() !== DEMO_DATABASE) refuse(`la connexion aboutit à « ${probe.stdout.trim()} », pas à « ${DEMO_DATABASE} ».`);

// 4. Même contrôle sur chaque connexion ouverte par le CRM pendant toute la durée du processus.
const { sequelize } = require(path.join(ROOT, "src", "db"));
if (sequelize.config.database !== DEMO_DATABASE) refuse(`le CRM est configuré sur « ${sequelize.config.database} ».`);
sequelize.addHook("afterConnect", async (connection) => {
  const { rows } = await connection.query("SELECT current_database() AS d");
  if (rows[0].d !== DEMO_DATABASE) refuse(`une connexion du CRM vise « ${rows[0].d} ».`);
});

console.log(`[demo-guard] Base vérifiée : ${DEMO_DATABASE} sur ${target.host}:${target.port}.`);
console.log("[demo-guard] Désactivés pour ce processus : tâches planifiées, archivage automatique, surveillance proactive, envoi d'e-mails.");
