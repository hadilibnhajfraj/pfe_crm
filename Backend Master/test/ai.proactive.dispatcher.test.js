"use strict";

const { AlertDispatcher, ALERT_NOTIFICATION_TYPE, SOCKET_EVENT, WORKFLOW_STATUS_PENDING } = require("../src/ai/proactive/alertDispatcher");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");

function alert(overrides = {}) {
  return { domain: "projects", subject: "Projet en retard", severity: "critique", explanation: "P", suggestion: "S", suggestedActions: [], workflowTemplate: null, ...overrides };
}

function notifyTool(impl) {
  return { name: "send_notification_email", invoke: jest.fn(impl || (async () => JSON.stringify({ success: true }))) };
}

const ADMIN1 = { id: "u1", email: "admin1@cbi.tn" };
const ADMIN2 = { id: "u2", email: "admin2@cbi.tn" };

describe("AlertDispatcher — envoie réellement, via les 2 SEULS canaux réels", () => {
  test("appelle send_notification_email avec les VRAIS champs attendus par le Tool", async () => {
    const tool = notifyTool();
    const dispatcher = new AlertDispatcher({ notifyTool: tool });

    await dispatcher.dispatch([alert()], [ADMIN1]);

    expect(tool.invoke).toHaveBeenCalledWith({
      toUserId: "u1",
      emailTo: "admin1@cbi.tn",
      fromName: "Copilot IA CBI Tunisia",
      subject: "Projet en retard",
      message: expect.stringContaining("Analyse : P"),
      type: ALERT_NOTIFICATION_TYPE,
    });
  });

  test("pousse aussi un événement temps réel dédié (jamais un canal générique) via emitToUser — payload = alerte + workflow:null sans template", async () => {
    const emitToUser = jest.fn();
    const dispatcher = new AlertDispatcher({ notifyTool: notifyTool(), emitToUser });

    const oneAlert = alert();
    await dispatcher.dispatch([oneAlert], [ADMIN1]);

    const { workflowTemplate, ...expectedPublicAlert } = oneAlert;
    expect(emitToUser).toHaveBeenCalledWith("u1", SOCKET_EVENT, { ...expectedPublicAlert, workflow: null });
  });

  test("chaque alerte est envoyée à CHAQUE destinataire — N alertes x M destinataires envois", async () => {
    const tool = notifyTool();
    const dispatcher = new AlertDispatcher({ notifyTool: tool });

    const result = await dispatcher.dispatch([alert({ subject: "A" }), alert({ subject: "B" })], [ADMIN1, ADMIN2]);

    expect(tool.invoke).toHaveBeenCalledTimes(4);
    expect(result.sent).toHaveLength(4);
    expect(result.alertsCount).toBe(2);
    expect(result.recipientsCount).toBe(2);
  });

  test("sans notifyTool fourni : ne plante jamais, saute simplement l'envoi e-mail", async () => {
    const dispatcher = new AlertDispatcher({});
    const result = await dispatcher.dispatch([alert()], [ADMIN1]);
    expect(result.sent).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });

  test("sans emitToUser fourni : ne plante jamais, saute simplement le push temps réel", async () => {
    const dispatcher = new AlertDispatcher({ notifyTool: notifyTool() });
    const result = await dispatcher.dispatch([alert()], [ADMIN1]);
    expect(result.sent).toHaveLength(1);
  });
});

describe("AlertDispatcher — jamais bloquant, jamais tout-ou-rien", () => {
  test("un envoi qui échoue est consigné dans errors, sans empêcher les autres envois", async () => {
    const tool = notifyTool(async (input) => {
      if (input.toUserId === "u2") throw new Error("adresse invalide");
      return JSON.stringify({ success: true });
    });
    const dispatcher = new AlertDispatcher({ notifyTool: tool });

    const result = await dispatcher.dispatch([alert()], [ADMIN1, ADMIN2]);

    expect(result.sent).toHaveLength(1);
    expect(result.sent[0].recipientId).toBe("u1");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toEqual({ domain: "projects", subject: "Projet en retard", recipientId: "u2", message: "adresse invalide" });
  });

  test("aucune alerte, aucun destinataire : renvoie un rapport vide, jamais une exception", async () => {
    const dispatcher = new AlertDispatcher({ notifyTool: notifyTool() });
    const result = await dispatcher.dispatch([], []);
    expect(result).toEqual({ sent: [], errors: [], alertsCount: 0, recipientsCount: 0 });
  });
});

