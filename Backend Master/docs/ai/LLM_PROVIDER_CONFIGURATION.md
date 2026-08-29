# Configuration du fournisseur LLM — AI Business Copilot

> Documente la configuration RÉELLE du fournisseur LLM de ce projet.
> Chaque affirmation est vérifiable (fichier + ligne, ou commande
> exécutable) — voir "Comment vérifier" en fin de document. Fait suite à
> `AI-Business-Copilot/08_LLM_PROVIDER_OPENAI.md` (l'historique complet de
> l'incident/la mise en place).

## 1. Architecture du provider

```
Flutter
  ↓ POST /ai-copilot/chat
aiCopilot.routes.js (gate: activation + rôle)
  ↓
aiCopilot.controller.js::chat()
  ↓
aiCopilotBridge.service.js (cache l'orchestrateur par utilisateur)
  ↓
orchestrator/pipeline.js::createAiOrchestrator({ llmProvider, ... })
  ↓
AIManager.handleMessage() (intention → permissions → Agent/Tools → LLM)
  ↓
langchain/model/llmProviderChatModel.js (pont LangChain ↔ ILlmProvider)
  ↓
ILlmProvider.complete(messages) -> Promise<string>   ← LE SEUL CONTRAT
  ↓
OpenAiProvider (ou AnthropicProvider, ou OllamaProvider)  ← implémentation concrète
  ↓
API OpenAI (ou Anthropic, ou serveur Ollama LOCAL)
```

**Port/Adaptateur (SOLID-DIP)** : `src/ai/services/llmProvider.interface.js`
définit `ILlmProvider` — `complete(messages, options) -> Promise<string>`
(+ `stream()`, non implémenté à ce jour, voir §7). AUCUN composant
au-dessus de cette interface (LangChain, Agents, MCP, RAG) ne connaît
OpenAI/Anthropic — seul `openAiProvider.js`/`anthropicProvider.js` sait
construire une requête HTTP spécifique à un vendeur.

**Pourquoi aucun "tool calling"/"structured output" natif OpenAI** :
`llmProviderChatModel.js` (le pont LangChain ↔ `ILlmProvider`) documente
lui-même le contrat exact attendu : des messages `{role, content}` en
entrée, une chaîne de caractères en sortie — rien d'autre. La sélection
des AI Tools se fait DÉJÀ une couche au-dessus, en texte, via
`ToolCallingChain` (LangChain) : le LLM est invité, par le prompt, à
répondre avec une structure JSON qui est ensuite parsée — jamais via les
paramètres natifs `tools`/`function_call`/`response_format` de l'API
OpenAI. Ajouter cette mécanique native ici dupliquerait un système déjà
construit et testé (`test/ai.langchain.*`), et lierait chaque futur
fournisseur (`gemini`/`mistral`/`ollama`) à une forme de requête
spécifique à OpenAI.

### Factory (`src/ai/services/providers/index.js`)

```js
const FACTORIES = {
  openai: (llm) => new OpenAiProvider({ apiKey: llm.apiKey, model: llm.model }),
  anthropic: (llm) => new AnthropicProvider({ apiKey: llm.apiKey, model: llm.model }),
  ollama: (llm) => new OllamaProvider({ baseUrl: llm.ollamaBaseUrl || undefined, model: llm.ollamaModel || llm.model }),
};
```

`ollama` est le seul nom exempté de l'exigence `AI_LLM_API_KEY`
(`PROVIDERS_WITHOUT_API_KEY`, `providers/index.js`) : c'est un serveur
LOCAL, non authentifié par conception — voir §2bis. Ajouter `gemini`/
`mistral` plus tard = une entrée de plus dans `FACTORIES` + un nouveau
fichier `xProvider.js` implémentant `ILlmProvider` — **jamais un changement
dans `AIManager`, `AgentRouter`, `ToolRouter`, LangChain, RAG ou MCP.**

## 2. Configuration — variables d'environnement réelles

**Ce projet utilise UNE seule convention de nommage, jamais deux** —
confirmé par recherche exhaustive (`grep -rn "OPENAI_API_KEY\|OPENAI_MODEL" src/ai`,
aucun résultat) :

| Variable | Rôle | Exemple |
|---|---|---|
| `AI_COPILOT_ENABLED` | Active/désactive le Copilot entier | `true` |
| `AI_COPILOT_ROLES_ALLOWED` | Rôles CRM autorisés, séparés par virgules | `admin,superadmin,superadmin2,commercial,user` |
| `AI_LLM_PROVIDER` | Fournisseur LLM à utiliser | `openai` |
| `AI_LLM_MODEL` | Modèle du fournisseur choisi | `gpt-4o-mini` |
| `AI_LLM_API_KEY` | Clé API du fournisseur — **jamais `OPENAI_API_KEY`** | *(secret local)* |

Lues et validées par `src/ai/config/ai.config.js::loadAiConfig()` — les
trois variables `AI_LLM_*` doivent être SIMULTANÉMENT présentes pour
qu'un `ILlmProvider` réel soit construit (`createLlmProvider()`,
`src/ai/services/providers/index.js`) ; sinon `AIManager.llmProvider` reste
`null` et toute tentative de conversation échoue proprement avec
`AI_PROVIDER_NOT_CONFIGURED` (503) — jamais un crash, jamais une
hallucination. **Exception, `AI_LLM_PROVIDER=ollama` uniquement** :
`AI_LLM_API_KEY` n'est PAS requise (serveur local non authentifié) — seuls
`AI_LLM_PROVIDER=ollama` et un modèle (`AI_LLM_MODEL` ou `OLLAMA_MODEL`,
voir §2bis) suffisent.

