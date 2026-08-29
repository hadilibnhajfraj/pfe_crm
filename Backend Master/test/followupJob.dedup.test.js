"use strict";

// Regression test for a critical performance/cost bug found via real
// production-data analysis (audit performance) : checkFollowup() runs every
// minute (node-cron) and, for every contact with no email or no same-day
// relance, created a FRESH "FOLLOWUP_MISSING" Notification (and sent a
// REAL email) on every single tick — no deduplication at all. Confirmed in
// the real dev database: a single unresolved contact produced 12+ million
// notification rows over ~80 days (peak 2579/minute), a 3GB table, and
// query times of >1.3s for a simple paginated notification list (see
// Performance_Report.md). Fixed by pre-loading which contacts already got
// a FOLLOWUP_MISSING notification TODAY and skipping both the email and
// the notification for those.
//
// node-cron is mocked so require()'ing this file NEVER schedules the real
// cron (AUTO_EMAIL_JOBS_ENABLED=true is set in this project's local .env —
// a raw `require()` of this file outside Jest is unsafe, see
// Performance_Report.md "Comment ce constat a été vérifié").

jest.mock("node-cron", () => ({ schedule: jest.fn() }));
jest.mock("../src/services/email.service", () => ({ sendEmail: jest.fn() }));
jest.mock("../src/services/whatsapp.service", () => ({ sendWhatsappMessage: jest.fn() }));
jest.mock("../src/services/calendar.service", () => ({ combineDateTime: jest.fn() }));
jest.mock("../src/services/followupAutomation.service", () => ({
  clientName: jest.fn((c) => c.nom),
  resolveProjectName: jest.fn(),
}));
jest.mock("../src/socket", () => ({ emitToUser: jest.fn() }));
jest.mock("../src/services/projectActionCalendar.service", () => ({ actionLabel: jest.fn() }));
jest.mock("../src/services/projectActionCalendarSync.service", () => ({ resolveOwnerInfo: jest.fn() }));

jest.mock("../src/models/CommercialContactRelance", () => ({ findAll: jest.fn() }));
jest.mock("../src/models/CommercialContact", () => ({ findAll: jest.fn(), findByPk: jest.fn() }));
jest.mock("../src/models/Notification", () => ({ findAll: jest.fn(), create: jest.fn() }));
jest.mock("../src/models/User", () => ({ findOne: jest.fn() }));
jest.mock("../src/models/UserProfile", () => ({ findAll: jest.fn(), findOne: jest.fn() }));
jest.mock("../src/models/ProjectAction", () => ({ findAll: jest.fn() }));
jest.mock("../src/models/Project", () => ({ findByPk: jest.fn() }));

const { checkFollowup } = require("../src/cron/followup.job");
const CommercialContact = require("../src/models/CommercialContact");
const CommercialContactRelance = require("../src/models/CommercialContactRelance");
const Notification = require("../src/models/Notification");
const { sendEmail } = require("../src/services/email.service");

const CONTACT_NO_EMAIL = { id: "c1", nom: "SansEmail", email: null, createdBy: "u1" };
const CONTACT_NO_RELANCE = { id: "c2", nom: "SansRelance", email: "c2@x.com", createdBy: "u2" };
const CONTACT_WITH_RELANCE_TODAY = { id: "c3", nom: "ADEL", prenom: "", email: "c3@x.com", createdBy: "u3" };

beforeEach(() => {
  jest.clearAllMocks();
  CommercialContactRelance.findAll.mockResolvedValue([]);
  Notification.create.mockResolvedValue({});
  sendEmail.mockResolvedValue({ success: true });
});

