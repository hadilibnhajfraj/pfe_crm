# Incident — deux erreurs de compréhension sémantique : "comment" mal jugé procédural, "réunion" absorbée par KPI

> Suite de `10_INTENT_ROUTING_FIX.md` (règle "intention explicite > contexte
> d'écran" déjà en place). Cette passe traite deux cas non couverts par
> cette règle : une formulation informelle d'une question procédurale, et
> une demande d'action pour un domaine (réunions) qui n'existait
> simplement pas encore dans le système de routage. Voir
> `docs/ai/AGENT_ROUTING.md` pour la taxonomie/matrice complètes.

## 1. Cause exacte des deux erreurs

**Bug 1 — "d'accord pour créer un projet comment" → `project_agent` (échec).**
Reproduit offline (déterministe, la détection d'intention ne nécessite
aucun LLM) et EN DIRECT contre le vrai backend : sur le code déjà corrigé
par `10_INTENT_ROUTING_FIX.md`, cette phrase route en réalité vers
`documentation_question`/`crm_assistant_agent` — **non reproductible**
contre le code actuel, avec ou sans contexte d'écran (dashboard/projet/
commercial testés), avec ou sans historique de conversation
(`ConversationContextResolver` ne touche pas ce message : 6 tokens,
au-dessus du seuil de 5 pour la reformulation elliptique, et aucun marqueur
de référence/correction). Conclusion honnête : soit l'observation reflète
un état du serveur antérieur au correctif de `10_INTENT_ROUTING_FIX.md`
(processus Node.js non redémarré après ce correctif), soit une
conversation réelle porteuse d'un contexte non reproduit ici. Dans les deux
cas, le comportement CORRECT est maintenant verrouillé par 2 tests de
régression dédiés (`reg-15` du corpus, `aiCopilotBridge.service.test.js`)
qui échoueraient si `project_agent`/`kpi_agent` étaient jamais sélectionnés.

**Bug 2 — "Programmer une réunion" → analyse KPI. RÉEL, confirmé.**
`intentCatalog.js` ne contenait AUCUNE intention pour les réunions/
rendez-vous — "réunion" ne recoupe aucun mot-clé d'aucune des 18 intentions
existantes. Le message retombait donc sur `general_chat` (aucun signal).
La garde "intention > contexte" de `10_INTENT_ROUTING_FIX.md` — conçue
pour laisser le contexte d'écran AIDER un message par ailleurs sans signal
(ex. "Montre les ventes." sur Dashboard) — traitait alors ce cas
EXACTEMENT pareil : sur écran Dashboard, le préfixe ("tableau"/"bord", 2
mots-clés) était ajouté, et le message atteignait `IntentDetector` comme
`dashboard`/`kpi_agent`, un domaine totalement étranger à une réunion.
Reproduit offline ET en direct (voir §9).

## 2. Architecture AVANT

- 18 intentions dans le catalogue, 15 Agents (`AI-Business-Copilot/10_INTENT_ROUTING_FIX.md`).
- Aucune intention/Agent pour les réunions/rendez-vous — les 4 Tools
  `mcp/tools/googleCalendar/` (`get_calendar_status`/`create_calendar_event`/
  `update_calendar_event`/`delete_calendar_event`) existaient déjà mais
  n'étaient accessibles qu'en second rôle, via `automation_agent`
  (`moduleKey: null`, recherche multi-module), jamais comme domaine à part
  entière.
- La garde contexte-vs-intention ne distinguait qu'UN seul cas : "le
  message porte un signal" vs "le message n'en porte aucun" — sans notion
  de domaine "action non-KPI" pour la seconde catégorie.

## 3. Architecture APRÈS

