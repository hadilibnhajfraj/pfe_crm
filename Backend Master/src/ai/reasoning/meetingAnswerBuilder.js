"use strict";

/**
 * # meetingAnswerBuilder — met en mots le cycle proposer -> confirmer/annuler -> exécuter d'une réunion Copilot
 *
 * AI-Business-Copilot/29_MEETING_AGENT_CRM_CALENDAR_LINK.md — même discipline
 * que `automationAnswerBuilder.js` : aucun second appel au modèle, chaque
 * phrase vient d'un état déjà calculé (le `payload` d'un PendingAction, ou le
 * résultat RÉEL de `meetingCopilotSync.service.js::createCopilotMeeting()`)
 * — jamais du texte que le LLM aurait pu produire. `buildMeetingExecutedAnswer`
 * en particulier ne dit JAMAIS "créée avec succès" si l'une des deux
 * écritures (CRM/Google) a échoué (voir meetingAgent.js).
 */
function formatPayload(payload) {
  const lines = [`- Sujet : ${payload.summary}`, `- Début : ${payload.startDateTime}`, `- Fin : ${payload.endDateTime}`];
  if (payload.email) lines.push(`- Email mentionné : ${payload.email}`);
  if (payload.projectName) lines.push(`- Projet (information libre) : ${payload.projectName}`);
  return lines.join("\n");
}

function buildMeetingProposalAnswer(action, { expiresInMinutes = 15 } = {}) {
  return [
    "Voici le récapitulatif de la réunion :",
    formatPayload(action.payload),
    "",
    `Confirmez-vous la création de cette réunion ? Répondez « confirme »/« oui » pour créer, « annule »/« non » pour abandonner. Cette proposition expire dans ${expiresInMinutes} minutes.`,
  ].join("\n");
}

function buildMeetingCancelledAnswer(payload) {
  return `Création annulée : la réunion "${payload.summary}" n'a pas été créée.`;
}

function buildMeetingAmbiguousAnswer() {
  return "Je n'ai pas compris votre réponse : merci de confirmer explicitement (« oui »/« confirme ») ou d'annuler (« non »/« annule »).";
}

function buildMeetingExpiredAnswer() {
  return "Aucune réunion en attente de confirmation pour cette conversation (elle a peut-être expiré) — reformulez votre demande.";
}

// AI-Business-Copilot/30_MEETING_AGENT_NO_LLM_FOR_MISSING_FIELDS.md —
// reproduit en direct : appeler Ollama pour la SEULE tâche de demander les
// champs manquants (aucune décision réelle, `missing` est déjà connu de
// façon déterministe via meetingSlotExtractor.js::missingMeetingFields())
// pouvait renvoyer un JSON malformé (PlanningError) après ~30s, faisant
// échouer tout le tour ("Désolé, meeting_agent n'a pas pu traiter...").
// `missing` vient TOUJOURS de `missingMeetingFields(slots)` — jamais une
// liste inventée.
function buildMissingFieldsAnswer(missing) {
  return `Pour programmer une réunion, il me manque encore : ${missing.join(", ")}.`;
}

// Jamais un succès complet affirmé si l'une des deux écritures a échoué —
// jamais un identifiant inventé : seuls `result.crmEventId`/`result.googleEventId`
// (renvoyés par createCopilotMeeting(), jamais par le LLM) sont cités.
function buildMeetingExecutedAnswer(result) {
  if (!result.crmCreated) {
    return `La réunion n'a pas pu être créée dans le CRM (${result.crmError || "erreur inconnue"}). Aucun événement Google Calendar n'a été créé.`;
  }
  if (!result.googleCreated) {
    return `La réunion a été créée dans le CRM (identifiant ${result.crmEventId}), mais la synchronisation avec Google Calendar a échoué (${result.googleError || "erreur inconnue"}).`;
  }
  return `Réunion créée avec succès — CRM : ${result.crmEventId}, Google Calendar : ${result.googleEventId}${result.googleEventLink ? ` (${result.googleEventLink})` : ""}.`;
}

module.exports = {
  buildMeetingProposalAnswer,
  buildMeetingCancelledAnswer,
  buildMeetingAmbiguousAnswer,
  buildMeetingExpiredAnswer,
  buildMeetingExecutedAnswer,
  buildMissingFieldsAnswer,
};
