"use strict";

const { createAutoCreationAutomation } = require("./autoCreationAutomation");
const { createReminderAutomation } = require("./reminderAutomation");
const { createEmailAutomation } = require("./emailAutomation");
const { createNotificationHousekeepingAutomation } = require("./notificationHousekeepingAutomation");
const { createGoogleCalendarAutomation } = require("./googleCalendarAutomation");
const { createAnalysisAutomation } = require("./analysisAutomation");
const { createRecommendationAutomation } = require("./recommendationAutomation");
const { createDataQualityAutomation } = require("./dataQualityAutomation");

// Manifeste explicite des 8 automatisations demandées — même discipline que
// mcp/tools/index.js::defaultToolFactories et agents/manifest.js : une liste
// réviewable, pas une découverte automatique de fichiers.
const defaultAutomationFactories = [
  createAutoCreationAutomation,
  createReminderAutomation,
  createEmailAutomation,
  createNotificationHousekeepingAutomation,
  createGoogleCalendarAutomation,
  createAnalysisAutomation,
  createRecommendationAutomation,
  createDataQualityAutomation,
];

// Contrairement à agents/manifest.js::loadDefaultAgents (qui peuple un
// AgentRegistry sélectionné par intention détectée), les automatisations ne
// sont jamais choisies dynamiquement à partir d'un message utilisateur :
// elles sont déclenchées explicitement, par nom, par un ordonnanceur ou une
// action admin — d'où une simple Map nom -> instance plutôt qu'un registre
// avec canHandle()/findHandler().
function createDefaultAutomations(deps) {
  const automations = defaultAutomationFactories.map((factory) => factory(deps));
  return new Map(automations.map((automation) => [automation.name, automation]));
}

module.exports = { defaultAutomationFactories, createDefaultAutomations };
