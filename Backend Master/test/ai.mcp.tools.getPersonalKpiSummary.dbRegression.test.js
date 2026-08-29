"use strict";

// AI-Business-Copilot/34_PERSONAL_KPI_SUMMARY_RBAC.md — preuve contre la
// VRAIE base de données (même discipline que
// test/project.service.listProjects.test.js et
// test/dashboard.service.getUserKPIs.test.js) : le Tool RÉEL, le service
// RÉEL, aucun mock. Le risque RBAC corrigé (getPersonalKpiSummaryTool.js::
// scopeInputForActingUser) ne peut être prouvé de façon totalement fiable
// qu'avec de vraies lignes `commercial_contacts` — un mock aurait pu
// masquer un bug dans la requête SQL elle-même (voir le WHERE de
// getPersonalKPISummary(), qui bascule entre createdBy et user_nom).
//
// Constat sur les données réelles de cet environnement (vérifié avant
// d'écrire ce test) : TOUTES les lignes `commercial_contacts` partagent le
// même `createdBy` (le compte "info@probardistribution.com") — les noms
// "najeh"/"mayssa"/"wajdi" ne sont QUE des libellés texte libre
// (`user_nom`/`user_nom_custom`), jamais des comptes `users` distincts.
// C'est PRÉCISÉMENT la raison d'être historique de `commercialName` (aucun
// autre moyen de distinguer un commercial nommé sans compte propre) — et
// EXACTEMENT pourquoi le laisser piloter le scope, sans vérifier le rôle,
// était dangereux : n'importe quel rôle "commercial" pouvait se faire
// passer, par le nom, pour n'importe quel autre commercial nommé.
require("dotenv").config();
const { sequelize } = require("../src/db");
const { createGetPersonalKpiSummaryTool } = require("../src/ai/mcp/tools/commercialContacts/getPersonalKpiSummaryTool");
const kpiService = require("../src/modules/commercial-contacts/services/commercialContactKpi.service");

afterAll(async () => {
  await sequelize.close();
});

describe("get_commercial_personal_kpi_summary — régression RBAC contre la vraie base", () => {
  test("un commercial SANS contacts propres ne peut plus récupérer les contacts d'un commercial NOMMÉ via commercialName", async () => {
    const [namedRows] = await sequelize.query(
      `SELECT "user_nom" AS name, COUNT(*)::int AS c FROM commercial_contacts WHERE "user_nom" IS NOT NULL GROUP BY "user_nom" ORDER BY c DESC LIMIT 1`
    );
    if (namedRows.length === 0) return; // pas de user_nom exploitable dans cet environnement

    const targetName = namedRows[0].name; // ex. "najeh", contacts réels attribués à ce nom
    expect(namedRows[0].c).toBeGreaterThan(0);

    // Un commercial dont l'id ne correspond à AUCUN createdBy réel (donc 0
    // contact propre) — reproduit fidèlement un compte "commercial" réel de
    // cette base qui n'a lui-même jamais créé de contact (voir
    // test@probardistribution.com dans les données réelles de cet
    // environnement), sans dépendre de son id exact.
    const attacker = { id: "00000000-0000-4000-8000-000000000000", role: "commercial" };

    const tool = createGetPersonalKpiSummaryTool();
    const result = await tool.execute({ commercialName: targetName }, { actingUser: attacker });

    // AVANT le correctif : ce même appel aurait renvoyé les VRAIS contacts
    // attribués à `targetName` (ex. 242) — la preuve directe du risque RBAC.
    // APRÈS : forcé sur createdBy = attackerId (0 ligne réelle), jamais le nom.
    expect(result.totalContacts).toBe(0);

    // Preuve directe, indépendante du Tool : la requête SQL réelle exécutée
    // pour targetName renvoie bien un total > 0 — donc le 0 obtenu ci-dessus
    // n'est pas un hasard d'environnement vide, c'est bien le scope qui a agi.
    const [[realTargetTotal]] = await sequelize.query(
      `SELECT COUNT(*)::int AS c FROM commercial_contacts WHERE "user_nom" = :name OR "user_nom_custom" = :name`,
      { replacements: { name: targetName } }
    );
    expect(realTargetTotal.c).toBeGreaterThan(0);
  }, 30000);

  test("un commercial authentique (créateur réel de lignes) obtient bien SES propres KPI, jamais 0 par excès de prudence", async () => {
    const [owners] = await sequelize.query(
      `SELECT "createdBy", COUNT(*)::int AS c FROM commercial_contacts GROUP BY "createdBy" ORDER BY c DESC LIMIT 1`
    );
    if (owners.length === 0) return; // environnement sans données — non bloquant

    const { createdBy: realOwnerId, c: expectedTotal } = owners[0];
    const owner = { id: realOwnerId, role: "commercial" };
    const tool = createGetPersonalKpiSummaryTool();

    const result = await tool.execute({}, { actingUser: owner });
    expect(result.totalContacts).toBe(expectedTotal);

    // Même en essayant de se nommer un AUTRE commercial, un vrai
    // propriétaire reste scopé à SES propres lignes (createdBy), jamais
    // celles du nom fourni.
    const [namedRows] = await sequelize.query(
      `SELECT "user_nom" AS name FROM commercial_contacts WHERE "user_nom" IS NOT NULL AND "createdBy" != :ownerId LIMIT 1`,
      { replacements: { ownerId: realOwnerId } }
    );
    const otherName = namedRows[0]?.name;
    if (otherName) {
      const resultWithOverrideAttempt = await tool.execute({ commercialName: otherName }, { actingUser: owner });
      expect(resultWithOverrideAttempt.totalContacts).toBe(expectedTotal); // inchangé — jamais le nom fourni
    }
  }, 30000);

  test("admin conserve le comportement transverse existant : commercialName reste honoré", async () => {
    const [namedRows] = await sequelize.query(
      `SELECT "user_nom" AS name, COUNT(*)::int AS c FROM commercial_contacts WHERE "user_nom" IS NOT NULL GROUP BY "user_nom" ORDER BY c DESC LIMIT 1`
    );
    if (namedRows.length === 0) return; // environnement sans données — non bloquant

    const targetName = namedRows[0].name;
    const admin = { id: "any-admin-id", role: "admin" };
    const tool = createGetPersonalKpiSummaryTool();

    const result = await tool.execute({ commercialName: targetName }, { actingUser: admin });

    const [[expected]] = await sequelize.query(
      `SELECT COUNT(*)::int AS c FROM commercial_contacts WHERE "user_nom" = :name OR "user_nom_custom" = :name`,
      { replacements: { name: targetName } }
    );
    expect(result.totalContacts).toBe(expected.c);
    expect(result.totalContacts).toBeGreaterThan(0); // preuve que ce n'est pas un 0 accidentel
  }, 30000);

  test("garde-fou anti-régression sur getPersonalKPISummary() elle-même (service réel, inchangé) — createdBy seul reste la voie sûre", async () => {
    const nonExistentUserId = "00000000-0000-4000-8000-000000000000";
    const summary = await kpiService.getPersonalKPISummary(nonExistentUserId, null);
    expect(summary.totalContacts).toBe(0);
  }, 30000);
});
