"use strict";

// Garde-fou du lancement de DÉMONSTRATION. Préchargé avant le CRM :
//
//   npm run demo:start
//   (= node -r ./scripts/demo/demo-guard.js src/app.js)
//
// Sans effet sur `npm start` et `npm run dev`, qui ne le chargent pas. Ne lit
// le .env que pour le mot de passe du serveur local et ne l'écrit jamais.
//
// Ordre des contrôles — tous terminés AVANT que la première ligne du CRM
// s'exécute, donc avant toute synchronisation, création de compte, reprise de
// file d'e-mails ou tâche planifiée :
//   1. cible lue dans scripts/demo-seeder/demo.config.json, pas dans le .env ;
//   2. variables de CE processus fixées : dotenv ne remplace jamais une
//      variable déjà définie, DB_NAME et DATABASE_URL du .env sont donc ignorés ;
//   3. connexion de contrôle : current_database() doit valoir exactement
//      cbigestionnairepfe_demo, sinon arrêt ;
//   4. même contrôle sur chaque connexion ouverte ensuite par le CRM ;
//   5. tâches planifiées et envois d'e-mails neutralisés dans le processus
//      lui-même (pas seulement par variable d'environnement).
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
const fromRoot = (...parts) => path.join(ROOT, ...parts);
const { loadConfig, resolvePassword } = require(fromRoot("scripts", "demo-seeder", "lib", "target"));

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
  EMAIL_HOST: "127.0.0.1",
  EMAIL_PORT: "1",
  DEMO_MODE: "true",
});

// 2 bis. Sessions propres au mode démonstration.
//    Le CRM valide un jeton sur sa seule signature : il ne vérifie pas que
//    l'utilisateur du jeton existe dans la base connectée. Avec les secrets du
//    .env, un jeton émis par un backend branché sur une AUTRE base (session
//    restée ouverte dans le navigateur, valable 7 jours) était donc accepté
//    ici : son identifiant n'existe pas dans la base de démonstration, d'où
//    « 0 projet » pour un compte pourtant autorisé. L'inverse était vrai
//    aussi : un jeton de compte de démonstration était accepté ailleurs.
//    Les secrets de CE processus sont dérivés de ceux du .env : stables d'un
//    redémarrage à l'autre, différents de tout autre environnement, jamais
//    écrits nulle part.
const crypto = require("crypto");
for (const name of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "JWT_MFA_SECRET"]) {
  const original = process.env[name];
  if (original) process.env[name] = crypto.createHmac("sha256", original).update(`demo-session:${DEMO_DATABASE}:${name}`).digest("hex");
}

// 3. Contrôle sur la connexion elle-même, dans un processus enfant : il est
//    terminé avant que la moindre ligne du CRM s'exécute.
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

// 5a. Tâches planifiées : aucune ne peut être créée dans ce processus, quel
//     que soit l'état des interrupteurs. Les relances, notifications et alertes
//     automatiques du CRM ne viennent que de ces tâches.
const cron = require(fromRoot("node_modules", "node-cron"));
const ignoredJobs = [];
cron.schedule = (expression) => {
  ignoredJobs.push(expression);
  console.log(`[demo-guard] Tâche planifiée ignorée (${expression}).`);
  return { start() {}, stop() {}, destroy() {} };
};

// 5b. E-mails : tout transport créé par le CRM écrit le message en mémoire au
//     lieu de l'envoyer. Aucune connexion SMTP n'est ouverte.
const nodemailer = require(fromRoot("node_modules", "nodemailer"));
const createTransport = nodemailer.createTransport.bind(nodemailer);
nodemailer.createTransport = () => createTransport({ jsonTransport: true });

// 4. Même contrôle sur chaque connexion ouverte par le CRM, pendant toute la durée du processus.
const { sequelize } = require(fromRoot("src", "db"));
if (sequelize.config.database !== DEMO_DATABASE) refuse(`le CRM est configuré sur « ${sequelize.config.database} ».`);
sequelize.addHook("afterConnect", async (connection) => {
  const { rows } = await connection.query("SELECT current_database() AS d");
  if (rows[0].d !== DEMO_DATABASE) refuse(`une connexion du CRM vise « ${rows[0].d} ».`);
});

console.log(`[demo-guard] Base vérifiée : ${DEMO_DATABASE} sur ${target.host}:${target.port}.`);
console.log("[demo-guard] Neutralisés dans ce processus : tâches planifiées, archivage automatique, surveillance proactive, envoi d'e-mails.");
console.log("[demo-guard] Sessions isolées : un jeton émis par un autre environnement est refusé (reconnexion nécessaire).");

module.exports = { DEMO_DATABASE, ignoredJobs };