describe("checkFollowup — déduplication FOLLOWUP_MISSING (correctif performance)", () => {
  test("un contact sans email : notifié une seule fois si déjà notifié aujourd'hui, jamais deux fois dans le même run", async () => {
    CommercialContact.findAll.mockResolvedValue([CONTACT_NO_EMAIL]);
    Notification.findAll.mockResolvedValue([]); // rien encore aujourd'hui

    await checkFollowup();

    expect(Notification.create).toHaveBeenCalledTimes(1);
    expect(Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "FOLLOWUP_MISSING", commercialContactId: "c1" })
    );
  });

  test("un contact déjà notifié aujourd'hui (résultat du garde-fou) n'est ni ré-emailé ni ré-notifié", async () => {
    CommercialContact.findAll.mockResolvedValue([CONTACT_NO_RELANCE]);
    // Simule le résultat de la requête de déduplication : c2 a déjà reçu
    // une notification FOLLOWUP_MISSING plus tôt dans la journée.
    Notification.findAll.mockResolvedValue([{ commercialContactId: "c2" }]);

    await checkFollowup();

    expect(sendEmail).not.toHaveBeenCalled();
    expect(Notification.create).not.toHaveBeenCalled();
  });

  test("le contact sans relance planifiée est notifié une seule fois s'il n'a pas encore été notifié aujourd'hui — JAMAIS emailé (désactivation client)", async () => {
    CommercialContact.findAll.mockResolvedValue([CONTACT_NO_RELANCE]);
    Notification.findAll.mockResolvedValue([]);

    await checkFollowup();

    expect(sendEmail).not.toHaveBeenCalled();
    expect(Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "FOLLOWUP_MISSING", commercialContactId: "c2" })
    );
  });

  test("la requête de déduplication filtre par type=FOLLOWUP_MISSING et createdAt >= début de journée", async () => {
    CommercialContact.findAll.mockResolvedValue([]);
    Notification.findAll.mockResolvedValue([]);

    await checkFollowup();

    expect(Notification.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: "FOLLOWUP_MISSING" }),
        attributes: ["commercialContactId"],
      })
    );
  });
});

describe("checkFollowup — désactivation complète de l'envoi d'email aux CLIENTS", () => {
  test("un contact avec une relance planifiée AUJOURD'HUI : follow-up détecté/enregistré, mais sendEmail() JAMAIS appelé", async () => {
    CommercialContact.findAll.mockResolvedValue([CONTACT_WITH_RELANCE_TODAY]);
    Notification.findAll.mockResolvedValue([]);
    const relance = {
      commercialContactId: "c3",
      emailSent: false,
      createdBy: "u3",
      save: jest.fn().mockResolvedValue(undefined),
    };
    CommercialContactRelance.findAll.mockResolvedValue([relance]);

    await checkFollowup();

    // Preuve directe de la désactivation : aucune tentative SMTP, quelle
    // que soit la branche (relance du jour ou absence de relance).
    expect(sendEmail).not.toHaveBeenCalled();

    // Le follow-up reste détecté/enregistré : dedup flag posé, Notification créée.
    expect(relance.emailSent).toBe(true);
    expect(relance.save).toHaveBeenCalledTimes(1);
    expect(Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "FOLLOWUP", userId: "u3" })
    );
    // Jamais de Notification "erreur d'envoi" — l'envoi n'a jamais été tenté.
    expect(Notification.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "FOLLOWUP_ERROR" })
    );
  });

  test("une relance déjà traitée aujourd'hui (emailSent=true) n'est ni ré-emailée ni re-notifiée", async () => {
    CommercialContact.findAll.mockResolvedValue([CONTACT_WITH_RELANCE_TODAY]);
    Notification.findAll.mockResolvedValue([]);
    const relance = { commercialContactId: "c3", emailSent: true, createdBy: "u3", save: jest.fn() };
    CommercialContactRelance.findAll.mockResolvedValue([relance]);

    await checkFollowup();

    expect(sendEmail).not.toHaveBeenCalled();
    expect(relance.save).not.toHaveBeenCalled();
    expect(Notification.create).not.toHaveBeenCalled();
  });

  test("aucun contact, quel que soit son état (email valide, relance en retard, relances multiples), ne déclenche jamais sendEmail", async () => {
    const contacts = [
      CONTACT_NO_EMAIL,
      CONTACT_NO_RELANCE,
      CONTACT_WITH_RELANCE_TODAY,
      { id: "c4", nom: "TRABELSI", email: "c4@x.com", createdBy: "u4" },
      { id: "c5", nom: "MME", email: "c5@x.com", createdBy: "u5" },
    ];
    CommercialContact.findAll.mockResolvedValue(contacts);
    Notification.findAll.mockResolvedValue([]);
    CommercialContactRelance.findAll.mockResolvedValue([
      { commercialContactId: "c3", emailSent: false, createdBy: "u3", save: jest.fn().mockResolvedValue(undefined) },
    ]);

    await checkFollowup();

    expect(sendEmail).not.toHaveBeenCalled();
  });
});
