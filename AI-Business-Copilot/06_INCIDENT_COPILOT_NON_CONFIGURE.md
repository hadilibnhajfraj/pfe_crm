# Correction — « Le Copilot IA n'est pas configuré côté serveur »

> Suite de `05_INCIDENT_COPILOT_ROLE_USER.md`. Le gate (activation + rôle)
> est résolu — cette erreur est le niveau SUIVANT et DERNIER de la même
> chaîne : le fournisseur LLM lui-même. Chaque affirmation ci-dessous est
> vérifiable (fichier + ligne, ou commande exécutable).

## 1. Le fichier qui bloquait

`Backend Master/src/modules/ai-copilot/controllers/aiCopilot.controller.js`,
fonction `handle(res, err)` :

```js
function handle(res, err) {
  if (err instanceof NotConfiguredError) {
    return res.status(503).json({
      success: false,
      message: "Le Copilot IA n'est pas configuré côté serveur.",
      reason: "copilot_not_configured",
    });
  }
  ...
}
```

Ce n'est PAS un bug — c'est le comportement CORRECT et volontaire de ce
code face à une absence réelle de configuration (voir `NotConfiguredError`,
`src/ai/utils/errors.js`). Le message est exact.

## 2. La condition exacte (chaîne complète, remontée jusqu'à la source)

```
aiCopilot.controller.js::chat()
  → bridge.sendMessage(actingUser, {...})
    → aiCopilotBridge.service.js::getOrchestratorFor(actingUser)
      → getGateManager().requireLlmProvider()
        → src/ai/manager/aiManager.js::requireLlmProvider() :
          if (!this.llmProvider) throw new NotConfiguredError("ILlmProvider adapter");
```

`this.llmProvider` est construit UNE FOIS, à la création du gate manager,
par `src/ai/manager/index.js::createDefaultAiManager()` :

```js
llmProvider: createLlmProvider(config.llm)
```

Et `src/ai/services/providers/index.js::createLlmProvider(llm)` :

```js
if (!llm || !llm.provider || !llm.apiKey || !llm.model) {
  return null;   // <-- exactement ce qui se produit aujourd'hui
}
```

**Condition exacte du blocage** : `config.llm.provider` OU
`config.llm.apiKey` OU `config.llm.model` est vide (`null`) — les trois
doivent être présents SIMULTANÉMENT pour qu'un `llmProvider` réel soit
construit.

## 3. Variable(s) d'environnement manquante(s)

Recherche exhaustive dans le code (jamais devinée) :

```bash
$ grep -rn "AI_LLM_PROVIDER\|AI_LLM_MODEL\|AI_LLM_API_KEY" src --include="*.js"
```

