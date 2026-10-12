"use strict";

const { createListProjectsTool } = require("./listProjectsTool");
const { createMoveProjectStageTool } = require("./moveProjectStageTool");
const { createAssignProjectOwnerTool } = require("./assignProjectOwnerTool");
const { createGetProjectStatisticsTool } = require("./getProjectStatisticsTool");
const { createListEngineersTool } = require("./listEngineersTool");
const { createFindCrmEntityTool } = require("./findCrmEntityTool");
const { createListPromotersTool } = require("./listPromotersTool");
const { createListCompaniesTool } = require("./listCompaniesTool");

// Périmètre volontairement limité aux 3 fonctions réellement exportées par
// modules/projects/services/project.service.js. Le reste des capacités
// Projects observables côté HTTP (fiche par id, timeline, notes, archivage,
// export Excel, champs manquants) vit directement dans les contrôleurs, pas
// dans une couche service — donc hors périmètre de "transformer les
// services existants en Tools" (voir Backend Master/src/ai/README.md).
// + get_project_statistics : analytique en lecture seule, adossée au service
// dédié modules/projects/services/projectStatistics.service.js.
// + list_engineers : ingénieurs référencés (engineerDirectory.service.js).
// + find_crm_entity : UNE personne / société précise par son nom, ou le
//   promoteur d'un projet (crmEntityDirectory.service.js).
const toolFactories = [createListProjectsTool, createMoveProjectStageTool, createAssignProjectOwnerTool, createGetProjectStatisticsTool, createListEngineersTool, createFindCrmEntityTool, createListPromotersTool, createListCompaniesTool];

module.exports = {
  toolFactories,
  createListProjectsTool,
  createMoveProjectStageTool,
  createAssignProjectOwnerTool,
  createGetProjectStatisticsTool,
  createListEngineersTool,
  createFindCrmEntityTool,
  createListPromotersTool,
  createListCompaniesTool,
};
