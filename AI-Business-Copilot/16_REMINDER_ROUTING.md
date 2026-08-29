# "Créer un rappel" → réponse KPI hors sujet : cause, fallback audité, correction

> Suite de `15_AGENT_RUNTIME_AUDIT.md`. Flutter non touché. Aucune donnée
> fictive. RBAC jamais contourné. Aucune écriture réelle sans confirmation.

## CAUSE EXACTE

`intentCatalog.js` ne contenait AUCUN mot-clé pour les rappels — "rappel"
ne recoupe aucune des 19 intentions existantes. "Créer un rappel", envoyé
SEUL, retombe donc sur `general_chat` (0 point, repli délibéré). Sur un
écran Dashboard, la garde "intention > contexte" (`10_INTENT_ROUTING_FIX.md`
étape 14 — conçue pour laisser le contexte AIDER un message par ailleurs
sans signal) ajoute alors le préfixe "[Contexte d'écran... le tableau de
bord.]" : le message combiné score `dashboard`=2 ("tableau"/"bord") contre
0 pour tout le reste, donc **`kpi_agent` est sélectionné pour une demande
qui n'a strictement rien à voir avec les KPI**. Une fois sélectionné,
`kpi_agent` ne regarde quasiment jamais le contenu réel du message (voir
ci-dessous) : il retourne TOUJOURS la même analyse déterministe.

## AGENT ACTUELLEMENT UTILISÉ (avant correction)

`kpi_agent`, sur écran Dashboard (ou tout écran dont le préfixe de
contexte contient assez de mots-clés `dashboard`).

## POURQUOI KPI_AGENT ÉTAIT APPELÉ

Reproduit exactement, offline, déterministe :
```
"Créer un rappel" (seul)                          -> general_chat  (assistant_agent)
"[Contexte : tableau de bord]\n\nCréer un rappel"  -> dashboard     (kpi_agent)   ← AVANT correction
```
Ce n'est PAS un fallback caché "UNKNOWN → KPI_AGENT" — voir §FALLBACK
RESPONSABLE : c'est le même mécanisme de dilution de contexte déjà
documenté deux fois (`11_MEETING_AGENT_FIX.md` pour "Programmer une
réunion", exactement analogue).

**La phrase "17 projets personnels, taux de réussite de 0%" elle-même**
vient de `src/ai/reasoning/businessAnalyzer.js:67`
(`analyzeKpiDomain()`), appelée INCONDITIONNELLEMENT par
`KpiAgent._run()` (`kpiAgent.js:91`) — cet Agent est délibérément
déterministe : il construit TOUJOURS le même tableau de bord complet
(résultat/comparaison/prévision/alertes/graphique) pour TOUTE question qui
atteint son intention, sans jamais vraiment lire `message` (seule
exception : `LEGACY_MARKERS`, non pertinent ici) — voir le docstring de
`KpiAgent` lui-même ("un tableau de bord ne se construit pas à la carte").
`kpi_agent` n'est donc PAS en cause : sa logique est correcte pour de VRAIES
questions KPI, le problème est en amont, au ROUTAGE.

## FALLBACK RESPONSABLE

**Audit exhaustif effectué, résultat négatif** : recherché
`defaultIntentKey`/`defaultRoute`/`DEFAULT_AGENT` dans `IntentDetector`,
`AgentRouter`, `AIManager`, `LexicalIntentRouter`, `pipeline.js`,
`agents/manifest.js`. **Aucun fallback "UNKNOWN → KPI_AGENT" /
"LOW_CONFIDENCE → KPI_AGENT" / "NO_MATCH → KPI_AGENT" n'existe nulle part
dans ce code.** Le seul repli configuré est `defaultIntentKey =
"general_chat"` (`AI_ORCHESTRATOR_DEFAULT_INTENT`, non redéfini dans
`.env`), qui route vers **`assistant_agent`**, jamais `kpi_agent`. La règle
demandée à l'étape 11 (UNKNOWN ≠ KPI_AGENT, LOW_CONFIDENCE ≠ KPI_AGENT,
NO_MATCH ≠ KPI_AGENT) est donc déjà et a toujours été respectée par le
code — rien à supprimer. La cause réelle est la dilution de contexte
décrite ci-dessus, pas un fallback.

## FICHIER

`src/ai/orchestrator/intentCatalog.js` (nouvelle intention `reminders`,
racine du problème) ; `src/ai/agents/meetingAgent.js` (Agent étendu).

## FONCTION

`LexicalIntentRouter.route()` — inchangée, mais dispose maintenant d'un
mot-clé réel pour "rappel" ; `createMeetingAgent()` (`intentNames` étendu).

## RECHERCHE DU MODULE EXISTANT (étape 6, effectuée avant toute implémentation)

Ce CRM n'a **aucun mécanisme de rappel autonome** :
- `ProjectReminder` (modèle réel) exige `projectId` **ET** `actionId`
  (`allowNull: false` sur les deux) — jamais un enregistrement
  indépendant. Le commentaire du Tool `create_project_action` le confirme
  explicitement : *"dans ce CRM, un rappel n'est jamais un enregistrement
  indépendant, toujours attaché à une activité"* — une contrainte de
  conception délibérée, pas un oubli.
- `notification.service.js::sendEmailNotification` envoie IMMÉDIATEMENT
  (pas de champ `dueAt`/rappel programmé).
