# Incident — « Le Copilot IA est désactivé (AI_COPILOT_ENABLED=true) »

> Rapport de correction. Chaque affirmation est vérifiable (fichier + ligne,
> ou commande de test exécutable) — voir "Comment vérifier" en fin de
> document.

## 1. Cause racine

**Le vrai fichier `Backend Master/.env` (celui réellement chargé par le
serveur) ne contenait AUCUNE des variables `AI_COPILOT_*`/`AI_LLM_*`.**
Elles n'existaient que dans `.env.example` (un gabarit — jamais lu par le
serveur). Vérifié directement :

```bash
grep -ni "copilot\|AI_LLM" .env   # aucune ligne trouvée, avant correction
```

Conséquence : `process.env.AI_COPILOT_ENABLED` valait `undefined`.
`src/ai/config/ai.config.js` applique alors son défaut sûr (`false`) —
c'est un choix de conception assumé ("fail closed"), pas un bug en soi.
Le vrai bug était donc **une étape de configuration jamais faite**, pas une
erreur de code.

Un second problème, cosmétique mais trompeur, aggravait la confusion : le
message d'erreur HTTP contenait la chaîne codée en dur
`"(AI_COPILOT_ENABLED=true)"` — une affirmation FAUSSE à chaque fois
qu'elle s'affichait (si la valeur était vraiment `true`, cette branche
"désactivé" ne se déclencherait jamais). Cette chaîne ne reflétait jamais
la valeur réellement lue ; elle a été supprimée (voir §3).

Un troisième problème, réel mais secondaire (jamais la cause de cet
incident précis, corrigé par prudence) : le parsing de
`AI_COPILOT_ENABLED` utilisait `Joi.boolean().truthy("true").falsy("false")`,
une comparaison EXACTE, sensible à la casse et aux espaces. Une valeur
tapée à la main comme `" TRUE "` ou `"True"` aurait échoué à la validation
Joi (`ConfigurationError`, un crash 500) au lieu de s'activer correctement.

## 2. Fichiers modifiés

| Fichier | Changement |
|---|---|
| `Backend Master/.env` | **Root cause fix.** Ajout du bloc `AI_COPILOT_ENABLED=true`, `AI_COPILOT_ROLES_ALLOWED=admin,superadmin`, `AI_LLM_PROVIDER=`/`AI_LLM_MODEL=`/`AI_LLM_API_KEY=` (vides — voir §4, à compléter avec de vraies valeurs) |
| `Backend Master/src/ai/config/ai.config.js` | `AI_COPILOT_ENABLED` lu comme chaîne brute puis interprété via `String(raw ?? "").trim().toLowerCase() === "true"` — jamais `Joi.boolean().truthy/falsy` (exact-match, cassait sur espace/casse) ; ajout du log `[AI-COPILOT] enabled=... provider=...` à chaque chargement (jamais la clé, jamais la liste des rôles) |
| `Backend Master/src/app.js` | Appel EAGER de `loadAiConfig()` juste après `dotenv.config()` — le log `[AI-COPILOT]` apparaît désormais au DÉMARRAGE du process, pas seulement à la première requête (le reste du noyau IA — MCP/RAG/orchestrateurs par utilisateur — reste construit paresseusement, aucun changement de performance) |
| `Backend Master/src/modules/ai-copilot/routes/aiCopilot.routes.js` | Message "désactivé" ne cite plus jamais de valeur d'env supposée ; ajout de `reason: "copilot_disabled"` (503) et `reason: "role_not_allowed"` (403) |
| `Backend Master/src/modules/ai-copilot/controllers/aiCopilot.controller.js` | Message "non configuré" aligné sur le libellé demandé + `reason: "copilot_not_configured"` (503) |
| `Backend Master/src/modules/ai-copilot/socket/aiCopilotSocket.js` | Même correction de message côté WebSocket (`ai-copilot:error`) |
| `Backend Master/test/ai.config.test.js` | **Nouveau.** 19 tests : parsing (true/false/" TRUE "/absent/casse/espaces), câblage complet env→gate, contenu du log de diagnostic (présence de `enabled=`, absence de la clé API et de la liste des rôles) |
| `Backend Master/test/aiCopilot.routes.test.js` | Assertions ajoutées sur les nouveaux `reason` et sur l'absence de "AI_COPILOT_ENABLED" dans le message affiché |

Aucun fichier Flutter n'a été modifié (vérifié conforme, voir §6) — comme
demandé, l'interface graphique n'a pas été touchée.

## 3. Contrat d'erreur (implémenté tel que demandé)