### 2bis. Ollama (fournisseur local, gratuit)

| Variable | Rôle | Défaut si absente |
|---|---|---|
| `OLLAMA_BASE_URL` | Adresse du serveur Ollama local | `http://localhost:11434` (défaut de `OllamaProvider`, pas de `ai.config.js`) |
| `OLLAMA_MODEL` | Modèle à utiliser pour CE fournisseur uniquement | retombe sur `AI_LLM_MODEL` si absente |

`OLLAMA_MODEL` existe séparément de `AI_LLM_MODEL` pour éviter d'écraser
un modèle OpenAI/Anthropic déjà configuré pendant qu'on expérimente Ollama
en local (ex. garder `AI_LLM_MODEL=gpt-4o-mini` et ne renseigner que
`OLLAMA_MODEL=qwen3:8b`) — si elle est absente, `AI_LLM_MODEL` est réutilisé
tel quel, comme pour les deux autres fournisseurs. Aucune clé, aucun
secret : Ollama tourne sur la même machine (ou le réseau local) que le
backend, jamais un service tiers — voir §3 pour la frontière de sécurité.

## 3. Sécurité

- `AI_LLM_API_KEY` ne vit QUE dans `Backend Master/.env` (jamais commité —
  `.gitignore` contient `.env`/`.env.*`, vérifié).
- Envoyée uniquement via l'en-tête HTTP `Authorization: Bearer ...`
  (`openAiProvider.js`) — jamais dans une URL, jamais accessible depuis
  Flutter (aucune référence à une clé LLM dans `Dash Master Toolkit/`).
- **Jamais loggée** : chaque logger du noyau IA (`src/ai/utils/logger.js`)
  passe systématiquement par `secretRedaction.js`, qui masque toute valeur
  associée à une clé nommée `api_key`/`token`/`secret`/`password`/etc. —
  une protection structurelle, pas une discipline à chaque site d'appel.
- Chaque erreur provider (`LlmProviderAuthError`/`Unavailable`/`Timeout`/
  générique — voir §5) construit un message FIXE, jamais la valeur brute
  de l'erreur axios (qui peut contenir la config de requête, donc la clé).
