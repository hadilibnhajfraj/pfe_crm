# KPI Agent — Dashboard intelligent : analyses, comparaisons, prévisions, alertes, graphiques

Ce document décrit l'évolution du `KpiAgent` (intention `dashboard`, déjà existant) : d'un simple relais de chiffres bruts ("donne les chiffres tels que retournés par les Tools, sans les interpréter") vers un **Dashboard intelligent**, qui pour toute question qui atteint son intention construit systématiquement : un résultat chiffré, une comparaison au mois précédent, une explication de pourquoi ses indicateurs évoluent, une prévision heuristique, les alertes réelles, et les données d'un graphique. Point d'entrée : `agents/kpiAgent.js`, règles métier : `reasoning/kpiInsights.js` (nouveau) + `reasoning/businessAnalyzer.js::analyzeKpiDomain` (réutilisé, jamais une 2e logique de scoring).

## Ce qui a changé, et pourquoi

L'ancienne version de `KpiAgent` utilisait le workflow générique de `BaseAgent` (le modèle de langage choisit lui-même un Tool parmi les 4 autorisés puis répond). Cette version-ci a un `_run()` propre, entièrement déterministe — même choix architectural que `BusinessAnalystAgent`/`RecommendationAgent`/`DataQualityAgent` : un tableau de bord ne se construit pas "à la carte" selon la formulation exacte de la question, il se construit systématiquement, à chaque fois. `ReportingAgent` (intention `reporting`, mêmes 4 Tools) garde son rôle inchangé : une synthèse narrative écrite par le modèle de langage — CET Agent, lui, ne fait plus jamais appel au modèle de langage : chaque phrase de sa réponse est calculée, traçable à un champ réel.

## La seule donnée historique réellement disponible — la contrainte qui a guidé toute la conception

Aucun Tool MCP, aucune table, aucun cron ne stocke un instantané périodique des KPI (vérifié explicitement : aucun modèle `KpiHistory`/`DashboardSnapshot`, aucun cron dans `src/cron/` ne touche au dashboard). La SEULE série multi-points réelle est la répartition des projets **par mois de création** (`Project.createdAt`), déjà calculée côté CRM et exposée par 3 Tools :

| Tool | Champ | Rôle requis |
|---|---|---|
| `get_dashboard_kpis` | `charts.monthlyEvolution` (admin) / `charts.myMonthlyEvolution` (autres rôles) — `{month,total,validated,...}` | Aucun |
| `get_professional_dashboard` | `performance.monthlyEvolution` (non utilisé ici, doublon du précédent) | admin-tier |
| `get_legacy_dashboard_kpis` | `monthlyTrend` — `{month,total,won,revenue}` | admin-tier |

**Conséquence directe sur la conception** : comparaison/prévision/graphique n'opèrent JAMAIS sur une métrique instantanée isolée (ex. `myRelancesLate`, `totalPending`) — seulement sur ces 3 séries mensuelles réelles. Une métrique instantanée reste rapportée telle quelle (via `analyzeKpiDomain`, section "Résultat"), jamais comparée ni projetée.

## Les 6 volets demandés → la source réelle exacte

| Volet demandé | Comment il est construit | Source |
|---|---|---|
| **Analyses** | `analyzeKpiDomain(dashboardRaw)` — réutilisé tel quel (jamais une 2e logique de scoring) | `get_dashboard_kpis` (`reasoning/businessAnalyzer.js`, déjà existant depuis le Business Analyst Agent) |
| **Comparaisons** | `compareMonthlyEvolution(series, ["total","validated"])` — compare les 2 DERNIERS points de la série mensuelle | `get_dashboard_kpis.charts.monthlyEvolution`/`myMonthlyEvolution` |
| **"Pourquoi ce KPI augmente/diminue"** | `explainMetricMovement(...)` — la comparaison chiffrée (un fait) + les `causes` déjà identifiées par `analyzeKpiDomain` (une corrélation possible, JAMAIS une causalité affirmée) | Les deux ci-dessus, combinés |
| **Prévisions** | `forecastNextPeriod(series, field)` — tendance moyenne des 3 derniers points reportée sur le mois suivant, bornée à 0 | `get_dashboard_kpis` (+ `revenue` de `get_legacy_dashboard_kpis` si "vue historique") |
| **Alertes** | `analyzeKpiDomain(...).risks` (déjà réel) + `formatProfessionalAlerts(alerts)` — l'objet `alerts` DÉJÀ calculé par `get_professional_dashboard` (`overdueProjects`, `missingValidation`, `missingDocuments`, `unreadNotifications`), jamais un nouveau seuil inventé | `get_dashboard_kpis` + `get_professional_dashboard` (admin-tier, meilleur effort) |
| **Graphiques** | `buildChartSeries(series, fields)` → `{labels, series:[{name,data}]}` — la première structure "graphique" exposée côté backend pour ce domaine | `get_dashboard_kpis` |

