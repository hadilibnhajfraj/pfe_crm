# Recommendation Agent — le Copilot devient un conseiller

Ce document décrit le 13e Agent du Copilot : à chaque question, il propose 7 catégories de conseil — **priorités**, **tâches importantes**, **clients à relancer**, **projets critiques**, **risques**, **anomalies**, **actions recommandées** — chacune JUSTIFIÉE par une raison réelle, jamais une affirmation sans preuve. Point d'entrée : `agents/recommendationAgent.js`, règles métier : `reasoning/recommendationEngine.js`.

## Recommendation Agent vs Business Analyst Agent

Les deux Agents partagent le mot "recommandation", d'où une distinction volontairement nette :

| | **Business Analyst Agent** (`BUSINESS_ANALYST.md`) | **Recommendation Agent** (ce document) |
|---|---|---|
| Rôle | EXPLIQUE un domaine choisi par l'utilisateur ("analyse les projets") | CONSEILLE de façon proactive, sans domaine nommé ("conseille-moi") |
| Déclenchement | Détection de domaine dans le message (KPI/projets/ventes/...) | Systématique : TOUTE question qui atteint l'intention produit les 7 catégories |
| Sortie | Résultat / Causes / Risques / Recommandations, **par domaine demandé** | Priorités / Tâches / Clients / Projets critiques / Risques / Anomalies / Actions, **toujours les 7 à la fois** |
| Intention | `business_analysis` (mots-clés : analyse(r), performance(s), recommandation(s)) | `recommendation` (mots-clés : conseiller/conseille/conseils, prioriser/priorise/priorises, anomalie(s)) |

## D'où vient chaque catégorie — jamais une deuxième logique de scoring

`RecommendationAgent` appelle `list_projects` (déjà existant) puis réutilise **intégralement** `ProjectAttentionAnalyzer.analyzeProjectAttention()` et `dataCoherenceChecker.checkProjectsCoherence()` (Business Reasoning, voir `BUSINESS_REASONING.md`) — le calcul du score/priorité/facteurs par projet n'est PAS refait. `reasoning/recommendationEngine.js` ne fait que **reclasser** ces mêmes `factors`/`dataQuality` déjà calculés, une fonction pure par catégorie :

| Catégorie | Règle métier (nouvelle) | Source des données (déjà existante) |
|---|---|---|
| Priorités | Les projets dont la priorité n'est pas "faible", triés par score, limités à 5 | `ProjectAttentionAnalyzer` |
| Tâches importantes | Les facteurs de dimension **"blocage"** (une action réellement bloquée) | `ProjectAttentionAnalyzer` |
| Clients à relancer | Les facteurs de dimension **"retard"** (relance de suivi dépassée) — proxy assumé, voir plus bas | `ProjectAttentionAnalyzer` |
| Projets critiques | Les projets dont la priorité est **"critique"** | `ProjectAttentionAnalyzer` |
| Risques | Tous les facteurs des projets "critique"/"elevee", plus un signal agrégé si `get_maintenance_stats.critique > 0` | `ProjectAttentionAnalyzer` + `get_maintenance_stats` |
| Anomalies | Chaque avertissement de fiche incomplète/incohérente | `dataCoherenceChecker` |
| Actions recommandées | `SuggestionEngine.suggestForFactors()` sur l'union des facteurs des projets signalés — déjà filtré par permission | `SuggestionEngine` (Smart Suggestions, `SMART_SUGGESTIONS.md`) |

## "Clients à relancer" — un proxy assumé, documenté honnêtement

Aucun Tool MCP existant ne liste les relances programmées PAR CONTACT COMMERCIAL (vérifié lors de la construction du Business Analyst Agent, voir `BUSINESS_ANALYST.md`, section devis — même limite). La dimension "retard" de `ProjectAttentionAnalyzer` (relance de PROJET dépassée) est le signal le plus proche déjà exposé par un Tool existant — chaque projet étant rattaché à un client/propriétaire, une relance de projet en retard est traitée comme un indicateur valable de "client à relancer". Ce n'est PAS une liste de contacts commerciaux au sens strict — documenté ici comme au moment de la conception, pas découvert après coup.