**Ce projet lit UNIQUEMENT ces trois variables — jamais**
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`,
`GOOGLE_AI_API_KEY`, `AI_PROVIDER`, ni `AI_MODEL` (confirmé : zéro
occurrence de ces noms dans tout `src/`). **Piège fréquent à vérifier en
production** : si quelqu'un a configuré `OPENAI_API_KEY=sk-...` en pensant
suivre la convention "standard" OpenAI, ce code ne la lira JAMAIS — il faut
`AI_LLM_API_KEY`.

État actuel du vrai `.env` (valeurs jamais affichées, uniquement leur
présence) :

```bash
$ node -e 'require("dotenv").config(); const c = require("./src/ai/config").loadAiConfig(); console.log({enabled:c.enabled, providerConfigured:Boolean(c.llm.provider), modelConfigured:Boolean(c.llm.model), apiKeyConfigured:Boolean(c.llm.apiKey)})'
{ enabled: true, providerConfigured: false, modelConfigured: false, apiKeyConfigured: false }
```

**Les trois variables manquent simultanément** :
`AI_LLM_PROVIDER`, `AI_LLM_MODEL`, `AI_LLM_API_KEY` — toutes vides.

## 4. Fournisseur IA utilisé

**Aucun actuellement configuré.** Le code supporte deux fournisseurs réels
(`src/ai/services/providers/index.js`, `FACTORIES`) :
- `openai` — `src/ai/services/providers/openAiProvider.js` (API Chat
  Completions, aussi compatible Azure OpenAI/gateways OpenAI-compatibles)
- `anthropic` — `src/ai/services/providers/anthropicProvider.js` (API
  Messages)

Je n'ai NI la capacité NI le droit de choisir un fournisseur ou de
fabriquer une clé à sa place — cette décision (quel compte/quel budget
API) appartient à l'opérateur du serveur.

## 5. Modèle utilisé

**Aucun configuré.** `AI_LLM_MODEL` est une chaîne libre transmise telle
quelle au SDK du fournisseur choisi — ex. `gpt-4o-mini` pour OpenAI,
`claude-3-5-sonnet-latest` pour Anthropic (déjà utilisés comme exemples
dans les tests existants, `test/ai.services.llmProviders.test.js`).

## 6. Modifications effectuées

| Fichier | Changement |
|---|---|
| `Backend Master/src/ai/manager/index.js` | Ajout du diagnostic `[AI-COPILOT-CONFIG] enabled=... providerConfigured=... modelConfigured=... apiKeyConfigured=... llmProviderWired=...` à chaque construction du gate manager — booléens uniquement, jamais le nom du provider/modèle ni la clé |
| `Backend Master/test/ai.kernel.test.js` | +4 tests : contenu exact du nouveau diagnostic (tous absents → tout `false`), config complète → `llmProviderWired=true`, config PARTIELLE (provider+modèle sans clé) → toujours `false` (jamais un faux positif), et confirmation qu'aucun secret/nom de provider n'apparaît dans cette ligne précise |
| `Backend Master/test/ai.copilotConfig.httpIntegration.test.js` | **Nouveau.** Test HTTP RÉEL (ÉTAPE 7) : `POST /ai-copilot/chat` avec un rôle `"user"` réel contre le VRAI `aiCopilot.routes.js` + la VRAIE `aiCopilotBridge.service.js` (seul `authRequired` est stub, pour injecter l'utilisateur sans vrai JWT) — prouve que le gate est bien franchi et que le SEUL blocage restant est `copilot_not_configured`, jamais `copilot_disabled`/`role_not_allowed`/un secret dans la réponse |

**Aucun changement dans `.env`** : je n'ai ajouté aucune valeur, faute
d'avoir un vrai `AI_LLM_API_KEY` — ajouter une fausse valeur n'aurait fait
que remplacer une erreur honnête (503 `copilot_not_configured`) par une
erreur différente et tout aussi bloquante (401/403 de l'API OpenAI/Anthropic
elle-même, ou `LlmProviderRequestError`) sans jamais faire fonctionner le
Copilot réellement.

## 7. Commandes PM2

**Je n'ai pas exécuté ces commandes moi-même** — je n'ai pas d'accès à
votre serveur de production. Il s'agit des commandes recommandées, à
exécuter par l'opérateur du serveur, DANS CET ORDRE, une fois les 3
variables ci-dessus renseignées avec de vraies valeurs :

```bash
cd /var/www/backend
# 1. Ajouter au .env réel (remplacer <...> par de vraies valeurs) :
#    AI_LLM_PROVIDER=openai            (ou "anthropic")
#    AI_LLM_MODEL=<modèle réel>
#    AI_LLM_API_KEY=<clé réelle>
npm test
pm2 restart crmprobar-api --update-env
pm2 logs crmprobar-api --lines 100
# -> doit afficher, dès le démarrage :
#    [AI-COPILOT] enabled=true provider=<openai|anthropic>
#    [AI-COPILOT-CONFIG] enabled=true providerConfigured=true modelConfigured=true apiKeyConfigured=true llmProviderWired=true
```

## 8. Résultat du test HTTP (exécuté par moi, localement)

```bash
$ npx jest test/ai.copilotConfig.httpIntegration.test.js --verbose
```
Requête réelle, rôle `"user"` réel, contre le vrai routeur/bridge (aucun
mock hormis `authRequired`) :
```
POST /ai-copilot/chat  { "message": "Quels projets sont critiques ?" }
  Authenticated as: { role: "user" }
→ HTTP 503
  { "success": false,
    "message": "Le Copilot IA n'est pas configuré côté serveur.",
    "reason": "copilot_not_configured" }
```
**1 passed.** Confirme : le gate `AI_COPILOT_ENABLED`/rôle est bien
franchi (jamais 403, jamais `role_not_allowed`) — le SEUL obstacle restant
est l'absence de clé LLM réelle, rapportée proprement, sans fuite d'aucun
secret.

Régression complète, la même commande demandée :
```bash
$ npm test
Test Suites: 2 failed, 165 passed, 167 total
Tests:       21 failed, 4764 passed, 4785 total
```
Les 21 échecs sont TOUS dans `test/mfa.test.js`/`test/mfa.dedup.test.js`
(SMTP réel requis, préexistants, fichiers non touchés par cette
correction — vérifié : `git diff --stat` sur ces deux fichiers est vide).

## 9. Résultat du test depuis le frontend

**Non exécuté** — nécessite un vrai navigateur sur `https://crmprobar.com`
et une vraie clé LLM en production, dont je ne dispose pas. Une fois les 3
variables du §3 renseignées et PM2 redémarré (§7), le comportement attendu
côté Flutter (déjà vérifié conforme dans les corrections précédentes —
`04_INCIDENT_COPILOT_PERMISSIONS.md` §"Frontend Flutter") est : la réponse
IA s'affiche normalement dans le panneau Copilot, sans code supplémentaire
côté Flutter — le frontend se contente déjà de relayer la réponse du
backend, quel que soit son contenu.

## Comment vérifier ce rapport

```bash
cd "Backend Master"

# Les 3 variables manquantes, confirmées absentes
node -e 'require("dotenv").config(); const c = require("./src/ai/config").loadAiConfig(); console.log(c.llm)'

# Le nouveau diagnostic
npx jest test/ai.kernel.test.js -t "AI-COPILOT-CONFIG"

# Le test HTTP réel avec le rôle "user"
npx jest test/ai.copilotConfig.httpIntegration.test.js --verbose

# Régression complète
npm test
```
