"use strict";

const { randomUUID } = require("crypto");
const { formatAlertMessage } = require("./proactiveAnswerBuilder");

const ALERT_NOTIFICATION_TYPE = "PROACTIVE_AI_ALERT";
// Réutilise le canal temps réel déjà en place (`socket.js`, déjà utilisé par
// `cron/followup.job.js`) avec un type d'événement DÉDIÉ et filtrable côté
// client — exactement la mitigation documentée dans
// AI-Business-Copilot/00_PLAN_DEVELOPPEMENT.md (risque R9, "pas de flux à
// haute fréquence, événement dédié") : jamais un nouveau canal, jamais un
// flux générique qui pourrait saturer le client.
const SOCKET_EVENT = "proactive-ai-alert";
const WORKFLOW_STATUS_PENDING = "pending_confirmation";

/**
 * # AlertDispatcher — envoyer, jamais analyser (séparation stricte)
 *
 * ## Rôle
 * Prend des `ProactiveAlert` DÉJÀ construits (`proactiveMonitor.js`) et les
 * envoie réellement, par les 2 SEULS canaux réels de ce kernel — jamais un
 * nouveau canal fabriqué pour l'occasion :
 * - `send_notification_email` (Tool MCP réel, admin-tier) — un e-mail réel
 *   ET une notification in-app (déjà géré par
 *   `notification.service.js::sendEmailNotification`).
 * - `emitToUser` (`src/socket.js`, déjà utilisé par `cron/followup.job.js`
 *   pour un tout autre besoin) — push temps réel si le destinataire est
 *   connecté, silencieusement ignoré sinon (voir `socket.js::emitToUser`,
 *   no-op si Socket.IO n'est pas initialisé ou l'utilisateur non connecté).
 *
 * ## Workflow — jamais exécuté ici, seulement PROPOSÉ à CE destinataire
 * Quand `alert.workflowTemplate` existe (voir `proactiveAnswerBuilder.js`),
 * chaque destinataire reçoit sa PROPRE proposition, sous un `workflowId`
 * distinct (`ProactiveActionStore.propose()`, voir `proactiveActionStore.js`)
 * — jamais un `workflowId` partagé entre plusieurs destinataires : confirmer
 * l'alerte reçue par un collègue ne doit jamais pouvoir exécuter une action
 * en son nom. Le payload envoyé au client (`workflow: {id, label, reason,
 * status}`) n'expose JAMAIS `tool`/`input` (les détails d'exécution restent
 * uniquement dans `ProactiveActionStore`, résolus au moment de la
 * confirmation — voir `aiCopilotBridge.service.js::confirmProactiveWorkflow`).
 *
 * ## Jamais bloquant, jamais tout-ou-rien
 * Un envoi qui échoue (destinataire invalide, Tool refusé) est consigné
 * dans `errors` — n'empêche jamais les autres envois. Même discipline que
 * `BaseAutomation`/`DomainAnalyzer` : un échec partiel ne fait jamais
 * échouer tout le tour.
 */
class AlertDispatcher {
  constructor({ notifyTool = null, emitToUser = null, actionStore = null, fromName = "Copilot IA CBI Tunisia" } = {}) {
    this.notifyTool = notifyTool;
    this.emitToUser = emitToUser;
    this.actionStore = actionStore;
    this.fromName = fromName;
  }

  async dispatch(alerts, recipients) {
    const sent = [];
    const errors = [];

    for (const alert of alerts) {
      for (const recipient of recipients) {
        try {
          await this._sendOne(alert, recipient);
          sent.push({ domain: alert.domain, subject: alert.subject, recipientId: recipient.id });
        } catch (err) {
          errors.push({ domain: alert.domain, subject: alert.subject, recipientId: recipient.id, message: err.message });
        }
      }
    }

    return { sent, errors, alertsCount: alerts.length, recipientsCount: recipients.length };
  }

  // Construit, pour CE destinataire, la version "publique" de l'alerte —
  // remplace `workflowTemplate` (tool/input internes) par un `workflow`
  // {id, label, reason, status} sans jamais exposer les détails
  // d'exécution, et enregistre la proposition dans `actionStore` sous un id
  // propre à ce destinataire (voir doc de classe ci-dessus).
  _preparePayload(alert, recipient) {
    const { workflowTemplate, ...publicAlert } = alert;
    if (!workflowTemplate || !this.actionStore) {
      return { ...publicAlert, workflow: null };
    }

    const workflowId = randomUUID();
    this.actionStore.propose(workflowId, {
      recipientUserId: recipient.id,
      tool: workflowTemplate.tool,
      input: workflowTemplate.input,
      label: workflowTemplate.label,
      reason: workflowTemplate.reason,
      domain: alert.domain,
      subject: alert.subject,
    });

    return { ...publicAlert, workflow: { id: workflowId, label: workflowTemplate.label, reason: workflowTemplate.reason, status: WORKFLOW_STATUS_PENDING } };
  }

  async _sendOne(alert, recipient) {
    const payload = this._preparePayload(alert, recipient);

    if (this.notifyTool) {
      await this.notifyTool.invoke({
        toUserId: recipient.id,
        emailTo: recipient.email,
        fromName: this.fromName,
        subject: alert.subject,
        message: formatAlertMessage(alert),
        type: ALERT_NOTIFICATION_TYPE,
      });
    }
    if (this.emitToUser) {
      this.emitToUser(recipient.id, SOCKET_EVENT, payload);
    }
  }
}

module.exports = { AlertDispatcher, ALERT_NOTIFICATION_TYPE, SOCKET_EVENT, WORKFLOW_STATUS_PENDING };
