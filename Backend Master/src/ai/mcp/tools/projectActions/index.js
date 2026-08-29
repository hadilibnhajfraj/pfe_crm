"use strict";

const { createCreateProjectActionTool } = require("./createProjectActionTool");

// Périmètre volontairement limité à `createAction` — la seule fonction de
// modules/project-actions/services/projectAction.service.js qui comble un
// vrai écart (voir SMART_SUGGESTIONS.md, "création d'activité"/"création de
// rappel" n'avaient encore aucun Tool). `updateAction`/`deleteAction`/les
// types d'action restent hors périmètre : aucune capacité IA ne les demande
// à ce jour.
const toolFactories = [createCreateProjectActionTool];

module.exports = {
  toolFactories,
  createCreateProjectActionTool,
};
