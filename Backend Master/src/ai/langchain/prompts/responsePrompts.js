"use strict";

/**
 * # Prompts système de génération de réponse — principes + tons par rôle
 *
 * ## Rôle
 * Une seule source de vérité pour les règles de qualité de réponse que
 * TOUTE Chain qui parle directement au modèle doit respecter
 * (`QaChain`/`ToolCallingChain`, voir plus bas) — jamais réécrites
 * différemment d'une Chain à l'autre. Vit dans `langchain/` (pas
 * `orchestrator/`) : c'est `orchestrator/` qui dépend de `langchain/` dans
 * ce kernel, jamais l'inverse (voir `src/ai/README.md`, « Clean
 * Architecture ») — placer ce fichier ici évite tout risque de dépendance
 * circulaire si `orchestrator/` veut aussi le consommer un jour (ex. pour
 * transmettre le rôle de l'utilisateur depuis `AIManager`).
 *
 * ## Les principes de base (`RESPONSE_PRINCIPLES`)
 * Toujours appliqués, quel que soit le rôle ou la Chain : professionnel,
 * naturel, court, compréhensible, jamais halluciné, toujours citer les
 * données/outils utilisés, expliquer le raisonnement quand la réponse
 * combine plusieurs éléments, et signaler explicitement une information
 * manquante plutôt que de deviner.
 *
 * Ce fichier encode l'INSTRUCTION donnée au modèle — il ne peut pas, à lui
 * seul, garantir qu'un modèle réel l'applique parfaitement (aucun
 * fournisseur LLM n'est branché à ce jour, voir `src/ai/README.md`).
 * Deux garde-fous mécaniques, eux, existent déjà indépendamment de tout
 * respect du prompt par le modèle : `citations`
 * (`rag/citations/CitationBuilder`) et `explanation`
 * (`orchestrator/explanationBuilder.js`) sont calculés en code, jamais
 * laissés à la seule discrétion du modèle.
 *
 * ## Les tons par rôle (`ROLE_TONE_GUIDANCE`)
 * 5 rôles demandés : Admin, Commercial, RH, Maintenance, Direction. Chacun
 * adapte le REGISTRE de la réponse (niveau de détail, vocabulaire), jamais
 * les principes de base ci-dessus — un ton "Direction" reste tout aussi
 * dépourvu d'hallucination qu'un ton "Admin".
 */
const RESPONSE_PRINCIPLES = [
  "Réponds de façon professionnelle, naturelle, courte et facilement compréhensible.",
  "Ne jamais halluciner ni inventer une donnée : si une information manque ou n'apparaît pas dans les résultats fournis, dis-le explicitement plutôt que de deviner ou d'extrapoler.",
  "Cite toujours les données, outils ou sources utilisés pour construire ta réponse.",
  "Quand ta réponse combine plusieurs éléments (plusieurs outils, plusieurs sources), explique brièvement ton raisonnement.",
].join(" ");

const ROLE_TONE_GUIDANCE = {
  admin: "Ton interlocuteur est un administrateur système/technique : sois précis et factuel, les détails techniques (identifiants, statuts, dates exactes) sont utiles, pas superflus.",
  commercial: "Ton interlocuteur est un commercial : mets en avant les chiffres utiles à l'action (relances, opportunités, KPI de vente), reste concret et orienté résultat.",
  rh: "Ton interlocuteur travaille aux Ressources Humaines : adopte un ton posé, respectueux de la confidentialité des données personnelles, sans détail au-delà de ce qui est demandé.",
  maintenance: "Ton interlocuteur travaille en maintenance/technique : privilégie un langage direct et opérationnel (état d'une panne, urgence, technicien assigné), va à l'essentiel.",
  direction: "Ton interlocuteur est un membre de la direction : privilégie une synthèse de haut niveau (tendances, risques, chiffres clés), n'entre dans le détail opérationnel que si c'est explicitement demandé.",
};

const SUPPORTED_ROLES = Object.freeze(Object.keys(ROLE_TONE_GUIDANCE));

// Rôles CRM (users.role, vocabulaire v2) partageant le ton d'un autre profil
// sans en être un nouveau : commercial_sedentaire (ancien rôle "commercial")
// conserve le ton commercial qu'il avait avant la migration.
const ROLE_TONE_ALIASES = Object.freeze({ commercial_sedentaire: "commercial" });

/**
 * Compose le prompt système final : principes de base + ton du rôle (si
 * reconnu) + instructions propres à la Chain appelante (`extra`, ex. le
 * protocole JSON de `ToolCallingChain`).
 *
 * `role` est comparé insensible à la casse (`"Admin"`/`"admin"` équivalents)
 * — un rôle absent ou non reconnu (ex. `"accueil"`, sans ton dédié parmi
 * les 5 demandés) applique seulement les principes de base, jamais une
 * erreur.
 */
function buildResponseSystemPrompt({ role = null, extra = "" } = {}) {
  const parts = [RESPONSE_PRINCIPLES];

  const lowered = role ? String(role).toLowerCase() : null;
  const normalizedRole = lowered ? ROLE_TONE_ALIASES[lowered] || lowered : null;
  if (normalizedRole && ROLE_TONE_GUIDANCE[normalizedRole]) {
    parts.push(ROLE_TONE_GUIDANCE[normalizedRole]);
  }

  if (extra) parts.push(extra);

  return parts.join("\n\n");
}

module.exports = { buildResponseSystemPrompt, RESPONSE_PRINCIPLES, ROLE_TONE_GUIDANCE, SUPPORTED_ROLES };
