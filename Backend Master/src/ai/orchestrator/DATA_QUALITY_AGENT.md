# Data Quality Agent — détecter, noter, proposer, jamais modifier

Ce document décrit le 14e Agent du Copilot : un auditeur de la FIABILITÉ des données CRM (pas de leur urgence métier, déjà couvert par `RecommendationAgent`, ni de leur analyse à la demande, déjà couvert par `BusinessAnalystAgent`). Il détecte automatiquement 8 catégories de problèmes, calcule un **Score Qualité**, et **propose** des corrections — sans jamais en appliquer aucune. Point d'entrée : `agents/dataQualityAgent.js`, règles métier : `reasoning/dataQualityAnalyzer.js`.

## Les 8 catégories demandées → la règle métier exacte

Toutes calculées à partir de la fiche projet renvoyée par `list_projects` (Tool déjà existant, lecture seule) — jamais un nouveau Tool, jamais une donnée inventée :

| Catégorie | Règle métier | Source |
|---|---|---|
| Doublons | Deux projets ou plus partagent EXACTEMENT le même nom (normalisé : espaces/casse ignorés) | Comparaison directe sur `nomProjet` |
| Informations manquantes | `completionRate < 100` et `missingFields` non vide | **Déjà calculé côté CRM** (`computeCompletion()`), réutilisé tel quel |
| Emails invalides | `emailIngenieur`/`emailArchitecte` RENSEIGNÉS mais ne correspondant pas à `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | **Même règle exacte** que `routes/projects.routes.js::isValidEmail` |
| Téléphones invalides | `telephoneIngenieur`/`telephoneArchitecte` RENSEIGNÉS mais hors du format 6-30 caractères chiffres/+/espace/-/parenthèses | **Même règle exacte** que `routes/projects.routes.js::isValidPhone` |
| Documents manquants | `attachmentsCount === 0` (aucune pièce jointe sur le projet) | Champ déjà exposé par `list_projects` |
| Incohérences | Étape "gagnée" avec avancement < 100 % ; budget renseigné sans aucun avancement suivi | **Réutilise intégralement** `dataCoherenceChecker.js` (Business Reasoning) |
| Erreurs de workflow | Projet ARCHIVÉ mais toujours dans une étape OUVERTE (ni gagnée, ni perdue) | Nouvelle règle, sur `isArchived` + `stage.isWonStage`/`isLostStage` (champs déjà exposés) |
| Données orphelines | Aucun propriétaire assigné (`ownerId`) et/ou aucune étape de pipeline assignée (`pipelineStageId`) | Champs déjà exposés par `list_projects` |

## Un vrai gap comblé pour rendre les 2 dernières règles possibles

`toProjectCard()` (`modules/kanban/services/kanban.service.js`) chargeait déjà `emailIngenieur`/`emailArchitecte`/`telephoneIngenieur`/`telephoneArchitecte` en base — mais uniquement pour calculer `completionRate`/`missingFields`, sans jamais exposer la VALEUR de ces champs. Sans cette valeur, il est structurellement impossible de savoir si un email/téléphone RENSEIGNÉ est valide (seulement s'il est absent). Ajouté en 4 champs additifs dans `toProjectCard()` — même précédent que `dateLimiteIngenieur` (Business Reasoning) : aucune nouvelle colonne, aucune nouvelle requête, un simple passage de ce qui était déjà chargé.

## Score Qualité — la formule exacte

```
pénalité = Σ (poids_catégorie × nombre d'occurrences dans cette catégorie)
score = 100 − pénalité / nombre_de_projets_audités   (borné entre 0 et 100, arrondi)
```

Poids (`QUALITY_SCORE_WEIGHTS`, `dataQualityAnalyzer.js`) : doublons=8, incohérences=6, erreurs de workflow=6, emails invalides=5, téléphones invalides=5, données orphelines=5, informations manquantes=3, documents manquants=3 — reflète une gravité relative assumée (un doublon fausse potentiellement TOUTES les statistiques du projet dupliqué ; un document manquant est gênant mais isolé). Diviser par le nombre de projets audités rend le score stable quelle que soit la taille du jeu de données (10 projets avec 5 problèmes se notent comme 100 projets avec 50). **Un heuristique documenté, pas une mesure statistique validée** — même discipline que `ProjectAttentionAnalyzer` (voir `BUSINESS_REASONING.md`).

## "Ne jamais modifier les données automatiquement" — une garantie STRUCTURELLE, pas une promesse

`DataQualityAgent.ALLOWED_TOOL_NAMES` contient **UN SEUL Tool, en lecture seule : `list_projects`** — ni `move_project_stage`, ni `assign_project_owner` (les 2 Tools d'écriture du module Projects), ni aucun autre Tool capable de modifier une donnée. Même si le modèle de langage "décidait" d'agir, aucun Tool capable de le faire ne lui est accessible (`_allowedTools()` les filtre avant même que le modèle ne les voie) — vérifié explicitement par `test/ai.agents.dataQualityAgent.test.js`, "garantie : ne modifie JAMAIS rien automatiquement" (des Tools d'écriture fournis au constructeur, comme n'importe quel autre Tool du système, ne sont ni exposés ni jamais appelés).

Chaque `correction` proposée (`reasoning/dataQualityAnalyzer.js`, un champ sur CHAQUE élément détecté) est une phrase française descriptive — jamais un appel de Tool, jamais un objet exécutable (`JSON.parse(JSON.stringify(réponse)) === réponse`, testé explicitement).

## Toujours l'audit complet, jamais une sélection par mots-clés

Même choix que `RecommendationAgent` : `DataQualityAgent._run()` ignore le contenu du message — TOUTE question qui atteint l'intention `data_quality` déclenche les 8 détections. Un auditeur n'audite pas à la carte.

## Ce qui n'a pas été fait (délibérément)

- **Doublons/emails/téléphones invalides sur les contacts commerciaux** — aucun Tool MCP existant ne liste les contacts commerciaux individuellement (seulement des KPI agrégés, voir `BUSINESS_ANALYST.md`) ; hors de portée sans un nouveau Tool, non ajouté dans cette passe.
- **"Documents manquants" au sens strict (devis absent, pièce administrative précise)** — `attachmentsCount === 0` est un PROXY honnête (aucune pièce jointe DU TOUT), pas une vérification de la présence d'un document précis (ex. un devis) — cette dernière nécessiterait `devisCount`, absent de `list_projects` (voir `BUSINESS_ANALYST.md`, section devis, même limite).
- **Application automatique d'une correction, même avec confirmation utilisateur** — explicitement hors périmètre ("Ne jamais modifier les données automatiquement") ; si un jour demandé, cela nécessiterait un Tool d'écriture dédié, une confirmation explicite, et une passe de conception séparée sur les permissions — pas une extension silencieuse de cet Agent.

## Tests

- `test/ai.reasoning.dataQualityAnalyzer.test.js` : chacune des 8 fonctions de détection isolément (déclenchée/non déclenchée, jamais un problème fabriqué), la formule exacte du Score Qualité vérifiée par le calcul.
- `test/ai.reasoning.dataQualityAnswerBuilder.test.js` : en-tête Score Qualité toujours présent, catégories vides omises, message honnête si rien à signaler.
- `test/ai.agents.dataQualityAgent.test.js` : audit systématique quel que soit le message, un projet cumulant plusieurs problèmes déclenche les bonnes sections, **la garantie centrale** — des Tools d'écriture fournis ne sont jamais accessibles ni appelés, les corrections restent du texte pur.
- `test/ai.agents.manifest.test.js`/`ai.agents.policy.test.js`/`ai.orchestrator.pipeline.test.js` : mis à jour pour refléter les 14 Agents et la nouvelle intention `data_quality`.
- `test/fixtures/copilotValidationScenarios.js` (+7 scénarios, `dq-01`..`dq-07`) et les deux suites `ai.validation.copilotScenarios.test.js`/`ai.validation.copilotEndToEnd.test.js` — voir `COPILOT_VALIDATION.md`.
