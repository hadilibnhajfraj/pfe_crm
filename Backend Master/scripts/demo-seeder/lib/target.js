"use strict";

// Cible de l'agent de démonstration — configuration INDÉPENDANTE du .env.
//
// Le .env du projet n'est jamais modifié et sa base (DB_NAME) n'est jamais
// utilisée : la base visée vient de demo.config.json. Le seul nom accepté en
// écriture est écrit en dur ci-dessous ; aucune option ne permet de le changer.

const fs = require("fs");
const path = require("path");

const DEMO_DATABASE = "cbigestionnairepfe_demo";
// Bases qui ne doivent JAMAIS recevoir une écriture de cet agent.
const PROTECTED_DATABASES = ["cbigestionnairepfe", "cbigestionnairepfe_test", "cbigestionnairepfe_mig_test", "postgres"];

function loadConfig(file = path.join(__dirname, "..", "demo.config.json")) {
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  assertDemoName(config.target.database);
  if (config.structureSource && allowedDatabases().includes(config.structureSource.database)) throw new Error("La base source et la base cible sont identiques.");
  return config;
}

// Base jetable des tests automatisés : copie vide de la base de démonstration,
// recréée à chaque passe de tests. Acceptée UNIQUEMENT quand le code tourne
// sous Jest ; en exécution normale, seul DEMO_DATABASE est accepté.
const DEMO_TEST_DATABASE = "cbigestionnairepfe_demo_test";
const underJest = () => Boolean(process.env.JEST_WORKER_ID);

function allowedDatabases() {
  return underJest() ? [DEMO_DATABASE, DEMO_TEST_DATABASE] : [DEMO_DATABASE];
}

function assertDemoName(name) {
  if (!allowedDatabases().includes(name) || PROTECTED_DATABASES.includes(name)) {
    throw new Error(`Base cible refusée : « ${name} ». Cet agent n'écrit que dans « ${DEMO_DATABASE} ».`);
  }
}

// Mot de passe : jamais dans un fichier. Lu dans l'environnement ; à défaut,
// celui du serveur local déjà présent dans .env (lecture seule de ce fichier).
function resolvePassword(config) {
  require("dotenv").config({ quiet: true });
  const { passwordEnv, passwordFallbackEnv } = config.target;
  const value = process.env[passwordEnv] || process.env[passwordFallbackEnv];
  if (!value) throw new Error(`Mot de passe PostgreSQL absent : définir ${passwordEnv}.`);
  return value;
}

// À appeler AVANT tout require d'un modèle ou d'un service du CRM : src/db.js
// lit ces variables à son chargement. Le .env n'est pas réécrit ; seules les
// variables de CE processus sont fixées.
function pointProcessAtDemo(config) {
  assertDemoName(config.target.database);
  const password = resolvePassword(config);
  process.env.DB_HOST = config.target.host;
  process.env.DB_PORT = String(config.target.port);
  process.env.DB_USER = config.target.user;
  process.env.DB_PASSWORD = password;
  process.env.DB_NAME = config.target.database;
  process.env.DATABASE_URL = `postgres://${encodeURIComponent(config.target.user)}:${encodeURIComponent(password)}@${config.target.host}:${config.target.port}/${config.target.database}`;
  // Aucun e-mail, aucune tâche planifiée, aucun appel externe pendant la génération.
  process.env.AUTO_EMAIL_JOBS_ENABLED = "false";
  process.env.EMAIL_HOST = "127.0.0.1";
  process.env.EMAIL_PORT = "1";
  process.env.NODE_ENV = "demo-seeder";
  for (const key of ["WEB_SEARCH_API_KEY", "AI_WEB_SEARCH_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "WHATSAPP_TOKEN"]) delete process.env[key];
}

// Garde-fou d'exécution : la base réellement connectée doit être exactement
// la base de démonstration. Vérifié sur la connexion elle-même, pas sur la
// configuration.
async function assertConnectedToDemo(sequelize, transaction) {
  const [[row]] = await sequelize.query("SELECT current_database() AS database, current_user AS username, inet_server_addr()::text AS host, inet_server_port() AS port", { transaction });
  if (!allowedDatabases().includes(row.database) || PROTECTED_DATABASES.includes(row.database)) {
    throw new Error(`ÉCRITURE REFUSÉE : la connexion vise « ${row.database} », pas « ${DEMO_DATABASE} ».`);
  }
  return row;
}

module.exports = { DEMO_DATABASE, DEMO_TEST_DATABASE, PROTECTED_DATABASES, allowedDatabases, loadConfig, assertDemoName, resolvePassword, pointProcessAtDemo, assertConnectedToDemo };
