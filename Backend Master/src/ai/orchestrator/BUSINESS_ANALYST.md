# Business Analyst Agent — analyser les données du CRM, jamais en inventer une

Ce document décrit le 12e Agent du Copilot : un analyste qui explique le RÉSULTAT, les CAUSES, les RISQUES et propose des RECOMMANDATIONS pour 8 domaines métier — en composant exclusivement des Tools MCP déjà existants, jamais un nouveau Tool. Point d'entrée : `agents/businessAnalystAgent.js`, moteur d'analyse : `reasoning/businessAnalyzer.js`.

## Les 8 domaines demandés → les Tools réels qui les alimentent

Chaque domaine est alimenté par un Tool MCP **déjà existant** — jamais un nouveau Tool créé pour cette passe. Vérifié en lisant le service réel derrière chaque Tool (pas supposé) :

| Domaine | Tool MCP existant | Champs réellement consommés |
|---|---|---|
| KPI | `get_dashboard_kpis` | `stats.{totalProjects,totalValidated,validationRate,totalPending}` (admin) ou `stats.{myProjects,successRate,myRelancesLate}` (personnel) |
| Projets | `list_projects` | Réutilise intégralement `ProjectAttentionAnalyzer`/`dataCoherenceChecker` (voir `BUSINESS_REASONING.md`) — aucune deuxième logique de scoring |
| Ventes | `get_commercial_contact_analytics` / `get_commercial_contact_kpi` | `global.{totalContacts,totalCalls,averageCallsPerContact,contactsNonValides}` |
| Pipeline | `get_professional_dashboard` (`.pipeline`) | `pipeline.stages[].{name,count,isWonStage,isLostStage}`, `pipeline.conversions.{total,conversionRate}` |
| Devis | **Aucun** | — voir "La garantie ne jamais inventer" ci-dessous |
| Activités | `list_projects` | `data[].actionsCount` |
| Interventions | `get_maintenance_stats` | `{total,enAttente,enCours,terminee,critique}` |
| Performance | `get_professional_dashboard` | `summary.{totalProjects,validationRate,successRate}`, `alerts.{overdueProjects,missingValidation,missingDocuments}` |

## Pourquoi pas `list_pipeline_stages` pour le pipeline

Vérifié en lisant `modules/pipeline/repositories/pipelineStage.repository.js` : `list_pipeline_stages` ne renvoie que des métadonnées d'étape (nom, couleur, position) — **aucun décompte de projets par étape**. Un `findAllWithProjectCount()` existe dans le repository mais n'est jamais exposé comme Tool MCP. Le seul Tool EXISTANT qui associe un décompte à chaque étape est `get_professional_dashboard.pipeline.stages[].count` — c'est donc celui-ci qui alimente le domaine "Pipeline", pas `list_pipeline_stages`.

## La garantie "ne jamais inventer une donnée" — le cas des devis

Aucun Tool MCP existant n'expose de métrique dédiée aux devis (nombre envoyés, taux de conversion) — vérifié : ni `list_projects` (le `devisCount` existe côté serveur mais uniquement dans la requête `findByIdFull`, jamais dans `toProjectCard()`/`list_projects`), ni `get_commercial_contact_kpi`/`_analytics` (aucune requête ne groupe par `pipelineStage`, alors que ce champ contient bien une valeur `"Devis envoyé"`). Plutôt que d'inventer un chiffre pour "avoir une réponse", `businessAnalyzer.js::analyzeDevisDomain()` renvoie explicitement `supported: false` avec une explication — **aucun Tool n'est même appelé** pour ce domaine. C'est la contrainte "ne jamais inventer une donnée" rendue concrète et testée (`test/ai.agents.businessAnalystAgent.test.js`, "garantie 'ne jamais inventer une donnée' (devis)").

## Le format de réponse — Résultat / Causes / Risques / Recommandations

`reasoning/businessAnalyzer.js` expose une fonction pure par domaine, chacune renvoyant `{ supported, result, causes, risks, recommendations }` — des tableaux de phrases françaises, CHACUNE reconstruite à partir d'un champ réellement présent dans la sortie du Tool (jamais une valeur par défaut arbitraire). `reasoning/businessAnalysisAnswerBuilder.js` met ces 4 volets en mots, un bloc `### <Domaine>` par domaine analysé — sans second appel au modèle de langage, même choix que `attentionAnswerBuilder.js` (Business Reasoning) : les phrases sont déjà correctes et tracées, les reformuler via un LLM n'ajouterait qu'un risque de dérive.

## Détection de domaine — locale à l'Agent, jamais dans le catalogue global