describe("AlertDispatcher — fromName configurable", () => {
  test("un fromName personnalisé remplace le défaut", async () => {
    const tool = notifyTool();
    const dispatcher = new AlertDispatcher({ notifyTool: tool, fromName: "Surveillance CRM" });
    await dispatcher.dispatch([alert()], [ADMIN1]);
    expect(tool.invoke).toHaveBeenCalledWith(expect.objectContaining({ fromName: "Surveillance CRM" }));
  });
});

describe("AlertDispatcher — workflow proposé PAR DESTINATAIRE (jamais partagé, jamais exécuté ici)", () => {
  function alertWithWorkflow() {
    return alert({
      workflowTemplate: { label: "Créer un rappel", reason: "Relance en retard.", tool: "create_project_action", input: { projectId: "p1", commentaire: "x", dateAction: "2026-01-01" } },
    });
  }

  test("sans actionStore fourni : workflow reste null même si un workflowTemplate existe (jamais un id fabriqué sans stockage)", async () => {
    const emitToUser = jest.fn();
    const dispatcher = new AlertDispatcher({ notifyTool: notifyTool(), emitToUser });
    await dispatcher.dispatch([alertWithWorkflow()], [ADMIN1]);

    const [, , payload] = emitToUser.mock.calls[0];
    expect(payload.workflow).toBeNull();
  });

  test("avec un actionStore : le workflow émis expose {id, label, reason, status} — jamais tool/input", async () => {
    const actionStore = new PendingActionStore();
    const emitToUser = jest.fn();
    const dispatcher = new AlertDispatcher({ notifyTool: notifyTool(), emitToUser, actionStore });

    await dispatcher.dispatch([alertWithWorkflow()], [ADMIN1]);

    const [, , payload] = emitToUser.mock.calls[0];
    expect(payload.workflow).toEqual({ id: expect.any(String), label: "Créer un rappel", reason: "Relance en retard.", status: WORKFLOW_STATUS_PENDING });
    expect(payload.workflow.tool).toBeUndefined();
    expect(payload.workflow.input).toBeUndefined();
    expect(payload.workflowTemplate).toBeUndefined(); // jamais exposé au client
  });

  test("le workflow est réellement enregistré dans actionStore, récupérable par son id, scopé au bon destinataire", async () => {
    const actionStore = new PendingActionStore();
    const emitToUser = jest.fn();
    const dispatcher = new AlertDispatcher({ notifyTool: notifyTool(), emitToUser, actionStore });

    await dispatcher.dispatch([alertWithWorkflow()], [ADMIN1]);

    const workflowId = emitToUser.mock.calls[0][2].workflow.id;
    const stored = actionStore.peek(workflowId);
    expect(stored.recipientUserId).toBe("u1");
    expect(stored.tool).toBe("create_project_action");
    expect(stored.input).toEqual({ projectId: "p1", commentaire: "x", dateAction: "2026-01-01" });
  });

  test("2 destinataires reçoivent 2 workflowId DIFFÉRENTS pour la MÊME alerte — jamais partagé", async () => {
    const actionStore = new PendingActionStore();
    const emitToUser = jest.fn();
    const dispatcher = new AlertDispatcher({ notifyTool: notifyTool(), emitToUser, actionStore });

    await dispatcher.dispatch([alertWithWorkflow()], [ADMIN1, ADMIN2]);

    const ids = emitToUser.mock.calls.map((call) => call[2].workflow.id);
    expect(ids[0]).not.toBe(ids[1]);
    expect(actionStore.peek(ids[0]).recipientUserId).toBe("u1");
    expect(actionStore.peek(ids[1]).recipientUserId).toBe("u2");
  });
});