## Pourquoi "corrélation, jamais causalité" — une précision volontaire

Aucun Tool ne relie un chiffre de cause (ex. `totalPending`) à un mois précis dans le temps — affirmer qu'une cause EST la raison exacte d'une variation observée entre deux mois serait une invention (le même chiffre de causes est l'instantané ACTUEL, pas celui du mois précédent). `explainMetricMovement()` présente donc systématiquement les causes déjà identifiées comme des "facteur(s) pouvant y avoir contribué (corrélation, pas une causalité prouvée)" — jamais "c'est à cause de X". Une extension du principe "ne jamais inventer une donnée" à "ne jamais inventer un lien de causalité".

## Enrichissements en meilleur effort — jamais un échec qui invalide toute la réponse

- **`get_user_dashboard`** (répartition par famille/diamètre de produit, tout rôle) : ajouté systématiquement si des données existent ; silencieusement omis sinon (rien à ajouter n'est pas une erreur).
- **`get_professional_dashboard`** (alertes réelles, admin-tier) : tenté systématiquement ; un refus de rôle dégrade uniquement la section Alertes (qui garde les risques d'`analyzeKpiDomain`), jamais toute la réponse — même philosophie que `BusinessAnalystAgent::_invokeCached`.
- **`get_legacy_dashboard_kpis`** (vue historique/entonnoir de vente, admin-tier) : appelé UNIQUEMENT si le message contient un marqueur LOCAL à cet Agent (`historique`, `historiques`, `entonnoir`, `legacy` — même mécanisme que `ProjectAgent.ATTENTION_MARKERS`, jamais un mot-clé du catalogue d'intentions global) — évite un 3e appel Tool systématique pour une vue que la plupart des questions ne demandent pas.

## Ce qui n'a pas été fait (délibérément)

- **Un vrai modèle de prévision statistique** (ARIMA, régression, etc.) — hors de portée sans une vraie série temporelle multi-points fiable ; `forecastNextPeriod` reste un heuristique documenté comme tel (même discipline que `ProjectAttentionAnalyzer`/`dataQualityAnalyzer`).
- **Comparaison/prévision sur une métrique instantanée** (ex. `myRelancesLate`, `totalPending`) — aucune série historique ne les couvre ; ces métriques restent rapportées telles quelles, jamais comparées.
- **Un vrai rendu graphique (image, SVG)** — `buildChartSeries` expose uniquement les données `{labels, series}` (tracées dans `toolSteps`, formatées en texte dans la réponse) ; le rendu visuel appartient au frontend (Flutter), pas à ce Copilot.
- **Une causalité affirmée** — voir section dédiée ci-dessus.

## Tests

- `test/ai.reasoning.kpiInsights.test.js` : chacune des 5 fonctions pures isolément — comparaison (tri par mois, historique insuffisant, deltaPct nul par zéro évité, champ absent), prévision (tendance, jamais négative, historique insuffisant), graphique (champ manquant → 0, série vide), explication (hausse/baisse/stable, facteurs en corrélation), alertes professionnelles (seuils réels uniquement).
- `test/ai.reasoning.kpiAnswerBuilder.test.js` : les 6 sections toujours présentes (avec note honnête si non supporté), sections optionnelles (Recommandations, extraSections) ajoutées seulement si non vides.
- `test/ai.agents.kpiAgent.test.js` : identité, comparaisons/prévisions/graphiques/explications sur des données admin ET utilisateur standard (jamais mélangées), alertes réelles en meilleur effort (dégradation gracieuse sans casser toute la réponse), répartition produit, vue historique déclenchée par marqueur, jamais appelée sans lui, dégradation gracieuse sans `get_dashboard_kpis`, traçabilité (`toolSteps`).
- `test/ai.agents.specialized.test.js` : `KpiAgent` retiré de la table des "8 Agents simples" (il a désormais un `_run()` propre, comme les 3 autres Agents à raisonnement) — voir le fichier pour la liste à jour.
- `test/fixtures/copilotValidationScenarios.js` (+5 scénarios, `dir-19`..`dir-23`, persona "Direction") et les deux suites `ai.validation.copilotScenarios.test.js`/`ai.validation.copilotEndToEnd.test.js` — voir `COPILOT_VALIDATION.md`. Vérifié explicitement (script de diagnostic sur le vrai `intentDetector`) que ces 5 messages routent bien vers `dashboard` et non vers `commercial_contacts` (qui partage le mot-clé `kpi`, enregistré plus tôt dans le catalogue) ni `documentation_question` (qui possède `pourquoi`) — d'où la formulation "tableau de bord" systématiquement présente dans ces 5 messages.