- Le SEUL mécanisme réel capable d'un rappel SANS projet (sujet + date +
  heure, rien d'autre requis) est le **calendrier Google**, déjà intégré
  (`services/googleCalendar.service.js`, 4 Tools MCP déjà construits pour
  `meeting_agent` — `11_MEETING_AGENT_FIX.md`). **Réutilisé tel quel** —
  aucun nouveau Tool, aucun second Agent, aucune deuxième base de données.

## CORRECTION

**1. Nouvelle intention `reminders`** (`intentCatalog.js`), `moduleKey:
"googleCalendar"` (le même que `meetings`), mots-clés `["rappel", "rappels",
"rappelle"]`. Enregistrée APRÈS `commercial_contacts` (vérifié : "Quels
contacts commerciaux nécessitent un rappel ?", `com-40`/`reg-40`, doit
rester `commercial_contacts` sur une égalité avec "contacts" — confirmé
sans régression).

**2. `meeting_agent` gère désormais `["meetings", "reminders"]`** (une
ligne changée dans `meetingAgent.js`, `BaseAgent.canHandle()` supporte déjà
plusieurs `intentNames` nativement) — **jamais un second Agent créé**.
Prompt système étendu : un rappel EST un événement calendrier (sujet +
horaire), donc les mêmes règles déjà éprouvées (une question à la fois,
jamais de participants inventés, confirmation explicite avant tout Tool
d'écriture) — plus une clause honnête ajoutée : le prompt avoue
explicitement ne PAS pouvoir lister les rappels/réunions existants (aucun
Tool de listing réel n'existe côté calendrier) plutôt que d'inventer une
réponse à "Quels sont mes rappels ?".

**3. Aucune modification du Router/IntentDetector/AgentRouter eux-mêmes**
— la garde "intention > contexte" (`aiCopilotBridge.service.js`) protège
`reminders` automatiquement, EXACTEMENT comme elle protège déjà `meetings`
depuis `11_MEETING_AGENT_FIX.md`, sans une seule ligne modifiée dans ce
fichier — preuve que ce mécanisme est réellement générique.

## Statut par Agent

| Agent | Statut |
|---|---|
| `meeting_agent` (réunions + rappels) | **OK** — routage corrigé, conversation à 4 tours vérifiée pour le dialogue exact demandé à l'étape 8 |
| `kpi_agent` | **OK** — jamais en cause ; continue de répondre UNIQUEMENT quand `dashboard` est réellement l'intention |
| `crm_assistant_agent` | **OK** — "Comment créer un rappel ?" route correctement vers HELP_HOW_TO |
| `project_agent` | **OK** — non affecté par cet incident |

## TEST "Créer un rappel"

```
{ intent: "reminders", entity: "reminder", confidence: 0.9, agent: "meeting_agent" }
```
`agent != KPI_AGENT` — confirmé. Sur les 3 écrans (dashboard/projet/
commercial), le message atteint `AIManager` sans préfixe de contexte
(`test/aiCopilotBridge.service.test.js`, étape 17).

## TEST "Quels sont mes KPI ?"

`{ intent: "commercial_contacts", confidence: 0.55, agent: "commercial_agent" }`
— déjà connu et documenté honnêtement depuis `10_INTENT_ROUTING_FIX.md`
(égalité réelle "kpi" entre `commercial_contacts`/`dashboard`, hors
périmètre de cet incident) : ce cas déclenche `intent.ambiguous` côté
`AIManager` et retourne une VRAIE demande de clarification, jamais un
agent choisi au hasard — mécanisme déjà en place, non modifié ici.

## TEST "Comment créer un projet ?"

`{ intent: "documentation_question", confidence: 0.95, agent: "crm_assistant_agent" }` — inchangé, toujours correct.

## TEST "Programmer une réunion"

`{ intent: "meetings", confidence: 0.9, agent: "meeting_agent" }` — inchangé, toujours correct.

## Tests

- `test/ai.orchestrator.intentConfidence.test.js`/catalogue : entité `reminders` → `"reminder"`.
- `test/ai.agents.meetingAgent.test.js` (+4 tests) — `canHandle("reminders")`, prompt honnête sur le listing, traitement unifié rappel/réunion.
- `test/ai.agents.manifest.test.js` — `reminders` ajouté à la matrice intent→agent (`meeting_agent`).
- `test/fixtures/copilotValidationScenarios.js` (+9 scénarios, `reg-32`..`reg-40`, dont la régression obligatoire et la non-régression `com-40`).
- `test/aiCopilotBridge.service.test.js` (+3 tests) — garde contexte sur 3 écrans.
- `test/ai.diagnosis.reminderConversation.test.js` (**nouveau**) — le dialogue EXACT de l'étape 8, 4 tours, mémoire réelle, confirmation avant création.

```
npm test (suite complète)
Test Suites: 2 failed, 179 passed, 181 total
Tests:       21 failed, 5125 passed, 5146 total
```
Les 21 échecs restent exclusivement `test/mfa.test.js`/`test/mfa.dedup.test.js` — préexistants, sans aucun rapport.

## Comment vérifier ce rapport

```bash
cd "Backend Master"
git diff -- src/ai/orchestrator/intentCatalog.js src/ai/agents/meetingAgent.js
npx jest test/ai.diagnosis.reminderConversation.test.js test/ai.agents.meetingAgent.test.js test/aiCopilotBridge.service.test.js test/ai.validation.copilotScenarios.test.js --verbose
npm test
```
