"use strict";

// Lectures allégées (aucune table enfant) pour le module Production — tout le
// calcul (sommes, taux, regroupements) se fait ensuite en JS dans le service,
// même approche que porPromesh.service.getDashboard et adminDashboard.service.

const { Op } = require("sequelize");
const PorPromesh = require("../../../models/PorPromesh");
const IndustrialRecord = require("../../../models/IndustrialRecord");
const RecuperableFiche = require("../../../models/RecuperableFiche");
const RecuperableLigne = require("../../../models/RecuperableLigne");
const Machine = require("../../../models/Machine");
const User = require("../../../models/User");
require("../../../models/associations");

const CREATOR = { model: User, as: "creator", attributes: ["id", "email"] };

const PROMESH_ATTRIBUTES = [
  "id",
  "sequenceNumber",
  "dateProduction",
  "heureDebut",
  "heureFin",
  "machine",
  "machineId",
  "poste",
  "operateur",
  "productionM2",
  "status",
  "validatedAt",
  "createdBy",
  "createdAt",
  "updatedAt",
];

const PROBAR_ATTRIBUTES = [
  "id",
  "dateFiche",
  "machine",
  "machineId",
  "poste",
  "operateur",
  "quantiteProduite",
  "statutQualite",
  "statut",
  "createdBy",
  "createdAt",
  "updatedAt",
];

function scoped(createdBy) {
  return createdBy ? { createdBy } : {};
}

function startOf(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function endExclusive(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d + 1);
}

// Une fiche PROMESH brouillon peut ne pas encore avoir de date de production :
// elle est alors rattachée à son jour de création.
function findPromesh({ from, to, createdBy }) {
  return PorPromesh.findAll({
    where: {
      ...scoped(createdBy),
      [Op.or]: [
        { dateProduction: { [Op.between]: [from, to] } },
        { dateProduction: null, createdAt: { [Op.gte]: startOf(from), [Op.lt]: endExclusive(to) } },
      ],
    },
    attributes: PROMESH_ATTRIBUTES,
    include: [CREATOR],
    raw: true,
    nest: true,
  });
}

function findProbar({ from, to, createdBy }) {
  return IndustrialRecord.findAll({
    where: { ...scoped(createdBy), module: "probar", dateFiche: { [Op.between]: [from, to] } },
    attributes: PROBAR_ATTRIBUTES,
    include: [CREATOR],
    raw: true,
    nest: true,
  });
}

async function findRecuperables({ from, to, createdBy }) {
  const fiches = await RecuperableFiche.findAll({
    where: { ...scoped(createdBy), date: { [Op.between]: [from, to] } },
    attributes: ["id", "module", "machine", "machineId", "poste", "date"],
    include: [{ model: RecuperableLigne, as: "lignes", attributes: ["dechetKg", "dechetProduitFiniKg"] }],
  });
  return fiches.map((f) => f.toJSON());
}

function findMachines() {
  return Machine.findAll({
    attributes: ["id", "code", "nom", "typeMachine", "numero", "statut"],
    order: [["typeMachine", "ASC"], ["numero", "ASC"]],
    raw: true,
  });
}

function findPromeshById(id) {
  return PorPromesh.findByPk(id, { include: [CREATOR] });
}

function findProbarById(id) {
  return IndustrialRecord.findOne({ where: { id, module: "probar" }, include: [CREATOR] });
}

module.exports = { findPromesh, findProbar, findRecuperables, findMachines, findPromeshById, findProbarById };
