"use strict";
// Crée (ou réinitialise) un compte QA actif par rôle dans la base de TEST.
// Refuse de s'exécuter si la base ciblée ne se termine pas par "_test".
require("dotenv").config();
const bcrypt = require("bcrypt");
const { Client } = require("pg");
const { randomUUID } = require("crypto");

const ROLES = ["commercial", "commercial_sedentaire", "accueil", "responsable_logistique_achat", "admin", "superadmin", "superadmin2"];
const PASSWORD = process.env.QA_PASSWORD || "QaAudit#2026";

(async () => {
  const database = process.env.DB_NAME_TEST || `${process.env.DB_NAME}_test`;
  if (!database.endsWith("_test")) throw new Error(`Refus : ${database} n'est pas une base de test`);
  const db = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database });
  await db.connect();
  const hash = await bcrypt.hash(PASSWORD, 12);
  for (const role of ROLES) {
    const email = `qa.${role}@qa-probar.com`;
    await db.query(
      `INSERT INTO users (id, email, "passwordHash", "isActive", role, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,true,$4,now(),now())
       ON CONFLICT (email) DO UPDATE SET "passwordHash"=EXCLUDED."passwordHash", "isActive"=true, role=EXCLUDED.role`,
      [randomUUID(), email, hash, role]
    );
  }
  await db.query(
    `INSERT INTO users (id, email, "passwordHash", "isActive", role, "createdAt", "updatedAt")
     VALUES ($1,'qa.inactive@qa-probar.com',$2,false,'commercial',now(),now())
     ON CONFLICT (email) DO UPDATE SET "isActive"=false`,
    [randomUUID(), hash]
  );
  // Profil employé complet pour chaque compte QA sauf l'Accueil (qui sert de cas
  // "profil incomplet" dans les tests de demande RH).
  await db.query(
    `INSERT INTO user_profiles (id, "userId", nom, prenom, matricule, qualification, departement, service, "createdAt", "updatedAt")
     SELECT gen_random_uuid(), u.id, 'QA', u.role::text, 'QA-' || left(u.id::text, 6), 'Testeur', 'Qualité', 'Audit', now(), now()
     FROM users u WHERE u.email LIKE 'qa.%@qa-probar.com' AND u.role <> 'accueil' AND u."isActive" = true
     ON CONFLICT ("userId") DO UPDATE SET nom = EXCLUDED.nom, prenom = EXCLUDED.prenom, matricule = EXCLUDED.matricule,
       qualification = EXCLUDED.qualification, departement = EXCLUDED.departement, service = EXCLUDED.service`
  );
  const r = await db.query(`SELECT email, role, "isActive" FROM users WHERE email LIKE 'qa.%@qa-probar.com' ORDER BY role, email`);
  console.table(r.rows);
  await db.end();
})().catch((e) => { console.error("SEED_ERROR:", e.message); process.exit(1); });
