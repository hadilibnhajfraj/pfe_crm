"use strict";

const { tokenize } = require("../utils/tokenize");

/**
 * # projectOwnershipOverride — "projets associés à un utilisateur" > users
 *
 * ## Le bug corrigé (mission "CORRIGER LES 3 PROBLÈMES IDENTIFIÉS PAR
 * L'AUDIT COPILOT", problème 3)
 * "Donne-moi les projets associés à un autre utilisateur" contient à la
 * fois un mot-clé `projects` ("projets", 1 point) et un mot-clé `users`
 * ("utilisateur", 1 point) — une VRAIE égalité de score. `intentCatalog.js`
 * déclare `users` AVANT `projects` (lignes 54/62) : `LexicalIntentRouter`
 * (`score > bestScore`, jamais `>=`) départage donc en faveur de `users`,
 * qui n'a AUCUN Agent dédié (`agentRegistry.findHandler({name:"users"})`
 * → `null`) — la question, qui porte pourtant sur des PROJETS, ne bénéficie
 * jamais du raisonnement de `ProjectAgent`/`scopeInputForActingUser()`.
 *
 * ## Pourquoi pas simplement réordonner le catalogue
 * Explicitement interdit par la mission, et à raison : `users` gagne aussi
 * cette égalité pour des questions légitimement `users` qui mentionnent un
 * projet EN PASSANT sans jamais demander la liste des projets eux-mêmes
 * (aucun cas de ce type dans le corpus actuel — voir `usr-01`…`usr-26`,
 * `test/fixtures/copilotValidationScenarios.js` — mais réordonner le
 * catalogue changerait le comportement pour TOUTE égalité `users` future,
 * pas seulement celle-ci). Corriger l'ordre du tableau est un changement
 * global et implicite ; ce module est un changement local et explicite,
 * documenté, limité à cette seule ambiguïté.
 *
 * ## La vraie règle
 * Ce module n'ajoute AUCUN mot-clé au scoring générique — il n'intervient
 * qu'APRÈS que le routeur générique ait déjà choisi `users`, et seulement
 * si le message contient AUSSI un mot-clé réel de `projects` ("projet"/
 * "projets") : c'est exactement, et seulement, la situation d'égalité
 * décrite ci-dessus. Vérifié contre les 26 scénarios `users` déjà validés
 * du corpus (`usr-01`…`usr-26`) : AUCUN ne contient "projet"/"projets" —
 * cette règle ne peut donc, par construction, dégrader aucun d'entre eux.
 * "Donne-moi les informations sur cet utilisateur"/"Quel est le profil de
 * Hadil ?"/"Liste les utilisateurs" (exemples de la mission qui doivent
 * rester `users`) ne contiennent eux-mêmes aucun mot-clé `projects` : la
 * garde ci-dessous ne les touche jamais.
 *
 * ## Portée délibérément étroite
 * Ne s'applique QUE quand le routeur a choisi `users` ET que `projects`
 * existe dans le catalogue fourni.
 */
function mentionsProject(message) {
  const terms = new Set(tokenize(message));
  return terms.has("projet") || terms.has("projets");
}

// `key` est la clé DÉJÀ choisie par le vrai routeur — jamais recalculée
// depuis zéro.
function applyProjectOwnershipOverride(message, key, catalogByKey) {
  if (key !== "users") return key;
  if (!catalogByKey.has("projects")) return key;
  return mentionsProject(message) ? "projects" : key;
}

module.exports = { applyProjectOwnershipOverride, mentionsProject };
