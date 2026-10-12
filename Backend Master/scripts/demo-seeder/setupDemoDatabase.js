"use strict";

// Prépare la base de DÉMONSTRATION : structure seule + référentiels.
//
//   node scripts/demo-seeder/setupDemoDatabase.js            (contrôle seul, n'écrit rien)
//   node scripts/demo-seeder/setupDemoDatabase.js --create   (crée la base)
//
// - La base réelle n'est que LUE (pg_dump en session lecture seule).
// - AUCUNE donnée métier n'est copiée : seulement la structure, puis les
//   tables de référence listées dans demo.config.json (étapes de pipeline,
//   types d'action, machines, familles de produits, liste des migrations).
// - Le script refuse de toucher une base déjà existante : il ne supprime et
//   ne vide jamais rien.

const path = require("path");
const { spawnSync } = require("child_process");
const { loadConfig, resolvePassword, assertDemoName, DEMO_DATABASE } = require("./lib/target");

const PG_BIN = process.env.PG_BIN || (process.platform === "win32" ? "C:\\Program Files\\PostgreSQL\\17\\bin" : "");
const bin = (name) => (PG_BIN ? path.join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name) : name);

function main() {
  const config = loadConfig();
  const password = resolvePassword(config);
  const { host, port, user, database } = config.target;
  const source = config.structureSource.database;
  const tables = config.structureSource.referenceTables;
  assertDemoName(database);

  const base = ["-h", host, "-p", String(port), "-U", user];
  const env = { ...process.env, PGPASSWORD: password, PGCLIENTENCODING: "UTF8" };
  const readOnly = { ...env, PGOPTIONS: "-c default_transaction_read_only=on" };
  const run = (command, args, options = {}) => {
    const r = spawnSync(bin(command), args, { env: options.env || env, input: options.input, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
    if (r.error) throw new Error(`${command} : ${r.error.message}`);
    if (r.status !== 0) throw new Error(`${command} a échoué (code ${r.status}) : ${String(r.stderr || "").trim().slice(0, 600)}`);
    return r.stdout;
  };
  const scalar = (db, sql, e = env) => run("psql", [...base, "-d", db, "-At", "-c", sql], { env: e }).trim();

  console.log(`Serveur : ${host}:${port} — utilisateur : ${user}`);
  console.log(`Source de la structure (lecture seule) : ${source}`);
  console.log(`Cible : ${database}`);

  const exists = scalar("postgres", `SELECT COUNT(*) FROM pg_database WHERE datname = '${DEMO_DATABASE}'`) === "1";
  if (exists) {
    console.log(`La base ${database} existe déjà : rien n'est modifié.`);
  } else if (!process.argv.includes("--create")) {
    console.log(`La base ${database} n'existe pas. Relancer avec --create pour la créer (structure + référentiels).`);
    return;
  } else {
    run("createdb", [...base, database]);
    // Structure seule, lue dans la base réelle en session lecture seule.
    const schema = run("pg_dump", [...base, "-d", source, "--schema-only", "--no-owner", "--no-privileges"], { env: readOnly });
    run("psql", [...base, "-d", database, "-v", "ON_ERROR_STOP=1", "-q"], { input: schema });
    // Référentiels : uniquement les tables listées, aucune table métier.
    const data = run("pg_dump", [...base, "-d", source, "--data-only", "--no-owner", ...tables.flatMap((t) => ["-t", `"${t}"`])], { env: readOnly });
    run("psql", [...base, "-d", database, "-v", "ON_ERROR_STOP=1", "-q"], { input: data });
    console.log(`Base ${database} créée : structure + ${tables.length} tables de référence.`);
  }

  // Contrôle : la cible ne contient QUE des référentiels.
  const connected = scalar(database, "SELECT current_database() || ' | ' || current_user || ' | ' || inet_server_addr() || ':' || inet_server_port()");
  console.log(`Connexion vérifiée : ${connected}`);
  const counts = scalar(
    database,
    `SELECT string_agg(t || '=' || n, ', ' ORDER BY t) FROM (
       SELECT table_name AS t, (xpath('/row/c/text()', query_to_xml(format('SELECT COUNT(*) AS c FROM %I', table_name), false, true, '')))[1]::text::bigint AS n
         FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') x WHERE n > 0`
  );
  const nonReference = counts
    .split(", ")
    .filter(Boolean)
    .filter((entry) => !tables.includes(entry.split("=")[0]));
  console.log(`Tables non vides : ${counts || "aucune"}`);
  console.log(`Tables de la cible : ${scalar(database, "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")} — de la source : ${scalar(source, "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'", readOnly)}`);
  console.log(`Dernière migration : cible ${scalar(database, 'SELECT MAX(name) FROM "SequelizeMeta"')} — source ${scalar(source, 'SELECT MAX(name) FROM "SequelizeMeta"', readOnly)}`);
  console.log(nonReference.length ? `ATTENTION — tables hors référentiels contenant des lignes : ${nonReference.join(", ")}` : "Aucune donnée métier dans la cible : seuls les référentiels sont remplis.");
}

try {
  main();
} catch (err) {
  console.error("Préparation interrompue :", err.message);
  process.exit(1);
}
