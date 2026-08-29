"use strict";

/**
 * # commercialActionAnswerBuilder — met en mots le cycle proposer -> confirmer/annuler -> exécuter d'une relance commerciale
 *
 * AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "CORRIGER
 * LES ACTIONS COMMERCIALES DEPUIS LA LISTE DES CONTACTS". Même discipline que
 * `meetingAnswerBuilder.js` : aucun second appel au modèle, chaque phrase
 * vient d'un état déjà calculé (le `payload` d'un PendingAction, ou le
 * résultat RÉEL de `schedule_commercial_contact_relance`) — jamais du texte
 * que le LLM aurait pu produire. `buildRelanceExecutedAnswer` ne dit JAMAIS
 * "effectuée" si le Tool n'a pas réellement réussi (`result.ok !== true`).
 */
function formatPayload(payload) {
  const lines = [`- Contact : ${payload.contactLabel}`, `- Date de relance : ${payload.dateRelance}`];
  if (payload.commercialLabel) lines.push(`- Commercial : ${payload.commercialLabel}`);
  return lines.join("\n");
}

function buildRelanceProposalAnswer(action, { expiresInMinutes = 15 } = {}) {
  return [
    "Je vous propose :",
    "",
    formatPayload(action.payload),
    "",
    `Confirmez-vous cette action ? Répondez « confirme »/« oui » pour l'exécuter, « annule »/« non » pour abandonner. Cette proposition expire dans ${expiresInMinutes} minutes.`,
  ].join("\n");
}

function buildRelanceCancelledAnswer(payload) {
  return `Action annulée : la relance pour "${payload.contactLabel}" n'a pas été programmée.`;
}

function buildRelanceAmbiguousAnswer() {
  return "Je n'ai pas compris votre réponse : merci de confirmer explicitement (« oui »/« confirme ») ou d'annuler (« non »/« annule »).";
}

function buildRelanceExpiredAnswer() {
  return "Aucune action en attente de confirmation pour cette conversation (elle a peut-être expiré) — reformulez votre demande.";
}

// Un seul champ peut réellement manquer côté serveur pour cette action :
// la date (contactId/commercialId sont résolus ou refusés séparément, voir
// commercialAgent.js — jamais mélangés à ce message). `missingCommercial`
// documente le cas où la base ne permet PAS d'affecter sans date (voir
// commercialContactRelance.service.js : dateRelance est obligatoire).
function buildMissingDateAnswer(contactLabel) {
  return `Pour programmer une relance pour "${contactLabel}", il me manque encore une date. Le CRM ne permet pas d'affecter un commercial ou de créer une relance sans date de relance.`;
}

function buildContactNotFoundAnswer(contactName) {
  return `Je n'ai trouvé aucun contact correspondant à « ${contactName} ».`;
}

function buildContactAmbiguousAnswer(contactName, matches) {
  const options = matches.map((c) => `${[c.prenom, c.nom].filter(Boolean).join(" ")}${c.telephone ? ` (tél. ${c.telephone})` : ""}`).join(", ");
  return `Plusieurs contacts correspondent à « ${contactName} » : ${options}. Pouvez-vous préciser (téléphone ou société) ?`;
}

function buildCommercialNotFoundAnswer(email) {
  return `Je n'ai trouvé aucun commercial éligible correspondant à « ${email} » — l'action n'a pas été proposée.`;
}

// Jamais "effectuée avec succès" si le Tool n'a pas réellement réussi —
// cite les identifiants RÉELS renvoyés par le service, jamais inventés.
function buildRelanceExecutedAnswer(result) {
  if (!result || !result.ok) {
    const reasons = {
      contact_not_found: "le contact n'a pas été retrouvé au moment de l'exécution",
      invalid_status: "le statut actuel du contact ne permet pas de relance",
      forbidden: "vous n'êtes pas autorisé à modifier ce contact",
      date_required: "aucune date de relance n'a été fournie",
      commercial_not_found: "le commercial indiqué n'a pas été retrouvé ou n'est pas éligible",
    };
    const reason = (result && reasons[result.reason]) || "raison inconnue";
    return `L'action n'a pas pu être effectuée (${reason}).`;
  }
  const lines = [
    "Action effectuée avec succès.",
    "",
    `- Relance id : ${result.relance.id}`,
    `- Contact id : ${result.contact.id} (${[result.contact.prenom, result.contact.nom].filter(Boolean).join(" ")})`,
    `- Date de relance : ${result.relance.dateRelance}`,
  ];
  if (result.relance.commercialId) {
    lines.push(`- Commercial affecté : ${result.relance.commercialName || result.relance.commercialEmail} (${result.relance.commercialId})`);
  }

  // AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission
  // "SYNCHRONISER LES RELANCES COMMERCIALES DU COPILOT AVEC LE CRM ET LE
  // CALENDRIER" — jamais affirmer une synchronisation qui n'a pas
  // réellement réussi (voir commercialContactRelance.service.js::_syncCalendars,
  // qui renvoie ces 3 champs à partir du résultat RÉEL de
  // syncTaskForRecipients()/syncEventForRecipients(), jamais devinés ici).
  const sync = result.calendarSync || {};
  lines.push(`- Calendrier CRM : ${sync.crmSynced ? "événement créé" : "non créé"}`);
  if (sync.googleSynced) {
    lines.push("- Google Calendar : événement créé");
  } else if (sync.googleError === "not_connected") {
    lines.push("- Google Calendar : non connecté — la relance CRM reste créée");
  } else if (sync.googleError) {
    lines.push(`- Google Calendar : échec de synchronisation (${sync.googleError}) — la relance CRM reste créée`);
  } else {
    lines.push("- Google Calendar : non synchronisé");
  }

  return lines.join("\n");
}

module.exports = {
  buildRelanceProposalAnswer,
  buildRelanceCancelledAnswer,
  buildRelanceAmbiguousAnswer,
  buildRelanceExpiredAnswer,
  buildMissingDateAnswer,
  buildContactNotFoundAnswer,
  buildContactAmbiguousAnswer,
  buildCommercialNotFoundAnswer,
  buildRelanceExecutedAnswer,
};
