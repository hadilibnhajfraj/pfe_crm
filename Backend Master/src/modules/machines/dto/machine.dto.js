"use strict";

function toMachineResponse(machine, fiches) {
  if (!machine) return null;
  const m = machine.toJSON ? machine.toJSON() : machine;
  return {
    id: m.id,
    code: m.code,
    nom: m.nom,
    typeMachine: m.typeMachine,
    numero: m.numero,
    statut: m.statut,
    description: m.description,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    ...(fiches ? { fiches } : {}),
  };
}

function toMachineList(machines) {
  return machines.map((m) => toMachineResponse(m));
}

module.exports = { toMachineResponse, toMachineList };
