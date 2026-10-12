"use strict";

// Manifeste racine — un sous-dossier par module métier (voir
// AI-Business-Copilot/00_PLAN_DEVELOPPEMENT.md et Backend Master/src/ai/README.md
// pour la correspondance module ↔ services existants). Chaque sous-dossier
// exporte sa propre liste `toolFactories`, agrégée ici en une seule liste
// consommée par ToolLoader (../toolLoader.js) — explicite, pas d'auto-
// discovery filesystem : ajouter un Tool est un diff reviewable, jamais un
// fichier silencieusement ramassé.
const users = require("./users");
const notifications = require("./notifications");
const pipeline = require("./pipeline");
const projects = require("./projects");
const projectActions = require("./projectActions");
const commercialContacts = require("./commercialContacts");
const maintenance = require("./maintenance");
const industrial = require("./industrial");
const porPromesh = require("./porPromesh");
const dashboard = require("./dashboard");
const hr = require("./hr");
const googleCalendar = require("./googleCalendar");
// Recherche Web contrôlée (informations publiques) — ne lit aucune donnée CRM.
const web = require("./web");

const defaultToolFactories = [
  ...users.toolFactories,
  ...notifications.toolFactories,
  ...pipeline.toolFactories,
  ...projects.toolFactories,
  ...projectActions.toolFactories,
  ...commercialContacts.toolFactories,
  ...maintenance.toolFactories,
  ...industrial.toolFactories,
  ...porPromesh.toolFactories,
  ...dashboard.toolFactories,
  ...hr.toolFactories,
  ...googleCalendar.toolFactories,
  ...web.toolFactories,
];

module.exports = {
  defaultToolFactories,
  byModule: {
    users,
    notifications,
    pipeline,
    projects,
    projectActions,
    commercialContacts,
    maintenance,
    industrial,
    porPromesh,
    dashboard,
    hr,
    googleCalendar,
    web,
  },
};