- **19e intention réelle : `meetings`** (`intentCatalog.js`, `moduleKey:
  "googleCalendar"`), enregistrée AVANT `automation` (départage
  intentionnel du mot-clé partagé "planifier" en faveur d'un traitement
  dédié aux réunions plutôt que l'automatisation générique).
- **16e Agent : `meeting_agent`** (`src/ai/agents/meetingAgent.js`) —
  BaseAgent standard, réutilise les 4 Tools `googleCalendar` déjà
  existants (aucun nouveau Tool créé), prompt système qui exige
  sujet/début/fin avant toute création et interdit explicitement
  d'inventer un champ "participants" (absent du Tool réel).
- **La garde contexte-vs-intention (`aiCopilotBridge.service.js`) n'a EU
  BESOIN D'AUCUNE MODIFICATION** : dès que `meetings` existe dans le
  catalogue, "Programmer une réunion" porte SON PROPRE signal lexical
  ("réunion") — la garde déjà en place (étape 14 de l'incident précédent)
  la protège automatiquement, exactement comme elle protège déjà
  `documentation_question`/`projects`/etc. Preuve que la garde n'était pas
  un correctif ad hoc pour UN cas, mais un mécanisme générique — vérifié
  par simulation avant d'écrire le moindre test.
- **Observabilité enrichie** (`aiManager.js::_audit()`, étape 17) : chaque
  tour journalise maintenant `conversationId` (corrélation), `entities`,
  `confidence`, `agent`, `tools` (réels, dédupliqués), `executionTimeMs` —
  en plus de `actor`/`resource`/`outcome` déjà existants. Aucun second
  canal de logs, aucun contenu de message ni secret journalisé.

## 4. Fichiers modifiés

**Cœur de la correction :**
- `src/ai/orchestrator/intentCatalog.js` — nouvelle entrée `meetings`.
- `src/ai/agents/meetingAgent.js` (**nouveau**) — 16e Agent.
- `src/ai/agents/manifest.js` — enregistrement de `createMeetingAgent`.
- `src/ai/orchestrator/intentConfidence.js` — entité `meetings` → `"meeting"`.

**Observabilité (étape 17) :**
- `src/ai/orchestrator/aiManager.js` — `_audit()` enrichi (conversationId/entities/confidence/tools/executionTimeMs sur les 4 points d'audit : succès, refus, échec, ambiguïté).

**Documentation livrée (étape 19) :**
- `docs/ai/AGENT_ROUTING.md` (**nouveau**).
- `AI-Business-Copilot/11_MEETING_AGENT_FIX.md` (**nouveau**, ce fichier).

**Tests :**
- `test/ai.agents.meetingAgent.test.js` (**nouveau**, 5 tests).
- `test/ai.agents.specialized.test.js` (MeetingAgent ajouté à la table des Agents "simples").
- `test/ai.agents.manifest.test.js` (comptes 15→16, liste des Agents/intentions mise à jour).
- `test/ai.orchestrator.pipeline.test.js` (compte 15→16).
- `test/ai.orchestrator.aiManager.test.js` (2 assertions enrichies pour le nouveau contenu d'audit).
- `test/aiCopilotBridge.service.test.js` (+3 tests, régression bug 2 sur 3 écrans).
- `test/ai.validation.copilotEndToEnd.test.js` (+1, `meetings` représentatif).
- `test/fixtures/copilotValidationScenarios.js` (+11 scénarios `reg-15`..`reg-25`, dont les 2 régressions obligatoires).

**Aucun autre fichier touché** — en particulier aucune route Express, aucun modèle Sequelize, aucun Tool MCP (les 4 Tools `googleCalendar` sont réutilisés tels quels), aucune interface Flutter.

## 5. Agents créés/modifiés

| Agent | Statut |
|---|---|
| `meeting_agent` | **Créé** — intention `meetings`, 4 Tools `googleCalendar` réutilisés |
| Les 15 Agents existants | **Inchangés** (0 ligne modifiée dans leurs fichiers respectifs) |

## 6. Tools utilisés

Aucun nouveau Tool MCP créé. `meeting_agent` réutilise les 4 Tools déjà réels de `mcp/tools/googleCalendar/` (construits pour `AutomationAgent`) :
`get_calendar_status`, `create_calendar_event`, `update_calendar_event`, `delete_calendar_event`.

## 7. Nombre de tests

| Catégorie | Compte |
|---|---|
| Scénarios ajoutés au corpus (`reg-15`..`reg-25`) | 11 × 5 assertions = **55** |
| `test/ai.agents.meetingAgent.test.js` (nouveau) | **5** |
| `test/ai.agents.specialized.test.js` (MeetingAgent) | **4** |
| `test/aiCopilotBridge.service.test.js` (régression bug 2, 3 écrans) | **3** |
| `test/ai.validation.copilotEndToEnd.test.js` (+1) | **1** |
| **Total dédié à cet incident** | **68** |
| Suite complète scoped IA (`test/ai.*`, `aiCopilot*`, `aiDashboard*`) | **5016 tests** (176 suites) |

## 8. Tests réussis

```
npm test (suite complète)
Test Suites: 2 failed, 174 passed, 176 total
Tests:       21 failed, 4995 passed, 5016 total
```

Les 21 échecs : `test/mfa.test.js` + `test/mfa.dedup.test.js` uniquement — **préexistants, sans aucun rapport** (aucun fichier MFA touché, confirmé par `git diff --stat`). Tous les tests liés à l'IA/Copilot/Dashboard sont verts, y compris le corpus de validation étendu et les policies architecturales (`ai.agents.policy.test.js`, `ai.mcp.tools.policy.test.js`).

## 9. Résultat de "d'accord pour créer un projet comment"

Vérifié EN DIRECT contre le vrai backend, vrai compte réel (`516f6dca-7a6f-43cb-b527-5c5652e3e03f`), écran Dashboard actif :
```
=== BUG 1 === intent: documentation_question | agent: crm_assistant_agent | mode: agent
```
**Jamais `project_agent`.** La génération du texte final a de nouveau échoué sur un vrai `429` OpenAI (quota, déjà rencontré et documenté dans `10_INTENT_ROUTING_FIX.md`, reproduit une 3e fois — divulgué honnêtement) :
> "Désolé, crm_assistant_agent n'a pas pu traiter cette demande pour le moment. Merci de réessayer ou de reformuler."

Le routage — la partie réellement en cause dans le bug rapporté — est prouvé correct indépendamment du LLM (détection d'intention 100% offline/déterministe).

## 10. Résultat de "Programmer une réunion"

Vérifié EN DIRECT, même compte, écran Dashboard actif :
```
=== BUG 2 === intent: meetings | agent: meeting_agent | mode: agent
```
**Jamais `dashboard`/`kpi_agent`.** Même limitation de quota OpenAI, même dégradation propre (comportement déjà en place depuis `09_INCIDENT_KPI_AGENT.md`) :
> "Désolé, meeting_agent n'a pas pu traiter cette demande pour le moment. Merci de réessayer ou de reformuler."

Vérifié aussi sur les écrans Projet et Commercial (`aiCopilotBridge.service.test.js`) : le message atteint toujours `AIManager` sans préfixe de contexte, quel que soit l'écran actif.

## Comment vérifier ce rapport

```bash
cd "Backend Master"

# La nouvelle intention/Agent
git diff -- src/ai/orchestrator/intentCatalog.js src/ai/agents/manifest.js
cat src/ai/agents/meetingAgent.js

# Tests dédiés à cet incident
npx jest test/ai.agents.meetingAgent.test.js test/ai.agents.specialized.test.js test/aiCopilotBridge.service.test.js test/ai.validation.copilotScenarios.test.js test/ai.validation.copilotEndToEnd.test.js --verbose

# Régression complète
npm test
```