| Cas | HTTP | `reason` |
|---|---|---|
| Copilot désactivé (`AI_COPILOT_ENABLED` absent/false) | 503 | `copilot_disabled` |
| Rôle non autorisé (`AI_COPILOT_ROLES_ALLOWED`) | 403 | `role_not_allowed` |
| Aucun fournisseur LLM configuré | 503 | `copilot_not_configured` |
| Fournisseur LLM configuré mais son appel échoue (réseau/429/500) | 200, `mode: "error"` dans l'enveloppe de réponse | — (voir §5, design déjà existant, conversation préservée pour un nouvel essai) |
| Non authentifié | 401 | (géré par `authRequired`, en amont — inchangé) |
| Rate limit dépassé | 429 | (géré par `express-rate-limit`, inchangé) |

Aucune réponse d'erreur ne contient de stack trace, de clé API, de secret,
de variable `.env` ou de détail interne PostgreSQL — vérifié par les tests
existants (`test/ai.services.llmProviders.test.js`, 22 tests, déjà verts
avant cette passe) et par la redaction automatique de
`src/ai/utils/secretRedaction.js`, appliquée à CHAQUE ligne de log du noyau
IA (y compris la nouvelle ligne `[AI-COPILOT]`).

## 4. Variables `.env` nécessaires — état actuel

```bash
AI_COPILOT_ENABLED=true                    # ✅ ajouté
AI_COPILOT_ROLES_ALLOWED=admin,superadmin  # ✅ ajouté (vide = tous les rôles authentifiés)
AI_LLM_PROVIDER=                           # ⚠️ VIDE — à renseigner ("openai" ou "anthropic")
AI_LLM_MODEL=                              # ⚠️ VIDE — ex. "gpt-4o-mini" ou "claude-3-5-sonnet-latest"
AI_LLM_API_KEY=                            # ⚠️ VIDE — jamais commiter une vraie clé
```

**Ces 3 dernières lignes sont volontairement restées vides** — je n'ai
aucune clé API réelle à y placer, et il ne faut jamais en fabriquer une.
Sans elles, le endpoint `/ai-copilot/chat` répond maintenant PROPREMENT
`503 {"reason":"copilot_not_configured"}` (voir §3) au lieu du message
"désactivé" trompeur d'avant — c'est un comportement CORRECT et honnête,
pas un bug résiduel. Renseigner ces 3 lignes avec de vraies valeurs est le
dernier geste nécessaire pour obtenir de vraies réponses IA.

## 5. Fournisseur IA utilisé

Le projet supporte deux fournisseurs réels, tous deux déjà implémentés et
testés (`src/ai/services/providers/`) :
- **OpenAI** (`AI_LLM_PROVIDER=openai`) — API Chat Completions, aussi
  compatible Azure OpenAI/gateways OpenAI-compatibles via `baseUrl`.
- **Anthropic** (`AI_LLM_PROVIDER=anthropic`) — API Messages.

Aucun autre fournisseur (Gemini compris) n'est câblé aujourd'hui — une
valeur non reconnue fait échouer le démarrage avec un message explicite
(`ConfigurationError`), volontairement, plutôt que d'ignorer la faute de
frappe silencieusement.

