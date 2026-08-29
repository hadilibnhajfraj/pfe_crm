"use strict";

// Mise en forme PURE (aucune logique RBAC ici — voir capabilityMatrixService.js)
// du résultat déjà calculé, même séparation que kpiAnswerBuilder.js/
// meetingAnswerBuilder.js : ce module ne décide jamais qui a le droit de
// quoi, il traduit une décision déjà prise en français lisible.

const REASON_LABELS = {
  intent_rbac: "réservé à d'autres rôles",
  agent_rbac: "réservé à d'autres rôles",
};

function describeIntent(cap) {
  switch (cap.status) {
    case "available":
      return `✅ ${cap.intent} — ${cap.description} (agent : ${cap.agent})`;
    case "denied":
      return `❌ ${cap.intent} — ${REASON_LABELS[cap.reason] || "refusé"}${cap.agent ? ` (agent : ${cap.agent}, rôles autorisés : ${(cap.requiredRoles || []).join(", ") || "aucun"})` : ""}`;
    case "generic":
      return `🔶 ${cap.intent} — ${cap.description} (traitement générique, aucun agent dédié)`;
    default:
      return `❓ ${cap.intent} — statut inconnu`;
  }
}

// Réponse à "Qu'est-ce que je peux faire ?"/"Quels agents sont disponibles
// pour moi ?"/"Quels modules sont accessibles avec mon rôle ?" — un résumé
// complet, jamais partiel, du résultat de getCapabilities().
function buildCapabilityAnswer(capabilities) {
  const { role, isAdminTier, intents, availableAgents, moduleAccessPrefixes, nonExposedDomains = [], notImplementedDomains = [] } = capabilities;

  const lines = [`### Vos capacités (rôle : ${role})`, ""];

  const available = intents.filter((i) => i.status === "available");
  const generic = intents.filter((i) => i.status === "generic");
  const denied = intents.filter((i) => i.status === "denied");

  if (available.length) {
    lines.push("**Ce que vous pouvez faire :**");
    available.forEach((cap) => lines.push(`- ${describeIntent(cap)}`));
    lines.push("");
  }
  if (generic.length) {
    lines.push("**Traité de façon générique (aucun agent dédié, mais fonctionnel) :**");
    generic.forEach((cap) => lines.push(`- ${describeIntent(cap)}`));
    lines.push("");
  }
  if (denied.length) {
    lines.push("**Non disponible pour votre rôle :**");
    denied.forEach((cap) => lines.push(`- ${describeIntent(cap)}`));
    lines.push("");
  }
  // knownCopilotGaps.js — jamais mélangé aux intentions réelles ci-dessus :
  // ce ne sont pas des refus RBAC, seulement des domaines sans aucune
  // représentation Copilot aujourd'hui.
  if (nonExposedDomains.length) {
    lines.push("**Non exposé au Copilot (le module existe, mais aucune intention/agent/outil Copilot ne le relie) :**");
    nonExposedDomains.forEach((d) => lines.push(`- ${d.label}`));
    lines.push("");
  }
  if (notImplementedDomains.length) {
    lines.push("**Non implémenté (la donnée existe en base, mais aucune fonctionnalité métier Copilot correspondante) :**");
    notImplementedDomains.forEach((d) => lines.push(`- ${d.label}`));
    lines.push("");
  }

  lines.push(`Agents utilisables : ${availableAgents.length ? availableAgents.join(", ") : "aucun"}.`);

  if (moduleAccessPrefixes === null) {
    lines.push("Aucune restriction de module connue à ce niveau pour votre rôle.");
  } else if (Array.isArray(moduleAccessPrefixes) && moduleAccessPrefixes.length) {
    lines.push(`Modules HTTP accessibles à votre rôle : ${moduleAccessPrefixes.join(", ")}.`);
  }

  if (!isAdminTier) {
    lines.push(
      "",
      "Précision importante : sauf pour les rôles admin-tier (admin/superadmin/superadmin2), " +
        "vous ne voyez jamais les données d'un autre utilisateur — votre périmètre est " +
        "automatiquement limité à vos propres données, appliqué côté serveur, jamais par ce Copilot lui-même."
    );
  }

  return lines.join("\n");
}

// Réponse à "Puis-je utiliser X ?"/"Pourquoi X est-il refusé ?" — une
// intention PRÉCISE, nommée dans le message (voir
// capabilityMatrixService.findMentionedIntent()).
function buildIntentCapabilityAnswer(capability, actingUser) {
  if (!capability) {
    return "Cette fonctionnalité ne correspond à aucune intention réelle du Copilot — je ne peux pas vous répondre sans inventer une capacité qui n'existe pas.";
  }

  const lines = [];

  switch (capability.status) {
    case "available":
      lines.push(`Oui — vous pouvez utiliser "${capability.intent}" (${capability.description}), pris en charge par ${capability.agent}.`);
      break;
    case "denied":
      lines.push(
        `Non — "${capability.intent}" (${capability.description}) est réservé aux rôles : ${(capability.requiredRoles || []).join(", ") || "un ensemble restreint"}.` +
          ` Votre rôle actuel ("${actingUser.role}") n'en fait pas partie.`
      );
      break;
    case "generic":
      lines.push(`Oui, dans une certaine mesure — "${capability.intent}" (${capability.description}) est traité de façon générique, sans agent dédié, mais reste fonctionnel.`);
      break;
    default:
      lines.push(`Statut inconnu pour "${capability.intent}".`);
  }

  // Même garantie que buildCapabilityAnswer() — "disponible" ne veut jamais
  // dire "toutes les données de tout le monde" : un "oui" sur une intention
  // reste scopé à l'utilisateur, sauf admin-tier. Répétée ici pour que
  // "Puis-je voir les données d'un AUTRE utilisateur ?" reçoive la même
  // réponse honnête que le résumé général, jamais un "oui" trompeur.
  if ((capability.status === "available" || capability.status === "generic") && !capability.isAdminTier) {
    lines.push(
      "Précision : vous ne voyez jamais les données d'un autre utilisateur — votre périmètre est " +
        "automatiquement limité à vos propres données, appliqué côté serveur, jamais par ce Copilot lui-même."
    );
  }

  return lines.join("\n");
}

// Réponse pour un domaine nommé qui n'a AUCUNE intention réelle du
// catalogue (voir capabilityMatrixService.findKnownGap()) — jamais une
// intention/agent Finance/Tasks/Documents/Calendar inventée, seulement le
// fait honnête que ce domaine n'est pas relié au Copilot aujourd'hui.
function buildGapAnswer(gap) {
  if (gap.status === "not_exposed") {
    return (
      `❌ ${gap.label} — non exposé au Copilot : ce module existe dans l'application, ` +
      "mais aucune intention, agent ou outil ne le relie au Copilot aujourd'hui."
    );
  }
  return (
    `❌ ${gap.label} — non implémenté : cette donnée existe dans la base, ` +
    "mais aucune fonctionnalité métier Copilot (agent, outil, service) n'a encore été développée pour ce domaine."
  );
}

module.exports = { buildCapabilityAnswer, buildIntentCapabilityAnswer, buildGapAnswer };