`BusinessAnalystAgent._detectDomains()` cherche, DANS le message, des marqueurs lexicaux propres à chacun des 8 domaines (`DOMAIN_DEFINITIONS`, `businessAnalystAgent.js`) — même mécanisme que `ATTENTION_MARKERS` de `ProjectAgent` (Business Reasoning), jamais un mot-clé du catalogue d'intentions global. Une question peut déclencher plusieurs domaines à la fois ("Analyse les projets et le pipeline"). Si aucun marqueur ne correspond, l'Agent retombe sur `["performance"]` (une vue d'ensemble) plutôt que sur le chemin tool-calling générique de `BaseAgent` — contrairement à `ProjectAgent` (où seule une question d'attention déclenche le raisonnement déterministe), CET Agent applique la structure à 4 volets à TOUTE question qui atteint son intention : c'est tout son rôle demandé ("Pour chaque réponse...").

Un Tool requis par plusieurs domaines dans la MÊME question (`list_projects` pour "projets" et "activités" ; `get_professional_dashboard` pour "pipeline" et "performance") n'est appelé qu'**une seule fois** — mis en cache le temps du tour de conversation.

## L'intention `business_analysis` — sécurité des mots-clés

Nouvelle entrée du catalogue (`orchestrator/intentCatalog.js`), mots-clés délibérément **exclusifs** : `analyse`, `analyser`, `analytique`, `performance`, `performances`, `recommandation`, `recommandations` — jamais `cause`/`risque`, trop génériques et déjà utilisés comme marqueurs LOCAUX ailleurs (les `ATTENTION_MARKERS` de `ProjectAgent` incluent `risque`/`risques` — les ajouter ICI, au niveau du catalogue GLOBAL, aurait fait basculer des questions déjà validées comme `"Quels projets ont un risque prioritaire ?"` vers cette nouvelle intention). Placée en avant-dernière position du catalogue (juste avant `general_chat`) : en cas d'égalité de score avec une intention déjà enregistrée (ex. "performance" apparaît dans une question purement commerciale, "analyser" dans une question purement projet), c'est TOUJOURS l'intention la plus spécifique et la plus ancienne qui gagne — vérifié explicitement par le corpus de validation (`test/fixtures/copilotValidationScenarios.js`, 200 scénarios existants rejoués sans régression après l'ajout).

## Un Tool qui échoue n'invalide pas toute la réponse

Chaque domaine appelle son Tool indépendamment. Si un Tool échoue (ex. `get_professional_dashboard` refusé à un rôle non admin-tier) ou n'est pas disponible pour cet Agent, le domaine correspondant reçoit une note honnête ("Impossible d'analyser ce domaine : ...", avec la vraie raison) — les AUTRES domaines demandés dans la même question restent normalement analysés.

## Ce qui n'a pas été fait (délibérément)

- **Devis** — non analysable avec les Tools actuels (voir plus haut) ; exposer `devisCount` via `list_projects` ou ajouter une agrégation par `pipelineStage` sur les contacts commerciaux serait un chantier légitime, mais créerait un nouveau Tool — hors périmètre explicite de cette passe ("toujours utiliser les AI Tools existants").
- **`list_pipeline_stages` enrichi d'un décompte** — `findAllWithProjectCount()` existe déjà côté repository mais n'est pas exposé comme Tool ; non exposé ici pour la même raison.
- **Recommandations dynamiques via `SuggestionEngine`** — contrairement à `ProjectAgent` (Smart Suggestions, filtré par permission), les recommandations de cet Agent sont des phrases déterministes fixes par dimension/domaine (`DIMENSION_RECOMMENDATIONS`, `businessAnalyzer.js`), pas des actions exécutables filtrées par Tool réel — une différence de nature assumée : ce sont des conseils d'ANALYSE ("vérifier X"), pas des actions à un clic ("créer un rappel").

## Tests

- `test/ai.reasoning.businessAnalyzer.test.js` : chacune des 8 fonctions d'analyse isolément, contre des formes de données RÉELLES (admin/personnel pour KPI, `pipeline.stages[]`/`conversions` pour le pipeline, etc.) — vérifie qu'aucune cause/risque n'est fabriqué quand rien ne le justifie.
- `test/ai.agents.businessAnalystAgent.test.js` : détection de domaine (simple et multi-domaine), sélection des Tools (jamais plus que nécessaire), mise en cache d'un Tool partagé par 2 domaines, la garantie "ne jamais inventer" pour les devis (aucun Tool appelé, aucun chiffre dans la réponse), dégradation partielle (un Tool en échec n'invalide pas les autres domaines), traçabilité (`toolSteps`).
- `test/ai.agents.manifest.test.js`/`ai.agents.policy.test.js` : mis à jour pour refléter les 12 Agents et la nouvelle intention `business_analysis`.
- `test/fixtures/copilotValidationScenarios.js` (+10 scénarios, `ana-01`..`ana-10`, persona Direction) et les deux suites `ai.validation.copilotScenarios.test.js`/`ai.validation.copilotEndToEnd.test.js` — voir `COPILOT_VALIDATION.md`.
