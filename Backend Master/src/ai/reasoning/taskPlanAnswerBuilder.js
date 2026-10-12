"use strict";

const { STEP_STATUS } = require("../planning/planStep");

/**
 * # Réponses du TaskPlanner (Phase 3) — déterministes
 *
 * Aucun modèle de langage ici : chaque nombre, nom, date ou identifiant
 * affiché provient d'une étape réellement exécutée (lecture) ou d'un résultat
 * réel de Tool (écriture). Un texte ne dit jamais « c'est fait » pour une
 * action qui n'a pas renvoyé d'enregistrement.
 */

const STATUS_ICON = Object.freeze({
  [STEP_STATUS.DONE]: "✅",
  [STEP_STATUS.FAILED]: "❌",
  [STEP_STATUS.DENIED]: "⛔",
  [STEP_STATUS.TIMEOUT]: "⏱️",
  [STEP_STATUS.SKIPPED]: "⏭️",
  [STEP_STATUS.PLANNED]: "⏸️",
});

function frenchDate(value) {
  if (!value) return "aucune";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "aucune" : d.toLocaleDateString("fr-FR");
}

function planHeader(plan) {
  return `🧭 Plan — ${plan.goal}`;
}

function readLine(index, step, extra = "") {
  const icon = STATUS_ICON[step.status] || "•";
  const result = step.status === STEP_STATUS.DONE ? ` → ${step.output.count} lu(s)${step.output.total > step.output.count ? ` sur ${step.output.total}` : ""}` : ` → ${step.error}`;
  return `${index}. ${icon} Lecture — ${step.description} [${step.tool}]${result}${extra}`;
}

function buildProposalAnswer({ plan, readStep, analysis, prepared, ttlMinutes }) {
  const noun = plan.source.nounPlural;
  const dateLabel = plan.entityType === "project" ? "dernière relance" : "dernier appel";
  const lines = [planHeader(plan), ""];
  lines.push(readLine(1, readStep));
  lines.push(`2. ✅ Analyse — ${plan.steps[1].description} → ${analysis.kept.length} ${noun} retenu(s), ${analysis.excluded} écarté(s)`);
  lines.push(`3. ⏸️ Écriture — ${plan.action.tool} × ${prepared.steps.length} (en attente de votre confirmation)`);
  if (readStep.output.total > readStep.output.count) {
    lines.push("", `ℹ️ Analyse limitée aux ${readStep.output.count} premiers ${noun} renvoyés par le serveur (${readStep.output.total} au total).`);
  }

  lines.push("", `Actions préparées — AUCUNE n'est encore exécutée :`);
  prepared.steps.forEach((step, i) => {
    lines.push(`  ${i + 1}. ${step.description} — ${dateLabel} : ${frenchDate(step.target.lastDate)}`);
  });
  if (prepared.truncated) {
    lines.push(`  … ${prepared.totalCandidates - prepared.steps.length} autre(s) ${noun} correspondent : seules les ${prepared.steps.length} premières actions sont préparées (limite de sécurité par plan).`);
  }
  if (plan.action.dueDate && !plan.action.dueDateExplicit) {
    lines.push("", "📅 Date de relance : demain par défaut (précisez « dans N jours » ou « le JJ/MM » pour la changer).");
  }
  if (plan.action.tool === "create_project_action") {
    lines.push("ℹ️ Chaque activité créée met aussi à jour la date de dernière relance du projet.");
  }
  lines.push("", `Répondez « confirme » pour exécuter ces ${prepared.steps.length} action(s), ou « annule » pour abandonner (proposition valable ${ttlMinutes} minutes).`);
  return lines.join("\n");
}

function buildNothingToDoAnswer({ plan, readStep, analysis }) {
  const noun = plan.source.nounPlural;
  return [
    planHeader(plan),
    "",
    readLine(1, readStep),
    `2. ✅ Analyse — ${plan.steps[1].description} → 0 ${noun} retenu(s)`,
    "",
    `Aucun ${plan.source.noun} ne correspond à ces critères : aucune action à préparer, rien n'a été modifié.${analysis.excluded ? ` (${analysis.excluded} ${noun} lu(s) ne remplissent pas les conditions.)` : ""}`,
  ].join("\n");
}

function buildReadFailureAnswer({ plan, readStep }) {
  const reason =
    readStep.status === STEP_STATUS.DENIED
      ? "Votre rôle ne permet pas cette lecture : le serveur l'a refusée."
      : readStep.status === STEP_STATUS.TIMEOUT
        ? "La lecture n'a pas répondu à temps."
        : "La lecture a échoué.";
  return [planHeader(plan), "", readLine(1, readStep), "", `${reason} Le plan est interrompu : aucune action n'a été préparée ni exécutée.`].join("\n");
}

function buildWritePermissionAnswer({ plan }) {
  return [
    planHeader(plan),
    "",
    `⛔ Écriture — ${plan.action.tool} : non autorisée pour votre rôle.`,
    "",
    "Votre rôle ne permet pas cette action : aucune donnée n'a été lue pour ce plan, rien n'a été préparé ni exécuté.",
  ].join("\n");
}

function buildExecutedAnswer({ pending, steps }) {
  const done = steps.filter((s) => s.status === STEP_STATUS.DONE);
  const failed = steps.filter((s) => s.status !== STEP_STATUS.DONE);
  const lines = [`🧭 Plan — ${pending.goal}`, ""];
  if (!failed.length) lines.push(`✅ ${done.length} action(s) exécutée(s) sur ${steps.length}.`);
  else if (!done.length) lines.push(`❌ Aucune action n'a abouti (${steps.length} tentée(s)).`);
  else lines.push(`⚠️ Exécution partielle : ${done.length} action(s) réussie(s), ${failed.length} en échec, sur ${steps.length}.`);
  lines.push("");
  steps.forEach((step, i) => {
    const icon = STATUS_ICON[step.status] || "•";
    const detail = step.status === STEP_STATUS.DONE ? `enregistrement ${step.recordId}` : step.error;
    lines.push(`  ${i + 1}. ${icon} ${step.description} — ${detail}`);
  });
  if (failed.some((s) => s.status === STEP_STATUS.TIMEOUT)) {
    lines.push("", "⏱️ Une action en délai dépassé a pu aboutir côté serveur : vérifiez la fiche avant de la refaire.");
  }
  lines.push("", "Résultats renvoyés par les Tools du CRM (aucune valeur estimée).");
  return lines.join("\n");
}

function buildCancelledAnswer(pending) {
  return `🚫 Plan annulé — ${pending.goal}. Aucune des ${pending.steps.length} action(s) préparée(s) n'a été exécutée.`;
}

function buildNoPendingAnswer() {
  return "Il n'y a aucun plan en attente de confirmation dans cette conversation (il a peut-être expiré). Reformulez la demande pour que je prépare un nouveau plan.";
}

function buildNoConversationAnswer() {
  return "Je peux préparer ce plan, mais sa confirmation nécessite une conversation active. Réessayez depuis le panneau du Copilot.";
}

module.exports = {
  buildProposalAnswer,
  buildNothingToDoAnswer,
  buildReadFailureAnswer,
  buildWritePermissionAnswer,
  buildExecutedAnswer,
  buildCancelledAnswer,
  buildNoPendingAnswer,
  buildNoConversationAnswer,
};
