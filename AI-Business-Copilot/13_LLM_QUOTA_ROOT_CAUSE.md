# Diagnostic final — l'exception réelle derrière "[agent] n'a pas pu traiter cette demande"

> Suite de `12_AGENT_FAILURE_DIAGNOSIS.md`. Cette passe ne s'appuie plus sur
> aucune supposition : la cause a été extraite du VRAI corps de réponse
> HTTP renvoyé par OpenAI, capturé en contournant volontairement le
> classifieur générique (qui, par construction, ne renvoie jamais ce détail
> — voir §Pourquoi). Router/IntentDetector non touchés (aucun bug identifié).
> Flutter non touché.

## CRM_ASSISTANT_AGENT

**Erreur réelle** :
```json
{
  "error": {
    "message": "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.",
    "type": "insufficient_quota",
    "param": null,
    "code": "credit_balance_exhausted"
  }
}
```
(HTTP 429 — capturé par un appel direct à l'API OpenAI, hors de tout
classifieur, avec le compte/la clé réellement configurés dans `.env`.)

**Fichier** : `src/ai/services/providers/openAiProvider.js`

**Ligne** : 77 (`throw classifyProviderHttpError(err, "OpenAI")`, dans
`_completeOnce()`), classifiée par `src/ai/services/providers/errors.js:73`
(`if (!status || status === 429 || status >= 500) return new LlmProviderUnavailableError(...)`).

**Cause** : le compte OpenAI associé à `AI_LLM_API_KEY` (voir `.env`) n'a
plus de crédit — pas un bug de code, un état de compte externe. Cette
erreur remonte : `OpenAiProvider._completeOnce()` → `LlmProviderChatModel._generate()`
→ `RunnableSequence`/`QaChain` → `BaseAgent.execute()`, qui la capture et
renvoie la réponse dégradée générique (comportement voulu depuis
`09_INCIDENT_KPI_AGENT.md` — ne jamais laisser une exception atteindre
l'utilisateur).

**Correction** : aucune ligne de logique métier de `crm_assistant_agent`
n'est en cause (déjà vérifié directement, RAG compris — voir
`12_AGENT_FAILURE_DIAGNOSIS.md §RAG`). Seule correction : le corps réel de
la réponse OpenAI n'était encore JAMAIS journalisé côté serveur (seul
`err.message`, le message générique d'axios, l'était) — corrigé dans
`errors.js`/`openAiProvider.js` (voir §Pourquoi cette fois est différente).
**L'action réelle nécessaire est externe à ce backend** : ajouter du
crédit sur le compte OpenAI (lien fourni par OpenAI lui-même dans le
message d'erreur ci-dessus).

## MEETING_AGENT

**Erreur réelle** : identique — même compte, même `429`,
`insufficient_quota`/`credit_balance_exhausted` (même appel direct,
reproduit une seconde fois pour ce chemin, message identique).

**Fichier** : `src/ai/services/providers/openAiProvider.js`

**Ligne** : 77 — le MÊME point d'échec que CRM Assistant (les deux Agents
partagent le même `chatModel`/`ILlmProvider`, jamais deux implémentations).
Côté `meeting_agent`, l'erreur remonte via `ToolCallingChain.invoke()`
(`src/ai/langchain/chains/toolCallingChain.js:138`) puis
`LangChainWorkflowEngine._runStep()`, qui l'enveloppe dans un
`WorkflowError` (`.cause` = l'erreur ci-dessus, désormais visible dans les
logs — voir `12_AGENT_FAILURE_DIAGNOSIS.md §Étape 1`).

**Cause** : identique à CRM Assistant — quota OpenAI épuisé, pas un bug de
`meeting_agent`.

**Correction** : aucune (déjà vérifiée directement — collecte des
informations, mémoire multi-tours, confirmation avant création, tout
fonctionne correctement une fois isolé du fournisseur LLM, voir
`12_AGENT_FAILURE_DIAGNOSIS.md §MEETING_AGENT`). Même action externe requise.

## Pourquoi cette fois est différente — le VRAI corps de réponse, enfin visible

