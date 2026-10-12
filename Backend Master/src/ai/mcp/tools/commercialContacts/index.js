"use strict";

const { createGetCommercialContactKpiTool } = require("./getCommercialContactKpiTool");
const { createGetCommercialContactAnalyticsTool } = require("./getCommercialContactAnalyticsTool");
const { createGetPersonalKpiSummaryTool } = require("./getPersonalKpiSummaryTool");
const { createGetMyCommercialContactsTool } = require("./getMyCommercialContactsTool");
const { createScheduleCommercialContactRelanceTool } = require("./scheduleCommercialContactRelanceTool");
const { createGetCommercialContactStatisticsTool } = require("./getCommercialContactStatisticsTool");

// Périmètre limité au service KPI (modules/commercial-contacts/services/) —
// le CRUD des contacts/relances/actions vit dans la couche legacy
// src/routes/commercial_contacts.routes.js, hors périmètre de "transformer
// les services existants en Tools" (voir Backend Master/src/ai/README.md).
// `get_my_commercial_contacts` (mission "EXPOSER LA LISTE DES CONTACTS À
// RELANCER AU COPILOT") reste dans ce même périmètre : lecture seule,
// service KPI existant étendu (listCommercialContacts), aucun CRUD ajouté.
// `schedule_commercial_contact_relance` (mission "CORRIGER LES ACTIONS
// COMMERCIALES DEPUIS LA LISTE DES CONTACTS") est la SEULE écriture de ce
// module — extraction fidèle de la logique déjà réelle de
// `POST /:id/relances` (voir commercialContactRelance.service.js), jamais
// appelée directement par le LLM : uniquement via le cycle PendingAction de
// CommercialAgent (propose -> confirmation explicite -> exécution).
const toolFactories = [
  createGetCommercialContactKpiTool,
  createGetCommercialContactAnalyticsTool,
  createGetPersonalKpiSummaryTool,
  createGetMyCommercialContactsTool,
  createScheduleCommercialContactRelanceTool,
  createGetCommercialContactStatisticsTool,
];

module.exports = {
  toolFactories,
  createGetCommercialContactKpiTool,
  createGetCommercialContactAnalyticsTool,
  createGetPersonalKpiSummaryTool,
  createGetMyCommercialContactsTool,
  createScheduleCommercialContactRelanceTool,
  createGetCommercialContactStatisticsTool,
};
