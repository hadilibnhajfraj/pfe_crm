"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const machineService = require("../../../../modules/machines/services/machine.service");

// Machines de production (référentiel `machines`, PROBAR + PROMESH), en
// LECTURE SEULE. Même ouverture que GET /machines (tout utilisateur connecté :
// la liste alimente aussi les demandes de maintenance) et mêmes champs non
// sensibles (code, nom, type, numéro, statut). Aucune écriture : la gestion
// du référentiel reste dans les routes /machines.
function createListMachinesTool() {
  return new ServiceBackedTool({
    name: "list_machines",
    description: "Machines réelles du référentiel de production (PROBAR et PROMESH) : code, nom, type et statut, filtrables par type ou statut.",
    inputSchema: Joi.object({
      typeMachine: Joi.string().uppercase().valid("PROBAR", "PROMESH").optional(),
      statut: Joi.string().uppercase().valid("ACTIVE", "INACTIVE").optional(),
    }),
    requiredRoles: [],
    run: async (input) => {
      const machines = await machineService.listMachines(input);
      const items = machines.map((m) => {
        const row = m.toJSON ? m.toJSON() : m;
        return { id: row.id, code: row.code, nom: row.nom, typeMachine: row.typeMachine, numero: row.numero, statut: row.statut };
      });
      return { operation: "list", items, total: items.length, offset: 0, truncated: false };
    },
  });
}

module.exports = { createListMachinesTool };