`classifyProviderHttpError()` (`errors.js`) est délibérément conçu pour ne
JAMAIS renvoyer le détail réel à l'appelant — son message est fixe et
générique ("OpenAI is temporarily unavailable...") car cette erreur peut
remonter jusqu'à l'utilisateur final (voir le commentaire du fichier :
jamais le corps brut, qui pourrait un jour contenir un détail interne).
C'est un choix de sécurité correct, mais qui a aussi, par effet de bord,
caché aux LOGS SERVEUR eux-mêmes le corps réel de la réponse OpenAI —
personne n'avait encore capturé `err.response.data`, seulement
`err.message` (le texte générique d'axios, "Request failed with status
code 429", sans aucune indication que la cause est un quota épuisé plutôt
qu'un simple ralentissement).

**Corrigé** : `describeProviderHttpError(err)` (nouveau, `errors.js`),
utilisé UNIQUEMENT pour le log serveur (jamais pour la réponse utilisateur,
qui reste inchangée) — capture `status` + le corps réel de la réponse.
Jamais un secret : la clé API ne voyage que dans l'en-tête de la REQUÊTE,
jamais échoée dans une réponse d'erreur. Câblé dans `openAiProvider.js` ET
`anthropicProvider.js` (même famille de bug, corrigée aux deux endroits,
jamais un correctif à moitié fait).

**Avant** (log serveur, insuffisant) :
```
chat completion request failed: Request failed with status code 429
```

**Après** (log serveur, désormais suffisant pour diagnostiquer sans script ad hoc) :
```
chat completion request failed — status=429: {"error":{"message":"You have no credits remaining. ...","type":"insufficient_quota","code":"credit_balance_exhausted"}}
```

## Fichiers modifiés

- `src/ai/services/providers/errors.js` — nouvelle fonction `describeProviderHttpError()`.
- `src/ai/services/providers/openAiProvider.js` — log enrichi (1 ligne changée).
- `src/ai/services/providers/anthropicProvider.js` — log enrichi (1 ligne changée, même correction pour l'adaptateur jumeau).
- `test/ai.services.llmProviderErrors.test.js` — +4 tests (`describeProviderHttpError`, log réellement enrichi côté `OpenAiProvider`).

**Aucun fichier de `crm_assistant_agent`/`meeting_agent`/`IntentDetector`/`AgentRouter` modifié** — le diagnostic a confirmé qu'aucune correction n'y était nécessaire.

## Statut par composant

| Composant | Statut | Preuve |
|---|---|---|
| **ROUTER** | **OK** (non modifié) | `meeting_agent`/`crm_assistant_agent` bien sélectionnés (confirmé par l'utilisateur + corpus 550 scénarios) |
| **LLM_PROVIDER** | **KO** — quota OpenAI épuisé (`insufficient_quota`/`credit_balance_exhausted`), cause externe | Corps de réponse OpenAI capturé en direct, reproductible à volonté |
| **RAG** | **OK** | `test/ai.diagnosis.crmAssistantAgent.realRag.test.js`, pipeline réel, 4/4 verts (`12_AGENT_FAILURE_DIAGNOSIS.md`) |
| **CRM_ASSISTANT** | **OK** (code) — bloqué uniquement par LLM_PROVIDER KO | Aucune exception dans le code de l'Agent lui-même, testé directement |
| **MEETING_AGENT** | **OK** (code) — bloqué uniquement par LLM_PROVIDER KO | `test/ai.diagnosis.meetingAgent.conversation.test.js`, 6 tours réels, 2/2 verts |
| **MCP** | **OK** | 4 Tools `googleCalendar` déjà testés, jamais atteints dans ce diagnostic (l'échec survient AVANT tout appel de Tool) |
| **FLUTTER** | **Non touché** (consigne respectée) | Aucun fichier `Dash Master Toolkit/` modifié |

## Tests avant

```
Test Suites: 178 total (176 passed, 2 échecs MFA préexistants)
Tests:       5038 total, 5017 passed, 21 échecs (tous MFA, sans rapport)
```

## Tests après

```
npm test (suite complète)
Test Suites: 2 failed, 176 passed, 178 total
Tests:       21 failed, 5021 passed, 5042 total
```

+4 tests (`describeProviderHttpError` + log enrichi vérifié). Les 21
échecs restent exclusivement `test/mfa.test.js`/`test/mfa.dedup.test.js` —
préexistants, sans aucun rapport (confirmé par `git diff --stat`, aucun
fichier MFA touché dans cette passe).

## Comment vérifier ce rapport

```bash
cd "Backend Master"

# Le corps réel de la réponse OpenAI, capturé en direct
node -e "
require('dotenv').config();
const axios = require('axios');
axios.post('https://api.openai.com/v1/chat/completions',
  { model: process.env.AI_LLM_MODEL, messages: [{role:'user',content:'ok'}] },
  { headers: { Authorization: \`Bearer \${process.env.AI_LLM_API_KEY}\` } }
).catch(e => console.log(JSON.stringify(e.response && e.response.data, null, 2)));
"

# Le nouveau log enrichi
git diff -- src/ai/services/providers/errors.js src/ai/services/providers/openAiProvider.js src/ai/services/providers/anthropicProvider.js

# Tests dédiés
npx jest test/ai.services.llmProviderErrors.test.js test/ai.diagnosis.crmAssistantAgent.realRag.test.js test/ai.diagnosis.meetingAgent.conversation.test.js --verbose

# Régression complète
npm test
```
