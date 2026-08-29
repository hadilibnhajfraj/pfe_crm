"use strict";

// Audit performance : deux tables filtrées à chaque requête sur des
// colonnes non indexées (une contrainte de clé étrangère ne crée PAS
// d'index automatiquement en PostgreSQL — seule `commercialId` avait un
// index sur `commercial_contacts`, confirmé sur la base réelle).
//
// - `commercial_contacts.createdBy` : filtre principal de
//   `GET /commercial-contacts` (portée "mes contacts") et de
//   `commercialContactKpi.service.js` — aucun index, uniquement une FK.
// - `project_reminders` : aucun index du tout au-delà de la clé primaire,
//   alors que `project.repository.js` la interroge par
//   `WHERE "projectId" = ... AND "dateRelance" >= NOW()` en sous-requête
//   corrélée, une fois par ligne de projet affichée (liste projets, kanban).
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex("commercial_contacts", ["createdBy"], {
      name: "commercial_contacts_created_by_idx",
    });

    await queryInterface.addIndex("project_reminders", ["projectId", "dateRelance"], {
      name: "project_reminders_project_id_date_relance",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("commercial_contacts", "commercial_contacts_created_by_idx");
    await queryInterface.removeIndex("project_reminders", "project_reminders_project_id_date_relance");
  },
};