- `.env.example` ne contient QUE des placeholders — jamais une vraie
  valeur (`AI_LLM_API_KEY=<set-locally>`).
- **Ollama** : local par conception, non authentifié — `OllamaProvider`
  n'envoie ni `Authorization` ni `x-api-key`. Le port 11434 ne doit JAMAIS
  être exposé sur Internet, jamais appelé depuis Flutter (Flutter ne parle
  qu'au backend Node.js, qui seul parle à Ollama), jamais placé derrière le
  frontend. `AI_LLM_API_KEY` n'a aucun rôle pour ce fournisseur.

## 4. Modèle utilisé

`AI_LLM_MODEL` — une seule variable, lue une seule fois
(`ai.config.js`), jamais codée en dur dans plusieurs fichiers. Valeur de
développement actuelle : `gpt-4o-mini` (rapide, économique — changer
librement, ex. `gpt-4o` en production, sans toucher au code).

## 5. Erreurs possibles

| Code | Déclencheur | HTTP (si atteint côté contrôleur) |
|---|---|---|
| `AI_PROVIDER_NOT_CONFIGURED` | `AI_LLM_PROVIDER`/`MODEL`/`API_KEY` pas TOUS les trois présents | 503 |
| `AI_PROVIDER_AUTH_ERROR` *(nouveau)* | Le fournisseur rejette la clé (401/403) — jamais retenté | *(voir note ci-dessous)* |
| `AI_PROVIDER_UNAVAILABLE` *(nouveau)* | 5xx du fournisseur, ou panne réseau — 1 retry contrôlé | *(idem)* |
| `AI_PROVIDER_TIMEOUT` *(nouveau)* | Délai dépassé (30s par défaut) — 1 retry contrôlé | *(idem)* |
| `AI_DATABASE_ERROR` | Une vraie erreur PostgreSQL (Sequelize) | 500 |
| `AI_PERMISSION_DENIED` | Rôle non autorisé pour l'Agent/Tool visé | 403 |
| `AI_TOOL_ERROR` | Un AI Tool MCP échoue | 500 |
| `AI_INTERNAL_ERROR` | Tout le reste, jamais une erreur brute exposée | 500 |

**Note sur les 3 codes provider "nouveaux"** : `LlmProviderAuthError`/
`LlmProviderUnavailableError`/`LlmProviderTimeoutError`
(`src/ai/services/providers/errors.js`) sont levées PENDANT
`AIManager.handleMessage()` et absorbées par son propre `catch` — la
conversation reste vivante, la réponse revient en HTTP 200 avec
`mode: "error"` et `error.message` (jamais un HTTP 503/500 séparé, ni une
erreur Sequelize brute renvoyée au frontend). Voir
`orchestrator/responseBuilder.js::buildErrorResponse`. Le frontend Flutter
affiche ce message directement dans la bulle (voir §8 — corrigé dans cette
passe).

## 6. Fiabilité du provider (nouveau dans cette passe)

- **Retry contrôlé** (`src/ai/services/providers/retry.js`) : 1 nouvelle
  tentative, UNIQUEMENT pour `AI_PROVIDER_UNAVAILABLE`/`AI_PROVIDER_TIMEOUT`
  — jamais pour une clé invalide (retenter ne changerait rien), jamais
  au-delà d'une tentative supplémentaire.
- **Consommation de tokens** : si l'API la renvoie (`response.data.usage`),
  elle est journalisée (`[llm:openai] token usage: prompt=... completion=...
  total=...`) — jamais exposée dans le contrat `complete()` (qui reste une
  simple chaîne), jamais un secret.

## 7. Ce qui n'est PAS implémenté (honnêteté, pas un oubli)

- `ILlmProvider.stream()` — l'interface le déclare, aucun adaptateur
  concret ne l'implémente ; le "streaming" visible côté Flutter
  (`services/streamingChunker.js`) est une révélation artificielle d'une
  réponse déjà complète, pas un vrai flux token-par-token.
- Tool calling/structured output natifs OpenAI — voir §1, volontairement
  hors périmètre (déjà géré une couche au-dessus).
- Gemini/Mistral — l'architecture les permet (§1) mais aucun n'est câblé,
  conformément à la demande ("ne pas implémenter inutilement"). Anthropic et
  Ollama, eux, SONT câblés (voir `AI-Business-Copilot/19_ANTHROPIC_PROVIDER.md`
  et `AI-Business-Copilot/20_OLLAMA_PROVIDER.md`).

## 8. Frontend Flutter — bug réel trouvé et corrigé dans cette passe

`CopilotController` (`lib/ai/providers/copilot_controller.dart`), chemins
WebSocket (`onComplete`) ET REST (`_sendViaRest`) : une enveloppe
`mode: "error"` a TOUJOURS `answer: null` — le code affichait donc une
bulle VIDE marquée en erreur, sans jamais montrer `error.message` (le
texte sûr et spécifique construit côté backend, ex. "OpenAI n'a pas
répondu à temps. Réessayez."). Corrigé : `msg.text = response.answer ??
response.errorMessage ?? ...`. Le message
"Le Copilot IA n'est pas configuré côté serveur." n'apparaît maintenant que
lorsque le fournisseur est RÉELLEMENT absent (`AI_PROVIDER_NOT_CONFIGURED`,
503, avant même d'atteindre `AIManager`) — jamais pour une panne
provider/DB/tool en cours de conversation.

## 9. Tests

| Fichier | Ce qu'il prouve |
|---|---|
| `test/ai.llmProviderConfig.validation.test.js` (**nouveau**, 8 tests) | `AI_LLM_PROVIDER=openai` résout un VRAI `OpenAiProvider` ; la clé n'apparaît jamais dans un résultat de test |
| `test/ai.services.llmProviderErrors.test.js` (**nouveau**, 14 tests) | Classification 401→Auth/5xx→Unavailable/timeout→Timeout ; retry contrôlé (jamais pour Auth, jamais illimité) |
| `test/ai.llmProviderIntegration.controlled.test.js` (**nouveau**, 1 test) | La chaîne RÉELLE complète (route→bridge→AIManager→**vrai** OpenAiProvider→réponse), axios seul mocké, pour "Réponds simplement : Copilot opérationnel." |
| `test/ai.services.llmProviders.test.js` (existant, 16 tests) | Forme de requête/réponse OpenAI et Anthropic, aucune fuite de clé |
| `Dash Master Toolkit/test/ai/providers/copilot_controller_test.dart` (+1 test) | La bulle affiche désormais `error.message`, jamais vide |

## 10. Procédure de démarrage

```bash
# 1. Renseigner la clé (jamais commitée) :
#    Backend Master/.env → AI_LLM_API_KEY=<votre vraie clé OpenAI>
#    (AI_LLM_PROVIDER=openai et AI_LLM_MODEL=gpt-4o-mini sont déjà préconfigurés)

# 2. Démarrer le backend :
cd "Backend Master"
npm run dev

# 3. Démarrer Flutter :
cd "Dash Master Toolkit"
flutter run -d chrome   # ou le device cible (voir flutter devices)
```

## Comment vérifier ce document

```bash
cd "Backend Master"

# Provider/modèle configurés, clé absente ou présente (jamais sa valeur)
node -e 'require("dotenv").config(); const c=require("./src/ai/config").loadAiConfig(); console.log({provider:c.llm.provider, model:c.llm.model, apiKeyPresent:Boolean(c.llm.apiKey)})'

# Tests dédiés à cette configuration
npx jest test/ai.llmProviderConfig.validation.test.js test/ai.services.llmProviderErrors.test.js test/ai.llmProviderIntegration.controlled.test.js --verbose

# Régression complète
npm test
```
