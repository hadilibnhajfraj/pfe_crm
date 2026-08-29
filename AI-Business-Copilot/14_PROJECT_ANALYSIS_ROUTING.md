# Audit du routage — "pourquoi ce projet est critique" doit être une analyse, pas une question d'aide

> Suite de `13_LLM_QUOTA_ROOT_CAUSE.md` (le LLM Provider était la seule
> cause des échecs d'agents — corrigé côté observabilité). Cette passe
> revient au ROUTAGE, avec un vrai bug prouvé cette fois (contrairement au
> "d'accord pour créer un projet comment" de `12_AGENT_FAILURE_DIAGNOSIS.md`,
> qui ne se reproduisait plus). RBAC jamais contourné, aucune donnée
> fictive, aucune opération destructive.

## CAUSE DU MAUVAIS ROUTAGE

`documentation_question` (`intentCatalog.js`) porte le mot-clé "pourquoi"
depuis le tout premier passage de ce catalogue — pensé pour des questions
sur le FONCTIONNEMENT général du CRM ("Pourquoi une demande passe-t-elle
par plusieurs étapes ?", déjà dans le corpus, `doc-07`). Cette même
intention gagne TOUJOURS une égalité de score (règle "priorité procédurale",
`10_INTENT_ROUTING_FIX.md`) — un mécanisme délibéré et correct pour
"comment", mais qui traite "pourquoi" exactement pareil, alors que
"pourquoi" est sémantiquement ambigu : ça peut demander une RÈGLE générale
(documentation) ou l'ÉTAT réel d'une donnée précise (analyse).

## Pourquoi "pourquoi projet Depot SBF est critique" arrivait dans CRM_ASSISTANT_AGENT

Reproduit et tracé (diagnostic offline, déterministe — la détection
d'intention ne nécessite aucun LLM) :
```
tokens: pourquoi, projet, depot, sbf, est, critique
documentation_question : 1 point ("pourquoi")
projects                : 1 point ("projet")
→ égalité exacte, documentation_question gagne par priorité procédurale
```
"critique" ne compte pour AUCUNE intention : ce n'est un mot-clé de
catalogue nulle part (seulement un marqueur LOCAL de `ProjectAgent`,
`ATTENTION_MARKERS`, qui n'intervient qu'APRÈS que `projects` a déjà été
choisi). Sans lui, "projet" seul (1 point) ne peut jamais dépasser
"pourquoi" (1 point) — égalité systématique, toujours perdue face à la
priorité procédurale.

## Fichier responsable

`src/ai/orchestrator/intentCatalog.js` (mot-clé "pourquoi" de
`documentation_question`, existant, jamais isolément fautif) combiné à
`src/ai/orchestrator/intentDetector.js` (mécanisme de priorité procédurale,
`10_INTENT_ROUTING_FIX.md`) — la COMBINAISON des deux, jamais l'un seul.

## Fonction responsable

`LexicalIntentRouter.route()` (`src/ai/langchain/router/lexicalIntentRouter.js`,
inchangé) départage l'égalité par ordre d'enregistrement du catalogue —
`documentation_question` étant enregistrée en premier, elle gagne.

## Correction

**Essayé d'abord et REJETÉ, avec preuve** : ajouter "critique"/"critiques"
comme mot-clé global de l'intention `projects` (même mécanisme que
"retard", déjà un mot-clé sûr). Calculé AVANT d'écrire une seule ligne :
casse au moins 3 scénarios déjà validés du corpus —
- `rec-12`/`rec-20` : "Peux-tu me conseiller et prioriser les projets
  critiques à surveiller ?" — "critique" y est le SUJET d'un vrai conseil
  (`recommendation`, déjà 2 points via "conseiller"+"prioriser"), pas une
  demande d'analyse ; ajouter "critique" à `projects` créerait une égalité
  2-2 tranchée à tort en faveur de `projects` (enregistrée avant
  `recommendation`).
- `mnt-14` : "Liste toutes les demandes de maintenance filtrées par urgence
  critique." — aucun rapport avec un projet ; "critique" y créerait une
  égalité 1-1 avec `maintenance`, tranchée à tort en faveur de `projects`.

Exactement la mise en garde déjà écrite dans `intentCatalog.js` au sujet de
"risque"/"priorité" pour `business_analysis`/`recommendation` — "critique"
est un mot bien trop générique pour devenir un mot-clé GLOBAL.

**Corrigé, sans toucher au catalogue ni au routeur générique** :
`src/ai/orchestrator/projectAnalysisOverride.js` (nouveau) — un override
ÉTROIT, appliqué uniquement APRÈS que le routeur ait déjà choisi
`documentation_question`, et seulement si le message combine LES TROIS
signaux à la fois : un marqueur analytique ("pourquoi"), une référence à un
projet ("projet"/"projets"), et un mot d'état réel de projet
("critique"/"bloqué"/"risque" — le même vocabulaire que
`ATTENTION_MARKERS`, jamais une seconde liste inventée). Câblé dans
`intentDetector.js::detect()`, documenté comme LA seule exception
délibérée à "ne réimplémente aucune logique de routage". `confidence`
enrichi en conséquence (`intentConfidence.js`) : un nouveau palier 0.90
("ANALYSE DE PROJET DÉLIBÉRÉE"), une victoire par règle explicite, pas un
hasard — jamais fabriqué.

**Corrigé également** (étape 9, mandat explicite) : "Quel est mon taux de
réussite ?" retombait sur `general_chat` (0 mot-clé). "taux"/"reussite"/
"réussite" ajoutés aux mots-clés de `dashboard` — vérifié SANS régression
contre le corpus entier (les messages `commercial_contacts` qui mentionnent
aussi "taux", ex. `com-04`, restent `commercial_contacts` : cette intention
est enregistrée AVANT `dashboard` et gagne déjà sur son propre mot-clé
"contacts").

**Étape 6 (UNKNOWN → CRM_ASSISTANT comme fallback) — déjà respectée,
vérifiée, pas modifiée** : l'intention par défaut (`general_chat`) route
vers `assistant_agent` (un concierge générique RAG), **jamais**
`crm_assistant_agent` — les deux Agents sont déjà distincts dans
`agents/manifest.js`. Le bug rapporté n'était donc jamais un "fallback
UNKNOWN → CRM Assistant" au sens propre, mais une vraie collision de score
entre deux intentions RÉELLES (`documentation_question` vs `projects`) — la
distinction est documentée explicitement dans `docs/ai/AGENT_ROUTING.md`
pour éviter la confusion à l'avenir. Le mécanisme de clarification
automatique (`intent.ambiguous`, `10_INTENT_ROUTING_FIX.md` étape 11) reste
délibérément étroit (vérifié : 0 déclenchement inattendu sur les 568
scénarios du corpus) — l'élargir à CHAQUE repli `general_chat` casserait
des messages de conversation générale légitimes (voir corpus, section
"CONVERSATION GÉNÉRALE").

## Fichiers modifiés

- `src/ai/orchestrator/intentCatalog.js` — 3 mots-clés ajoutés à `dashboard` ("taux"/"reussite"/"réussite"), commentaire explicatif ; AUCUN mot-clé ajouté à `projects` (rejeté, voir ci-dessus).
- `src/ai/orchestrator/projectAnalysisOverride.js` (**nouveau**) — l'override étroit.
- `src/ai/orchestrator/intentDetector.js` — câblage de l'override + traçabilité (`overriddenFrom`).
- `src/ai/orchestrator/intentConfidence.js` — nouveau palier de confiance 0.90.
- `docs/ai/AGENT_ROUTING.md` — section clarifiant `general_chat`/`assistant_agent` vs `crm_assistant_agent`.
- Tests : `test/ai.orchestrator.projectAnalysisOverride.test.js` (**nouveau**, 16 tests), `test/ai.orchestrator.intentConfidence.test.js` (+2), `test/fixtures/copilotValidationScenarios.js` (+6 scénarios, dont la régression obligatoire).

**Aucun Agent modifié** (CRM Assistant/Meeting Agent/KPI Agent/Project Agent — consigne respectée). **Aucun fichier Flutter touché.**

## Tests avant

```
npm test (état après 13_LLM_QUOTA_ROOT_CAUSE.md)
Test Suites: 2 failed, 176 passed, 178 total
Tests:       21 failed, 5021 passed, 5042 total
```
"pourquoi projet depot SBF est critique" → `documentation_question`/`crm_assistant_agent` (confirmé faux, reproduit).

## Tests après

```
npm test (suite complète)
Test Suites: 2 failed, 177 passed, 179 total
Tests:       21 failed, 5070 passed, 5091 total
```
+49 tests nets (568 scénarios de corpus au total, +6 pour cet incident × 5 assertions = 30, + 16 tests unitaires `projectAnalysisOverride` + 2 tests `intentConfidence` + 1 nouvelle suite). Les 21 échecs restants sont exclusivement `test/mfa.test.js`/`test/mfa.dedup.test.js` — préexistants, sans aucun rapport (confirmé, aucun fichier MFA touché).

## Résultat attendu — vérifié en direct (backend, hors Flutter)

| Question | Intent | Entity | Action | Confidence | Agent | Tool |
|---|---|---|---|---|---|---|
| "Comment créer un projet ?" | documentation_question | project | CREATE | 0.95 | **crm_assistant_agent** | — |
| "pourquoi projet depot SBF est critique" | **projects** | project | ANALYZE | **0.90** | **project_agent** | list_projects |
| "Pourquoi le projet Depot SBF est critique ?" | projects | project | ANALYZE | 0.90 | project_agent | list_projects |
| "Programmer une réunion" | meetings | meeting | CREATE | 0.90 | **meeting_agent** | get_calendar_status |
| "Comment programmer une réunion ?" | documentation_question | meeting | CREATE | 0.95 | crm_assistant_agent | — |
| "Quel est mon taux de réussite ?" | dashboard | kpi | QUERY | 0.90 | kpi_agent | get_dashboard_kpis |

Exactement le résultat demandé, vérifié par exécution réelle (pas une
lecture de code) — `IntentDetector`/`AgentRegistry` réels, aucun mock.

## Comment vérifier ce rapport

```bash
cd "Backend Master"

# La cause + la correction
git diff -- src/ai/orchestrator/intentCatalog.js src/ai/orchestrator/intentDetector.js src/ai/orchestrator/intentConfidence.js
cat src/ai/orchestrator/projectAnalysisOverride.js

# Tests dédiés à cet incident
npx jest test/ai.orchestrator.projectAnalysisOverride.test.js test/ai.orchestrator.intentConfidence.test.js test/ai.validation.copilotScenarios.test.js --verbose

# Régression complète
npm test
```
