"use strict";

// Charge le code du CRM (modèles et services) branché sur la base de
// DÉMONSTRATION. L'ordre compte : la cible est fixée pour ce processus AVANT
// le premier require d'un modèle, car src/db.js lit sa configuration à son
// chargement. Le .env n'est pas modifié.

const fs = require("fs");
const path = require("path");
const { pointProcessAtDemo, assertConnectedToDemo } = require("./target");

const ROOT = path.join(__dirname, "..", "..", "..");

async function openCrm(config) {
  pointProcessAtDemo(config);
  const original = console.log;
  console.log = () => {}; // traces de chargement des modèles
  let sequelize;
  try {
    ({ sequelize } = require(path.join(ROOT, "src/db")));
    for (const file of fs.readdirSync(path.join(ROOT, "src/models"))) if (file.endsWith(".js")) require(path.join(ROOT, "src/models", file));
  } finally {
    console.log = original;
  }
  // Contrôle sur la connexion réelle, avant de rendre la main.
  const where = await assertConnectedToDemo(sequelize);
  if (where.database !== config.target.database) throw new Error(`connexion sur « ${where.database} » au lieu de « ${config.target.database} »`);

  const modelByTable = new Map(Object.values(sequelize.models).map((m) => [String(m.getTableName()), m]));
  const services = {
    promesh: require(path.join(ROOT, "src/modules/por-promesh/services/porPromesh.service")),
    industrial: require(path.join(ROOT, "src/modules/industrial-records/services/industrialRecord.service")),
    recuperable: require(path.join(ROOT, "src/modules/recuperables/services/recuperable.service")),
  };
  const refs = {
    stageByName: new Map((await sequelize.query(`SELECT id::text AS id, name FROM pipeline_stages WHERE "deletedAt" IS NULL`, { type: "SELECT" })).map((r) => [r.name, r.id])),
    actionTypeByName: new Map((await sequelize.query(`SELECT id::text AS id, name FROM project_action_types`, { type: "SELECT" })).map((r) => [r.name, r.id])),
    machines: await sequelize.query(`SELECT id::text AS id, code, "typeMachine"::text AS "typeMachine", numero, statut::text AS statut FROM machines ORDER BY code`, { type: "SELECT" }),
  };
  const validators = {
    promesh: require(path.join(ROOT, "src/modules/por-promesh/validators/porPromesh.validator")).validateCreate,
    industrial: require(path.join(ROOT, "src/modules/industrial-records/validators/industrialRecord.validator")).validateCreate,
    recuperable: require(path.join(ROOT, "src/modules/recuperables/validators/recuperable.validator")).validateSaveFiche,
  };
  const ficheRules = require(path.join(ROOT, "src/modules/production/services/ficheRules"));
  const q = (sql, params = []) => sequelize.query(sql, { bind: params, type: "SELECT" });
  return { sequelize, modelByTable, services, refs, validators, ficheRules, q, database: where.database };
}

module.exports = { openCrm };
