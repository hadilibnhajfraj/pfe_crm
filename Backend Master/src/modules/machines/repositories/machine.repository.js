"use strict";

const { Machine, IndustrialRecord, PorPromesh, RecuperableFiche } = require("../../../models/associations");

function findAll(where = {}) {
  return Machine.findAll({ where, order: [["typeMachine", "ASC"], ["numero", "ASC"]] });
}

function findById(id) {
  return Machine.findByPk(id);
}

function create(data) {
  return Machine.create(data);
}

function update(instance, data) {
  return instance.update(data);
}

// Nombre de fiches de production rattachées — détermine si le type/numéro
// d'une machine peut encore changer sans réécrire l'historique.
async function countFiches(machineId) {
  const where = { machineId };
  const [production, porPromesh, recuperables] = await Promise.all([
    IndustrialRecord.count({ where }),
    PorPromesh.count({ where }),
    RecuperableFiche.count({ where }),
  ]);
  return { production, porPromesh, recuperables, total: production + porPromesh + recuperables };
}

module.exports = { findAll, findById, create, update, countFiches };
