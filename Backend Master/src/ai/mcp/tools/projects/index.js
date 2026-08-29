"use strict";

const { createListProjectsTool } = require("./listProjectsTool");
const { createMoveProjectStageTool } = require("./moveProjectStageTool");
const { createAssignProjectOwnerTool } = require("./assignProjectOwnerTool");

// Périmètre volontairement limité aux 3 fonctions réellement exportées par
// modules/projects/services/project.service.js. Le reste des capacités
// Projects observables côté HTTP (fiche par id, timeline, notes, archivage,
// export Excel, champs manquants) vit directement dans les contrôleurs, pas
// dans une couche service — donc hors périmètre de "transformer les
// services existants en Tools" (voir Backend Master/src/ai/README.md).
const toolFactories = [createListProjectsTool, createMoveProjectStageTool, createAssignProjectOwnerTool];

module.exports = {
  toolFactories,
  createListProjectsTool,
  createMoveProjectStageTool,
  createAssignProjectOwnerTool,
};
