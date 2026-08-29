# Anthropic Claude comme fournisseur LLM alternatif

> Constat honnête en ouverture : `anthropicProvider.js` et le câblage
> factory/configuration existaient **déjà**, construits dans une passe
> antérieure de cette même session (`08_LLM_PROVIDER_OPENAI.md` a posé
> l'abstraction `ILlmProvider` avec le multi-fournisseur en tête — voir
> `AI-Business-Copilot/00_PLAN_DEVELOPPEMENT.md §13.2`). Vérifié par lecture
> directe AVANT d'écrire la moindre ligne (`ls src/ai/services/providers/`),
> conformément à la consigne "ne pas recréer l'architecture". Cette passe a
> donc consisté à : auditer l'existant contre les 14 exigences de la
> demande, combler les deux écarts mineurs trouvés, étendre la couverture de
> test, et vérifier l'absence de régression — pas à construire une nouvelle
> fonctionnalité depuis zéro.

## Fichiers créés

Aucun. Rien à créer : `anthropicProvider.js` répondait déjà à l'intégralité
de l'interface `ILlmProvider`.

## Fichiers modifiés

- `src/ai/services/providers/anthropicProvider.js` — 1 ligne ajoutée dans
  `_completeOnce()` : `...(options.temperature !== undefined ? {
  temperature: options.temperature } : {})`, pour une parité stricte avec
  `openAiProvider.js` (exigence explicite de l'étape 5 : "temperature si
  supporté"). Champ optionnel dans l'API Anthropic — comportement inchangé
  tant qu'aucun appelant ne le passe (aucun ne le fait aujourd'hui :
  `LlmProviderChatModel._generate()` ne transmet que `stop`).
- `test/ai.services.llmProviders.test.js` — +2 tests (`forwards
  options.temperature when provided, omits it when undefined`, un par
  fournisseur), verrouillant la correction ci-dessus dans les deux sens.
- `test/ai.services.llmProviderErrors.test.js` — +1 bloc `describe`
  (3 tests) : `"AnthropicProvider — end-to-end error classification +
  controlled retry"`, miroir exact du bloc déjà existant pour
  `OpenAiProvider` (401 jamais retenté/jamais de fuite de clé ; 503
  transitoire retenté une fois puis succès ; usage de tokens journalisé
  sans changer le contrat de retour). Comblait un vrai trou de couverture :
  les deux fournisseurs partagent la même mécanique
  `classifyProviderHttpError`/`withControlledRetry`, seul `OpenAiProvider`
  avait ce test d'intégration bout-en-bout.
- `test/ai.llmProviderConfig.validation.test.js` — +1 bloc `describe`
  (8 tests) : `"AI_LLM_PROVIDER=anthropic"`, miroir exact du bloc déjà
  existant pour `openai` (résolution config, instanciation du bon type,
  insensibilité à la casse, `null` si un champ manque, jamais de fuite de
  la clé, et un test croisé confirmant que `openai`/`anthropic` avec la
  MÊME `AI_LLM_API_KEY` ne construisent jamais le mauvais type).

**Aucun autre fichier touché** — Agent Router, Intent Detector, RAG,
ContextBuilder, MCP, Tools, RBAC, ConversationManager, Flutter : non
modifiés, conformément à la consigne.

## Interface ILlmProvider

Contrat unique, déjà en place, implémenté à l'identique par les deux
fournisseurs (`src/ai/services/llmProvider.interface.js`) :

```
complete(messages: {role: "system"|"user"|"assistant", content: string}[],
         options?: {stop?: string|string[], temperature?: number})
  -> Promise<string>
```

