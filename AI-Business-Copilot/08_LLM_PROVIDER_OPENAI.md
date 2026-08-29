# Configuration réelle du fournisseur LLM — OpenAI

> Suite de `07_INCIDENT_COPILOT_DATEEXPIRATION.md`. Le RAG et le routage
> fonctionnent ; il ne restait que le fournisseur LLM lui-même. Détail
> complet de l'architecture/sécurité/tests :
> `Backend Master/docs/ai/LLM_PROVIDER_CONFIGURATION.md`. Ce document
> répond uniquement aux 7 questions demandées.

## 1. Cause exacte de `AI_PROVIDER_NOT_CONFIGURED`

`src/ai/services/providers/index.js::createLlmProvider(llm)` retourne
`null` tant que `AI_LLM_PROVIDER`/`AI_LLM_MODEL`/`AI_LLM_API_KEY` ne sont
PAS tous les trois présents. Avant cette passe, les trois étaient vides
dans le vrai `.env` (décision volontaire des incidents précédents — aucune
clé à disposition). `AIManager.llmProvider` valait donc `null`, et le
premier appel à `requireLlmProvider()` (à la construction de
l'orchestrateur, `aiCopilotBridge.service.js::getOrchestratorFor`) levait
`NotConfiguredError`, classée `AI_PROVIDER_NOT_CONFIGURED` par
`errorClassifier.js`.

**Ce n'était pas un bug de code** — l'architecture (interface
`ILlmProvider`, `OpenAiProvider`, `AnthropicProvider`, la factory) existait
déjà, complète et testée, AVANT cette passe. Il manquait uniquement : (a)
`AI_LLM_PROVIDER=openai`/`AI_LLM_MODEL=...` non renseignés dans `.env`, et
(b) une vraie clé, que je n'ai ni fabriquée ni demandée dans ce chat.

## 2. Fichiers modifiés

| Fichier | Changement |
|---|---|
| `Backend Master/.env` | `AI_LLM_PROVIDER=openai`, `AI_LLM_MODEL=gpt-4o-mini` préconfigurés (non-secrets) ; `AI_LLM_API_KEY` laissée vide — à renseigner localement |
| `Backend Master/.env.example` | Même valeurs non-secrètes, `AI_LLM_API_KEY=<set-locally>` en placeholder |
| `src/ai/services/providers/errors.js` | +3 classes d'erreur réelles (`LlmProviderAuthError`/`Unavailable`/`Timeout`) + `classifyProviderHttpError()` partagée |
| `src/ai/services/providers/retry.js` | **Nouveau.** Retry contrôlé (1 tentative supplémentaire, jamais pour une erreur d'authentification) |
| `src/ai/services/providers/openAiProvider.js` | Utilise la classification + le retry + journalise la consommation de tokens si disponible (jamais dans le contrat de retour) |
| `src/ai/services/providers/anthropicProvider.js` | Même traitement, pour la cohérence multi-fournisseur |
| `Dash Master Toolkit/lib/ai/providers/copilot_controller.dart` | **Bug réel corrigé** : une enveloppe `mode:"error"` affichait une bulle vide — `error.message` n'était jamais lu |
| `Backend Master/docs/ai/LLM_PROVIDER_CONFIGURATION.md` | **Nouveau.** Documentation complète (architecture, sécurité, tests, démarrage) |
| 5 nouveaux fichiers de tests (voir §4) | |

Aucun fichier IA existant réécrit (`AIManager` intact), aucun contournement
de MCP/RAG/AI Tools — l'architecture déjà en place (factory extensible,
`FACTORIES = {openai, anthropic}`) permettait déjà d'ajouter des
fournisseurs sans y toucher ; je m'y suis conformé.

## 3. Variables nécessaires

```
AI_LLM_PROVIDER=openai        # déjà renseigné
AI_LLM_MODEL=gpt-4o-mini      # déjà renseigné (changeable librement)
AI_LLM_API_KEY=               # VIDE — à renseigner localement, jamais par moi
```

Je ne vous ai jamais demandé cette clé dans le chat, conformément à la
consigne — elle reste exclusivement dans votre `.env` local/serveur.

## 4. Tests exécutés

```
Backend — suites liées à l'IA : 156 suites, 4721 tests — 100% verts

npm test (suite complète) : 172 suites, 4826 tests, 4805 verts, 21 échecs
(tous test/mfa.test.js/test/mfa.dedup.test.js — SMTP réel requis,
préexistants, sans rapport, fichiers non touchés)

Flutter test/ai/ : 209 tests — 100% verts (dont le nouveau test du bug
"bulle vide" corrigé)
```

Nouveaux fichiers : `ai.llmProviderConfig.validation.test.js` (8),
`ai.services.llmProviderErrors.test.js` (14),
`ai.llmProviderIntegration.controlled.test.js` (1 — la chaîne réelle
complète, axios seul mocké, pour "Réponds simplement : Copilot
opérationnel."), + 1 test Flutter.

## 5. Résultat

**Sans clé réelle** (état actuel) : `POST /ai-copilot/chat` répond
proprement 503 `AI_PROVIDER_NOT_CONFIGURED` — jamais un crash, jamais une
fuite de détail interne. Vérifié en HTTP réel
(`test/ai.copilotConfig.httpIntegration.test.js`, incident précédent,
toujours vert).

**Avec la chaîne réelle mais un appel HTTP contrôlé** (`test/ai.llmProviderIntegration.controlled.test.js`) :
la question EXACTE demandée, "Réponds simplement : Copilot opérationnel.",
traverse route → bridge → gate → `createLlmProvider` → **vrai**
`OpenAiProvider` → `LlmProviderChatModel` → `AIManager.handleMessage()` →
`ResponseBuilder` → réponse HTTP, et revient telle quelle. Seul l'appel
réseau final vers `api.openai.com` est simulé (aucune clé réelle
disponible ni nécessaire pour prouver que TOUT le reste fonctionne).

**Avec une vraie clé** (non exécuté par moi — je n'y ai pas accès) : une
fois `AI_LLM_API_KEY` renseignée localement, ce même chemin appellera
réellement OpenAI. Rien d'autre à changer.

## 6. Commande exacte pour démarrer le backend

```bash
cd "Backend Master"
npm run dev
```

## 7. Commande exacte pour démarrer Flutter

```bash
cd "Dash Master Toolkit"
flutter run -d chrome
```
(remplacer `chrome` par le device cible réel — voir `flutter devices`)

## Comment vérifier ce rapport

```bash
cd "Backend Master"
node -e 'require("dotenv").config(); const c=require("./src/ai/config").loadAiConfig(); console.log({provider:c.llm.provider, model:c.llm.model, apiKeyPresent:Boolean(c.llm.apiKey)})'
npx jest test/ai.llmProviderConfig.validation.test.js test/ai.services.llmProviderErrors.test.js test/ai.llmProviderIntegration.controlled.test.js --verbose
npm test
cd "../Dash Master Toolkit" && flutter test test/ai
```
