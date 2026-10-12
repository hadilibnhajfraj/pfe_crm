"use strict";

// Sauvegarde complète de la base PostgreSQL, puis vérification de l'archive.
//
//   npm run db:backup
//
// Produit backups/<base>_<horodatage>.dump (format « custom » de pg_dump,
// restaurable avec pg_restore) et backups/<même nom>.json (taille, empreinte,
// nombre d'objets). Le mot de passe est lu dans .env et transmis à pg_dump par
// la variable d'environnement PGPASSWORD : il n'est jamais affiché.
//
// Code de sortie non nul si la sauvegarde ou sa relecture échoue.

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const OUT_DIR = path.join(__dirname, "..", "backups");
const PG_BIN = process.env.PG_BIN || (process.platform === "win32" ? "C:\\Program Files\\PostgreSQL\\17\\bin" : "");
const bin = (name) => (PG_BIN ? path.join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name) : name);

const database = process.env.DB_NAME;
const connection = ["-h", process.env.DB_HOST || "127.0.0.1", "-p", String(process.env.DB_PORT || 5432), "-U", process.env.DB_USER || "postgres"];
const env = { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || "" };

function run(command, args) {
  const r = spawnSync(bin(command), args, { env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw new Error(`${command} introuvable ou non exécutable : ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${command} a échoué (code ${r.status}) : ${String(r.stderr || "").trim().slice(0, 500)}`);
  return r.stdout;
}

function sha256(file) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buffer = Buffer.alloc(1024 * 1024);
  let read;
  while ((read = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, read));
  fs.closeSync(fd);
  return hash.digest("hex");
}

function main() {
  if (!database) throw new Error("DB_NAME absent de .env");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "_");
  const file = path.join(OUT_DIR, `${database}_${stamp}.dump`);

  console.log(`Sauvegarde de « ${database} » en cours…`);
  const startedAt = Date.now();
  run("pg_dump", [...connection, "-d", database, "-Fc", "-f", file]);

  // Relecture : pg_restore --list échoue si l'archive est tronquée ou illisible.
  const toc = run("pg_restore", ["--list", file]);
  const tables = toc.split(/\r?\n/).filter((l) => / TABLE DATA /.test(l)).map((l) => l.trim().split(/\s+/)[6]);
  const expected = run("psql", [...connection, "-d", database, "-At", "-c", "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"]).trim();
  const size = fs.statSync(file).size;
  if (!size) throw new Error("archive vide");
  if (tables.length < Number(expected)) throw new Error(`archive incomplète : ${tables.length} tables sur ${expected}`);

  const report = {
    file: path.relative(path.join(__dirname, ".."), file),
    database,
    createdAt: new Date().toISOString(),
    durationSeconds: Math.round((Date.now() - startedAt) / 1000),
    sizeBytes: size,
    sha256: sha256(file),
    tablesInArchive: tables.length,
    tablesInDatabase: Number(expected),
    restore: `pg_restore -h <hôte> -U <utilisateur> -d <base vide> "${path.basename(file)}"`,
  };
  fs.writeFileSync(file.replace(/\.dump$/, ".json"), JSON.stringify(report, null, 2));
  console.log(`Sauvegarde vérifiée : ${report.file} — ${(size / 1024 / 1024).toFixed(1)} Mo, ${tables.length}/${expected} tables, ${report.durationSeconds} s.`);
  console.log(`Empreinte SHA-256 : ${report.sha256}`);
}

try {
  main();
} catch (err) {
  console.error("Sauvegarde échouée :", err.message);
  process.exit(1);
}