Texte en entrée, texte en sortie — rien d'autre ne transite. C'est
`LlmProviderChatModel` (`src/ai/langchain/model/llmProviderChatModel.js`),
et lui seul, qui adapte ce contrat au `BaseChatModel` de LangChain ; c'est
la SEULE raison pour laquelle changer de fournisseur ne touche aucun
Chain/Agent/Planner du noyau. `AnthropicProvider` traduit en interne la
spécificité de l'API Messages (le rôle `system` doit être un champ
top-level séparé, jamais un élément de `messages` ; en-têtes `x-api-key` +
`anthropic-version` au lieu de `Authorization: Bearer` ; `max_tokens`
obligatoire ; `stop_sequences` au lieu de `stop`) — cette traduction est
invisible à tout ce qui appelle `complete()`.

La couche configuration (`src/ai/config/ai.config.js::loadAiConfig()`) ne
connaît AUCUN nom de fournisseur en dur : `AI_LLM_PROVIDER` est lu comme une
simple chaîne, jamais restreint. Seule la factory
(`src/ai/services/providers/index.js::createLlmProvider()`) connaît les
noms `"openai"`/`"anthropic"` (insensible à la casse) et lève
`ConfigurationError` pour toute autre valeur — vérifié par lecture directe
des deux fichiers dans cette passe (confirmait le §1 de la demande : "AI
configuration" inspectée, aucune restriction cachée trouvée).

## Configuration

`.env.example` documentait déjà, avant cette passe, la convention complète
(inchangée, aucune modification nécessaire) :
```
AI_LLM_PROVIDER=openai        # ou "anthropic"
AI_LLM_MODEL=gpt-4o-mini      # ou p.ex. "claude-3-5-sonnet-latest"
AI_LLM_API_KEY=<set-locally>  # UN SEUL nom de variable, quel que soit le fournisseur
```
Jamais `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` — délibéré, pour que changer de
fournisseur ne renomme jamais de variable. Aucune vraie clé n'a jamais été
placée dans ce fichier ni demandée dans cette conversation.

## Résultats

| Élément | Statut |
|---|---|
| **Anthropic provider** | **PASS** — 27 tests dédiés (constructeur, en-têtes, extraction du `system`, `stop_sequences`, `temperature`, forme de réponse inattendue, classification d'erreur 401/503/réseau, retry contrôlé, non-fuite de la clé), tous verts |
| **OpenAI provider** | **PASS** — non touché, non retiré ; 29 tests toujours verts, y compris le nouveau test de parité `temperature` |
| **CRM Assistant** | **PASS** (code) — `test/ai.diagnosis.crmAssistantAgent.realRag.test.js` + `test/ai.agents.crmAssistantAgent.test.js`, chaîne RAG→contexte→réponse prouvée avec un `chatModel` scripté, indépendante du fournisseur réel (le test ne connaît ni OpenAI ni Anthropic — seulement `ILlmProvider.complete()`) |
| **Meeting Agent** | **PASS** (code) — `test/ai.diagnosis.meetingAgent.conversation.test.js` + `test/ai.diagnosis.reminderConversation.test.js` : conversation à 4 tours réelle, ne crée jamais immédiatement, demande les infos manquantes, exige confirmation avant tout Tool d'écriture |
| **Project Agent** | **PASS** — `test/project.service.listProjects.test.js` contre la vraie base de données : `list_projects({mine:true})` pour l'utilisateur réel `516f6dca-...` (hadil.ibnhajfraj@gmail.com) → **17** projets, jamais 185+ ; `test/ai.agents.projectAgent.test.js` vert |
| **KPI Agent** | **PASS** — `test/ai.agents.kpiAgent.test.js` vert ; cohérent avec les 17 projets ci-dessus |
| **RAG** | **PASS** — non modifié, non re-testé dans cette passe (aucune dépendance : le RAG produit du texte, indépendant du fournisseur qui le consomme ensuite) ; dernière vérification directe : `18_COPILOT_FINAL_DIAGNOSTIC.md` |
| **MCP** | **PASS** — non modifié ; Tools testés directement contre la vraie base dans les suites Project/KPI Agent ci-dessus |
| **RBAC** | **PASS** — non modifié ; `list_projects({mine:true})` scope toujours réellement au demandeur (voir Project Agent) |

## Tests

```
npx jest test/ai.services.llmProviders.test.js test/ai.services.llmProviderErrors.test.js test/ai.llmProviderConfig.validation.test.js --verbose
  Test Suites: 3 passed, 3 total
  Tests:       56 passed, 56 total

npx jest test/ai.diagnosis.crmAssistantAgent.realRag.test.js test/ai.diagnosis.meetingAgent.conversation.test.js test/ai.diagnosis.reminderConversation.test.js test/project.service.listProjects.test.js test/ai.agents.crmAssistantAgent.test.js test/ai.agents.meetingAgent.test.js --verbose
  Test Suites: 6 passed, 6 total
  Tests:       36 passed, 36 total

npx jest test/ai.agents.kpiAgent.test.js test/ai.agents.projectAgent.test.js --verbose
  Test Suites: 2 passed, 2 total
  Tests:       48 passed, 48 total

npm test (régression complète)
  Test Suites: 2 failed, 179 passed, 181 total
  Tests:       21 failed, 5140 passed, 5161 total
```
**Aucune régression** : les 21 échecs sont exclusivement `test/mfa.test.js`
+ `test/mfa.dedup.test.js` — préexistants, identiques en nombre et en
localisation à la baseline de `18_COPILOT_FINAL_DIAGNOSTIC.md` (21 échecs,
mêmes 2 fichiers, jamais touchés dans les 19 incidents de cette session).
5161 - 5146 = **15 tests de plus**, tous nouveaux, tous verts — la
couverture ajoutée par cette passe.

## Ce qui n'a PAS été testé, et pourquoi

Les tests ci-dessus prouvent la CORRECTION DU CODE (forme de requête,
extraction du `system`, gestion d'erreur, non-régression sur les 4 Agents)
avec un axios mocké — jamais un appel réseau réel. Une vérification
bout-en-bout RÉELLE contre l'API Anthropic (Phases 7 à 11 littérales :
poser la question "Réponds uniquement OK" et recevoir une vraie réponse de
`claude-*`) nécessite une VRAIE clé Anthropic dans `AI_LLM_API_KEY` — **je
ne l'ai pas demandée et ne la demanderai pas dans cette conversation**,
conformément à la consigne. Pour la faire soi-même :

```bash
cd "Backend Master"
# Éditer .env localement (jamais commité) :
#   AI_LLM_PROVIDER=anthropic
#   AI_LLM_MODEL=claude-3-5-sonnet-latest   (ou un autre modèle Claude valide)
#   AI_LLM_API_KEY=<votre vraie clé Anthropic>

node -e "
require('dotenv').config();
const { createLlmProvider } = require('./src/ai/services/providers');
createLlmProvider({ provider: process.env.AI_LLM_PROVIDER, model: process.env.AI_LLM_MODEL, apiKey: process.env.AI_LLM_API_KEY })
  .complete([{ role: 'system', content: 'Tu es un assistant CRM.' }, { role: 'user', content: 'Réponds uniquement OK.' }])
  .then(r => console.log('PASS:', r))
  .catch(e => console.log('FAIL:', e.name, e.message));
"
```
Basculer ensuite `AI_LLM_PROVIDER=openai` (même clé retirée, clé OpenAI
remise) reproduit le comportement documenté dans `18_COPILOT_FINAL_DIAGNOSTIC.md` —
aucun changement de code requis dans un sens comme dans l'autre.

## Comment vérifier ce rapport

```bash
cd "Backend Master"
git diff -- src/ai/services/providers/anthropicProvider.js test/ai.services.llmProviders.test.js test/ai.services.llmProviderErrors.test.js test/ai.llmProviderConfig.validation.test.js
npx jest test/ai.services.llmProviders.test.js test/ai.services.llmProviderErrors.test.js test/ai.llmProviderConfig.validation.test.js --verbose
npm test
```
