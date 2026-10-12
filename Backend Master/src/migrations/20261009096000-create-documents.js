"use strict";

// Lot 7 — Gestion documentaire : la fiche descriptive (documents) séparée du
// fichier (document_files).
//
// PRÉREQUIS : lots 1 (dataStatus), 5 (maintenance_interventions) et 6
// (employees), dont ces tables référencent les lignes.
//
// Les deux tables sont créées VIDES. La copie des 21 références existantes
// (devis, pièces d'action, pièces et photos PROMESH) est faite ensuite par
// scripts/restructureDataApply.js, journalisée, sur le serveur qui détient le
// vrai dossier uploads. Les anciennes colonnes (fileUrl, photoNonConformite…)
// ne sont ni supprimées ni modifiées, et restent la source lue par
// l'application. Aucun fichier n'est déplacé ni supprimé.
//
// Un document est rattaché par des clés étrangères explicites (au moins une) :
// la base garantit qu'il ne pointe jamais vers une ligne inexistante.
// Ces clés partent de `documents` ; les tables clients, sociétés et contacts
// ne sont pas modifiées.
//
// Idempotente. down supprime les deux tables et s'arrête si elles contiennent
// des lignes.

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await q(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_documents_categorie') THEN
          CREATE TYPE "enum_documents_categorie" AS ENUM ('DEVIS', 'BON_DE_COMMANDE', 'PIECE_ACTION', 'PRODUCTION', 'JUSTIFICATIF_RH', 'PHOTO_MAINTENANCE', 'AUTRE');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_document_files_storage_status') THEN
          CREATE TYPE "enum_document_files_storage_status" AS ENUM ('PRESENT', 'MISSING', 'UNKNOWN');
        END IF;
      END $$;`);

      await q(`CREATE TABLE IF NOT EXISTS "documents" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "titre" VARCHAR(255) NOT NULL,
        "categorie" "enum_documents_categorie" NOT NULL DEFAULT 'AUTRE',
        "description" TEXT,
        "projectId" UUID REFERENCES "projects" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
        "companyId" UUID REFERENCES "companies" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
        "clientId" INTEGER REFERENCES "clients" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
        "contactId" UUID REFERENCES "commercial_contacts" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
        "employeeId" UUID REFERENCES "employees" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
        "hrRequestId" UUID REFERENCES "hr_requests" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
        "maintenanceRequestId" UUID REFERENCES "maintenance_requests" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
        "maintenanceInterventionId" UUID REFERENCES "maintenance_interventions" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
        "porPromeshId" UUID REFERENCES "por_promesh" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
        "industrialRecordId" UUID REFERENCES "industrial_records" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
        "createdBy" UUID REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
        "dataStatus" "enum_data_status" NOT NULL DEFAULT 'REAL',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "documents_has_owner" CHECK (
          num_nonnulls("projectId", "companyId", "clientId", "contactId", "employeeId", "hrRequestId", "maintenanceRequestId",
                       "maintenanceInterventionId", "porPromeshId", "industrialRecordId") >= 1
        )
      )`);
      for (const column of ["projectId", "companyId", "clientId", "contactId", "employeeId", "hrRequestId", "maintenanceRequestId", "maintenanceInterventionId", "porPromeshId", "industrialRecordId"]) {
        await q(`CREATE INDEX IF NOT EXISTS "documents_${column}" ON "documents" ("${column}") WHERE "${column}" IS NOT NULL`);
      }
      await q(`CREATE INDEX IF NOT EXISTS "documents_categorie" ON "documents" ("categorie")`);

      await q(`CREATE TABLE IF NOT EXISTS "document_files" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "documentId" UUID NOT NULL REFERENCES "documents" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
        "fileUrl" VARCHAR(1024) NOT NULL UNIQUE,
        "originalName" VARCHAR(255),
        "mimeType" VARCHAR(120),
        "extension" VARCHAR(20),
        "sizeBytes" BIGINT,
        "checksum" VARCHAR(64),
        "storageStatus" "enum_document_files_storage_status" NOT NULL DEFAULT 'UNKNOWN',
        "sourceTable" VARCHAR(64),
        "sourceColumn" VARCHAR(64),
        "sourceRecordId" VARCHAR(64),
        "uploadedBy" UUID REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
        "uploadedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "document_files_size_non_negative" CHECK ("sizeBytes" IS NULL OR "sizeBytes" >= 0)
      )`);
      await q(`CREATE INDEX IF NOT EXISTS "document_files_document_id" ON "document_files" ("documentId")`);
    });
  },

  async down(queryInterface) {
    const one = async (sql) => (await queryInterface.sequelize.query(sql))[0][0];
    if ((await one(`SELECT to_regclass('public.documents') IS NOT NULL AS exists`)).exists) {
      const { n } = await one(`SELECT COUNT(*)::int AS n FROM "documents"`);
      if (n) throw new Error(`${n} document(s) existent : annulation refusée. Les anciennes colonnes restent la source ; videz d'abord ces tables si c'est voulu.`);
    }
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await q(`DROP TABLE IF EXISTS "document_files"`);
      await q(`DROP TABLE IF EXISTS "documents"`);
      await q(`DROP TYPE IF EXISTS "enum_document_files_storage_status"`);
      await q(`DROP TYPE IF EXISTS "enum_documents_categorie"`);
    });
  },
};
