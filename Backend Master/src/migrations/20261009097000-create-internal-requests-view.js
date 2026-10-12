"use strict";

// Lot 8 — Vue de lecture qui réunit les trois types de demandes internes
// existants (maintenance, RH, archivage de projets) sous des colonnes
// communes, avec un code de statut normalisé. Pour Power BI et le Copilot.
//
// PRÉREQUIS : lots 1 (dataStatus), 5 et 6 (nouvelles valeurs de statut).
//
// Aucune table créée ni modifiée : il n'existe pas de module générique de
// demandes internes, et il n'en est pas créé. Une vue n'occupe pas de place
// et ne contient aucune donnée propre.
//
// Idempotente (CREATE OR REPLACE). down supprime la vue.

const VIEW = `CREATE OR REPLACE VIEW "internal_requests_v" AS
  SELECT 'maintenance'::text AS "module", m."id" AS "requestId", m."ticketNo"::text AS "numero", m."userId" AS "demandeurId",
         m."technicianId" AS "responsableId", m."statut"::text AS "statut",
         CASE m."statut"::text
           WHEN 'en_attente' THEN 'EN_ATTENTE' WHEN 'acceptee' THEN 'PLANIFIEE' WHEN 'planifiee' THEN 'PLANIFIEE'
           WHEN 'en_cours' THEN 'EN_COURS' WHEN 'terminee' THEN 'TERMINEE' WHEN 'refusee' THEN 'ANNULEE' WHEN 'annulee' THEN 'ANNULEE'
         END AS "statusCode",
         m."urgence"::text AS "priorite", m."createdAt", m."completedAt" AS "closedAt", m."dataStatus"
    FROM "maintenance_requests" m
  UNION ALL
  SELECT 'rh'::text, h."id", h."ticketNo"::text, h."requestedBy", h."reviewedBy", h."statut"::text,
         CASE h."statut"::text
           WHEN 'brouillon' THEN 'DRAFT' WHEN 'en_attente' THEN 'SUBMITTED' WHEN 'en_revue' THEN 'IN_REVIEW' WHEN 'acceptee' THEN 'APPROVED'
           WHEN 'refusee' THEN 'REJECTED' WHEN 'annulee' THEN 'CANCELLED' WHEN 'traitee' THEN 'COMPLETED'
         END,
         NULL::text, h."createdAt", h."processedAt", h."dataStatus"
    FROM "hr_requests" h
  UNION ALL
  SELECT 'archivage'::text, a."id", NULL::text, a."userId", a."adminId", a."status"::text,
         CASE a."status"::text WHEN 'pending' THEN 'SUBMITTED' WHEN 'approved' THEN 'APPROVED' WHEN 'rejected' THEN 'REJECTED' END,
         NULL::text, a."createdAt", COALESCE(a."approvedAt", a."rejectedAt"), a."dataStatus"
    FROM "archive_requests" a`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(VIEW);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP VIEW IF EXISTS "internal_requests_v"`);
  },
};
