"use strict";

/**
 * # automationAnswerBuilder — met en mots le cycle proposer → confirmer/annuler → exécuter
 *
 * Même choix que les autres `*AnswerBuilder.js` de `reasoning/` : aucun
 * second appel au modèle — chaque phrase vient d'un état déjà calculé par
 * `agents/automationAgent.js` (le plan produit par `IPlanner`, ou le
 * résultat réel d'un Tool déjà exécuté).
 */
function formatStep(step) {
  const inputText = step.input && Object.keys(step.input).length > 0 ? JSON.stringify(step.input) : "(aucun paramètre)";
  return `- ${step.tool} ${inputText} — ${step.reason || "raison non précisée"}.`;
}

function buildProposalAnswer(action, { expiresInMinutes = 15 } = {}) {
  const count = action.steps.length;
  return [
    `Je propose d'exécuter ${count} action${count > 1 ? "s" : ""} :`,
    action.steps.map(formatStep).join("\n"),
    "",
    `Répondez « confirme » pour exécuter, ou « annule » pour abandonner. Cette proposition expire dans ${expiresInMinutes} minutes.`,
  ].join("\n");
}

function buildExecutedAnswer(toolSteps) {
  const lines = toolSteps.map((s) => `- ${s.tool} : exécuté.`);
  return [`Action confirmée — ${toolSteps.length} étape(s) exécutée(s) :`, lines.join("\n")].join("\n");
}

function buildCancelledAnswer(action) {
  const tools = action.steps.map((s) => s.tool).join(", ");
  return `Action annulée : ${action.steps.length} étape(s) proposée(s) (${tools}) n'ont pas été exécutées.`;
}

function buildToolsUnavailableAnswer() {
  return "Les Tools prévus par cette proposition ne sont plus disponibles pour votre profil — action annulée, aucune étape exécutée.";
}

function buildExpiredOrMissingAnswer() {
  return "Aucune action en attente de confirmation pour cette conversation (elle a peut-être expiré) — reformulez votre demande.";
}

function buildNoActionAnswer() {
  return "Je n'ai identifié aucune action exécutable pour cette demande à partir des Tools disponibles.";
}

module.exports = {
  buildProposalAnswer,
  buildExecutedAnswer,
  buildCancelledAnswer,
  buildToolsUnavailableAnswer,
  buildExpiredOrMissingAnswer,
  buildNoActionAnswer,
};