La clé est envoyée exclusivement via un header HTTP (`Authorization: Bearer
...` pour OpenAI, `x-api-key` pour Anthropic) — jamais dans une URL, jamais
transmise au frontend Flutter (vérifié : `copilot_api_service.dart` ne
contient et n'a jamais contenu de champ clé/secret).

## 6. Frontend Flutter — vérifié, non modifié

Conforme à la demande ("le frontend ne doit pas déterminer lui-même si le
Copilot est activé") :
- `CopilotApiService` (`lib/ai/services/copilot_api_service.dart`) ne fait
  que relayer `POST /ai-copilot/chat` et traduire le statut HTTP reçu
  (503 → `CopilotNotConfiguredException`, 403 → `CopilotForbiddenException`,
  tout le reste → une exception générique) — la décision "activé ou non"
  vient à 100% du backend.
- 401 : intercepteur Dio global déjà en place (`api_client.dart`), efface
  la session — pas de code spécifique au Copilot nécessaire.
- 429/404/500/timeout : retombent sur un message générique sûr
  (`CopilotController._friendlyError`, "Une erreur est survenue.
  Réessayez.") — jamais un crash, jamais un détail technique affiché.
- Timeout Dio déjà configuré (15s connect/receive) sur le client HTTP
  partagé.
- Aucune clé API IA n'existe côté Flutter — confirmé par lecture complète
  du service.

**Aucun fichier Flutter n'a été modifié** — le problème était entièrement
backend, conformément à l'énoncé.

## 7. Endpoint Copilot

`POST /ai-copilot/chat` — `{ message: string, conversationId?, pageContext? }`
→ `{ success: true, data: <enveloppe complète> }`. Chaîne complète :
`aiCopilot.routes.js` (gate `AI_COPILOT_ENABLED`/rôles) → `authRequired`
(JWT) → `aiCopilot.controller.js::chat` → `aiCopilotBridge.service.js`
→ `AIManager.handleMessage()` (détection d'intention → vérification des
permissions → sélection d'Agent/Tools → appel LLM réel → réponse).
Contrat détaillé : `Backend Master/src/modules/ai-copilot/AI_COPILOT_HTTP.md`.

Le contexte CRM (projets, KPI, contacts, pipeline, RH, calendrier...) est
récupéré via les 74 AI Tools MCP réels, chacun revérifié individuellement
par `mcp/permissionManager.js` selon le rôle de l'appelant — jamais un
contournement possible des permissions existantes du CRM (inchangé par
cette passe, déjà couvert par les 532 scénarios de validation).

## 8. Tests exécutés — résultats

```
Backend — suites liées à l'IA (ai.*/aiCopilot*/aiDashboard*)
  149 suites, 4656 tests — 100% verts (dont les 19 nouveaux de ai.config.test.js)

Backend — suite complète du dépôt
  165 suites, 4761 tests, 4740 verts, 21 échecs
  (tous dans test/mfa.test.js / test/mfa.dedup.test.js — dépendants d'un
  SMTP réel, préexistants avant cette passe, fichiers non touchés)

Preuve directe (hors Jest) — le vrai .env, après correction :
  $ node -e 'require("dotenv").config(); console.log(require("./src/ai/config").loadAiConfig().enabled)'
  [AI-COPILOT] enabled=true provider=none
  true

Scénario représentatif "KPI" bout-en-bout (Tier 2, AIManager réel + faux
fournisseur LLM — la question du corpus la plus proche de « Quels sont mes
KPI ? ») :
  $ npx jest test/ai.validation.copilotEndToEnd.test.js -t "dir-01"
  1 passed
```

## 9. Ce qui reste à faire — pas quelque chose que je peux fabriquer

Je ne peux pas exécuter moi-même le test final exigé ("Flutter Web →
Copilot IA → « Quels sont mes KPI ? » → réponse réelle") : il nécessite une
vraie clé LLM (OpenAI ou Anthropic) que je n'ai pas et ne dois pas inventer,
et un navigateur réel. Ce que j'ai prouvé à la place, avec un vrai
`AIManager` et un faux fournisseur LLM (mêmes permissions, mêmes Tools,
même construction de réponse — seul le texte final vient d'un faux modèle
plutôt que d'OpenAI/Anthropic) : le pipeline entier fonctionne pour une
question KPI. Il reste, côté utilisateur :

1. Renseigner `AI_LLM_PROVIDER`/`AI_LLM_MODEL`/`AI_LLM_API_KEY` dans le
   vrai `.env` avec de vraies valeurs.
2. Redémarrer le process (voir §10) — `AI_COPILOT_ENABLED` et les
   variables `AI_LLM_*` sont lues UNE FOIS au premier appel puis mises en
   cache pour la durée de vie du process (`aiCopilotBridge.service.js::getGateManager`)
   — éditer `.env` sans redémarrer laisse l'ancienne valeur active. C'est
   un comportement standard pour des variables d'environnement, pas un bug,
   mais c'est exactement le genre de piège qui a pu contribuer à la
   confusion initiale si quelqu'un a édité `.env` sans redémarrer.
3. Tester `POST /ai-copilot/chat` directement (curl/Postman) avec un JWT
   valide.
4. Tester depuis Flutter Web, "Quels sont mes KPI ?".

## 10. Commandes de déploiement

```bash
# 1. Vérifier le .env du serveur (les 5 lignes AI_COPILOT_*/AI_LLM_*
#    doivent être présentes — voir §4).
# 2. Redémarrer avec les nouvelles variables d'environnement prises en compte :
pm2 restart crmprobar-api --update-env

# 3. Vérifier les logs :
pm2 logs crmprobar-api --lines 100
# -> doit contenir, dès le démarrage (pas seulement à la première requête) :
#    [AI-COPILOT] enabled=true provider=<openai|anthropic|none>

# 4. Test direct de l'API (remplacer <JWT> par un vrai token) :
curl -X POST http://<host>/ai-copilot/chat \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"message":"Quels sont mes KPI ?"}'

# 5. Puis test depuis Flutter Web, dans le panneau Copilot IA.
```

## Comment vérifier ce rapport

```bash
cd "Backend Master"

# Le vrai .env contient bien le bloc AI_COPILOT_*/AI_LLM_*
grep -n "^AI_COPILOT\|^AI_LLM" .env

# Le parsing résout maintenant "true" correctement, avec le log de diagnostic
node -e 'require("dotenv").config(); require("./src/ai/config").loadAiConfig()'

# Tests dédiés à cette correction
npx jest test/ai.config.test.js test/aiCopilot.routes.test.js

# Régression complète liée à l'IA
npx jest --testPathPatterns="(ai\.|aiCopilot|aiDashboard)"
```
