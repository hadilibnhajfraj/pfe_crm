"use strict";

const repo = require("../repositories/machine.repository");
const { formatMachineCode } = require("../../../utils/machineRef");

function httpError(status, message) {
  return { status, message };
}

// Violation d'unicité (code, ou couple typeMachine + numero) → 409 lisible.
function rethrowUnique(err, data) {
  if (err.name === "SequelizeUniqueConstraintError") {
    const onCode = (err.errors || []).some((e) => e.path === "code");
    throw httpError(
      409,
      onCode
        ? `Le code machine « ${data.code} » est déjà utilisé.`
        : `Une machine ${data.typeMachine} n° ${data.numero} existe déjà.`
    );
  }
  throw err;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getOrFail(id) {
  // Un id non-UUID ferait échouer la requête PostgreSQL (500) — c'est
  // simplement une machine inexistante.
  const machine = UUID_RE.test(String(id)) ? await repo.findById(id) : null;
  if (!machine) throw httpError(404, "Machine introuvable");
  return machine;
}

function listMachines(filters = {}) {
  const where = {};
  if (filters.typeMachine) where.typeMachine = filters.typeMachine;
  if (filters.statut) where.statut = filters.statut;
  return repo.findAll(where);
}

async function getMachine(id) {
  const machine = await getOrFail(id);
  const fiches = await repo.countFiches(machine.id);
  return { machine, fiches };
}

async function createMachine(body) {
  const data = {
    typeMachine: body.typeMachine,
    numero: body.numero,
    code: body.code || formatMachineCode(body.typeMachine, body.numero),
    nom: body.nom || `Machine ${body.typeMachine} ${body.numero}`,
    statut: body.statut || "ACTIVE",
    description: body.description || null,
  };
  try {
    return await repo.create(data);
  } catch (err) {
    return rethrowUnique(err, data);
  }
}

// typeMachine/numero identifient la machine pour les écrans de production
// (valeur "1".."4" du champ `machine` des fiches) : ils ne peuvent changer
// que tant qu'aucune fiche n'y est rattachée, sinon l'historique désignerait
// une autre machine que celle réellement utilisée.
async function updateMachine(id, body) {
  const machine = await getOrFail(id);

  const identityChanged =
    (body.typeMachine && body.typeMachine !== machine.typeMachine) ||
    (body.numero && body.numero !== machine.numero);
  if (identityChanged) {
    const { total } = await repo.countFiches(machine.id);
    if (total > 0) {
      throw httpError(
        409,
        `Impossible de changer le type ou le numéro de ${machine.code} : ${total} fiche(s) de production y sont rattachées.`
      );
    }
  }

  const data = { ...body };
  if (data.description === "") data.description = null;
  try {
    return await repo.update(machine, data);
  } catch (err) {
    return rethrowUnique(err, { ...machine.get(), ...data });
  }
}

// Activer / désactiver. Une machine INACTIVE reste visible avec son
// historique, mais ne peut plus recevoir de nouvelle fiche (hook
// models/helpers/machineLink.js).
async function setStatut(id, statut) {
  const machine = await getOrFail(id);
  if (machine.statut === statut) return machine;
  return repo.update(machine, { statut });
}

module.exports = { listMachines, getMachine, createMachine, updateMachine, setStatut };
