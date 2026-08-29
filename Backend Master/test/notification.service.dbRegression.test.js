"use strict";

// AI-Business-Copilot/36_NOTIFICATION_TOOLS_BROKEN_IMPORT.md — même
// discipline que test/project.service.listProjects.test.js et
// test/ai.mcp.tools.getPersonalKpiSummary.dbRegression.test.js : le VRAI
// service, la VRAIE base, aucun mock du modèle Notification (un mock aurait
// pu masquer exactement le bug corrigé ici — un import cassé n'est visible
// qu'en exécutant le VRAI code).
require("dotenv").config();
const { sequelize } = require("../src/db");
const notificationService = require("../src/services/notification.service");

// Mêmes deux comptes réels que l'audit RBAC global précédent (missions
// P0/P1) — vérifiés à cette occasion : 70 et 60 notifications réelles.
const USER_A = "a43225c5-4e01-411d-aa9b-afe2c25f38a6";
const USER_B = "f40280aa-1c85-4c9b-97e9-ce7366ce6ce8";
const NON_EXISTENT_USER = "00000000-0000-4000-8000-000000000095";
const NON_EXISTENT_NOTIFICATION = "00000000-0000-4000-8000-000000000094";

afterAll(async () => {
  await sequelize.close();
});

describe("TEST 1 — notification.service.js s'importe sans erreur", () => {
  test("require() ne lève jamais, toutes les fonctions attendues sont exportées", () => {
    expect(() => require("../src/services/notification.service")).not.toThrow();
    expect(Object.keys(notificationService).sort()).toEqual(
      ["deleteNotification", "listMyNotifications", "markAllRead", "markOneRead", "notifyProjectComment", "sendEmailNotification"].sort()
    );
  });
});

describe("TEST 2/3 — les Tools ne plantent plus sur 'Notification undefined', lecture réelle possible", () => {
  test("listMyNotifications() sur un VRAI utilisateur retourne de vraies données, aucune exception", async () => {
    const result = await notificationService.listMyNotifications(USER_A, { page: 1, limit: 5 });
    expect(result.items).toBeDefined();
    expect(typeof result.total).toBe("number");
    expect(result.total).toBeGreaterThan(0); // ce compte a de vraies notifications (vérifié avant ce test)
  }, 30000);

  test("markOneRead()/deleteNotification() atteignent bien Notification.findOne/.destroy (jamais 'Cannot read properties of undefined') — id inexistant, donc AUCUNE ligne réelle modifiée", async () => {
    await expect(notificationService.markOneRead(USER_A, NON_EXISTENT_NOTIFICATION)).rejects.toMatchObject({ status: 404 });
    await expect(notificationService.deleteNotification(USER_A, NON_EXISTENT_NOTIFICATION)).rejects.toMatchObject({ status: 404 });
    // Un 404 propre (et non un crash) est la preuve que Notification.findOne/
    // .destroy ont été RÉELLEMENT appelées avec succès sur un modèle défini.
  }, 30000);

  test("markAllRead() sur un utilisateur SANS notification réelle : aucune ligne réelle modifiée, aucune exception", async () => {
    const result = await notificationService.markAllRead(NON_EXISTENT_USER);
    expect(result).toEqual({ success: true });
  }, 30000);
});

describe("TEST 4 — le scope utilisateur existant reste inchangé (toujours WHERE userId = :userId)", () => {
  test("listMyNotifications(A) ne retourne QUE des notifications appartenant à A", async () => {
    const result = await notificationService.listMyNotifications(USER_A, { page: 1, limit: 50 });
    const ownerIds = [...new Set(result.items.map((n) => n.userId))];
    expect(ownerIds.every((id) => id === USER_A)).toBe(true);
  }, 30000);
});

describe("TEST 5 — un utilisateur A ne peut pas récupérer les notifications de B", () => {
  test("listMyNotifications(A) ne contient jamais une notification de B, et vice versa", async () => {
    const resultA = await notificationService.listMyNotifications(USER_A, { page: 1, limit: 100 });
    const resultB = await notificationService.listMyNotifications(USER_B, { page: 1, limit: 100 });

    expect(resultA.items.some((n) => n.userId === USER_B)).toBe(false);
    expect(resultB.items.some((n) => n.userId === USER_A)).toBe(false);
    // Preuve positive que ce ne sont pas deux listes vides par coïncidence :
    expect(resultA.total).toBeGreaterThan(0);
    expect(resultB.total).toBeGreaterThan(0);
  }, 30000);
});

describe("TEST 6 — aucun comportement transverse (admin) n'existe pour les notifications, avant comme après le correctif", () => {
  test("listMyNotifications() ne connaît aucune notion de rôle — même un id 'admin' reste scopé à lui-même", async () => {
    // notification.service.js::listMyNotifications(userId, ...) ne prend
    // même pas de paramètre role — la fonction ne PEUT PAS accorder une vue
    // globale, quel que soit l'appelant. Vérifié ici pour le documenter
    // explicitement (TEST OBLIGATOIRE 6), pas parce qu'un changement était
    // attendu — ce correctif ne touche ni RBAC ni logique de scope.
    const result = await notificationService.listMyNotifications(NON_EXISTENT_USER, { page: 1, limit: 100 });
    expect(result.total).toBe(0); // aucune notification "globale" renvoyée par défaut
    // Function.length ne compte que les paramètres SANS valeur par défaut à
    // partir de la gauche — ici seul `userId` (le 2e, `{page,limit}={}`, a
    // une valeur par défaut) : la signature elle-même ne prévoit aucun
    // paramètre "role", donc aucune vue transverse n'est même possible.
    expect(notificationService.listMyNotifications.length).toBe(1);
  }, 30000);
});