## Toujours les 7 catégories, jamais une sélection par mots-clés

Contrairement à `ProjectAgent` (dont le raisonnement déterministe ne se déclenche que sur un marqueur d'attention) et à `BusinessAnalystAgent` (qui choisit le(s) domaine(s) selon des mots du message), `RecommendationAgent._run()` ignore le contenu du message : TOUTE question qui atteint l'intention `recommendation` produit systématiquement les 7 catégories. C'est la demande explicite ("Il doit proposer : les priorités, les tâches importantes, ...") — un conseiller ne conseille pas à la carte.

## `get_maintenance_stats` est best-effort

Si ce Tool est absent ou refusé pour le rôle courant, seul le signal de risque "maintenance" manque — les 6 autres catégories restent normalement calculées à partir de `list_projects` seul. Jamais une exception qui casse tout le tour de conversation.

## Une catégorie vide n'est jamais mentionnée

`recommendationAnswerBuilder.js` n'affiche que les catégories qui ont RÉELLEMENT quelque chose à dire — une liste de 7 titres suivis de "rien à signaler" serait du bruit, pas un conseil. Si les 7 catégories sont vides (aucun projet signalé, aucune anomalie, aucune maintenance critique, aucune suggestion), un seul message honnête est renvoyé.

## Ce qui n'a pas été fait (délibérément)

- **"Clients à relancer" au sens strict (CommercialContact)** — voir plus haut, hors de portée sans un nouveau Tool.
- **Un nouveau système de scoring** — délibérément écarté : réutiliser `ProjectAttentionAnalyzer`/`dataCoherenceChecker`/`SuggestionEngine` était le choix le plus honnête (une seule source de vérité pour "pourquoi ce projet est signalé", déjà testée) plutôt que d'inventer une deuxième notion de priorité qui pourrait diverger de celle déjà utilisée par `ProjectAgent`/`BusinessAnalystAgent`.
- **Ventes/pipeline/devis comme sources de "clients à relancer"/"risques"** — `get_commercial_contact_analytics`/`get_professional_dashboard.pipeline` auraient pu enrichir davantage ces catégories ; non ajouté dans cette passe pour rester scopé sur ce qui était nécessaire pour couvrir honnêtement les 7 catégories demandées avec des règles claires, pas une extension future non demandée.

## Tests

- `test/ai.reasoning.recommendationEngine.test.js` : chacune des 6 fonctions de classement isolément — vérifie qu'aucune donnée n'apparaît sans un facteur/avertissement réel qui la justifie.
- `test/ai.reasoning.recommendationAnswerBuilder.test.js` : ordre des sections, catégories vides omises, message rassurant quand tout est vide.
- `test/ai.agents.recommendationAgent.test.js` : les 7 catégories ensemble sur un projet cumulant plusieurs signaux, systématique quel que soit le message (contrairement à `BusinessAnalystAgent`), actions recommandées permission-filtrées (même garantie que Smart Suggestions), `get_maintenance_stats` best-effort, traçabilité (`toolSteps`, `dataQuality`).
- `test/ai.agents.manifest.test.js`/`ai.agents.policy.test.js`/`ai.orchestrator.pipeline.test.js` : mis à jour pour refléter les 13 Agents, la nouvelle intention `recommendation`, et l'injection de `suggestionEngine` dans `RecommendationAgent`.
- `test/fixtures/copilotValidationScenarios.js` (+8 scénarios, `rec-01`..`rec-08`, persona Direction) et les deux suites `ai.validation.copilotScenarios.test.js`/`ai.validation.copilotEndToEnd.test.js` — voir `COPILOT_VALIDATION.md`.
