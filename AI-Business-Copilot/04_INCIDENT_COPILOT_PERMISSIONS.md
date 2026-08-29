# Incident — « Votre rôle n'est pas autorisé à utiliser le Copilot IA »

> Suite de `03_INCIDENT_COPILOT_DESACTIVE.md` (AI_COPILOT_ENABLED corrigé).
> Chaque affirmation ci-dessous est vérifiable (fichier + ligne, ou
> commande de test exécutable) — voir "Comment vérifier" en fin de document.

## 1. Cause exacte du blocage

`AI_COPILOT_ENABLED=true` fonctionnait déjà (incident précédent corrigé).
Le blocage venait de la DEUXIÈME condition du même gate :
`AI_COPILOT_ROLES_ALLOWED` n'existait, dans le `.env` réel, qu'avec la
valeur `admin,superadmin` — ajoutée lors de la correction précédente comme
valeur de départ prudente, jamais pensée comme définitive. Tout utilisateur
dont le rôle réel n'était ni `admin` ni `superadmin` (donc `commercial`,
`superadmin2`, etc.) recevait 403.

**Fichier exact, condition exacte** :
`src/modules/ai-copilot/routes/aiCopilot.routes.js`, fonction
`requireCopilotEnabled` — avant cette correction :
```js
if (!bridge.isRoleAllowed(req.user.role)) {
  return res.status(403).json({ message: "Votre rôle n'est pas autorisé à utiliser le Copilot IA." });
}
```
`bridge.isRoleAllowed(role)` → `AiManager.isRoleAllowed(role)`
(`src/ai/manager/aiManager.js`) → `this.config.rolesAllowed.includes(role)`,
où `config.rolesAllowed` vient de `AI_COPILOT_ROLES_ALLOWED` (voir
`src/ai/config/ai.config.js`).

Le second message, « Votre rôle n'a pas accès au Copilot IA. », est
côté Flutter — `lib/ai/providers/copilot_controller.dart` et
`copilot_dashboard_controller.dart`, `_friendlyError()` : un texte fixe
affiché quand le backend répond 403 (`CopilotForbiddenException`). Il ne
fait que RELAYER la décision du backend, jamais l'inventer — conforme à
l'ÉTAPE 11/§6 : je ne l'ai pas modifié.

## 2. Rôle réellement présent (audité, pas supposé)

`src/models/User.js` — ENUM Sequelize réel du champ `role` :
```js
role: {
  type: DataTypes.ENUM("user", "commercial", "accueil", "admin", "superadmin", "superadmin2", "responsable_logistique_achat"),
  defaultValue: "user",
}
```
**Confirmé par les migrations** (`superadmin2` et
`responsable_logistique_achat` ajoutés par
`20260713105217-add-superadmin2-to-users-role-enum.js` et
`20260622090000-add-responsable-logistique-achat-to-users-role-enum.js`).

**`commercial_terrain` et `commercial_sedentaire` (cités dans la demande
comme candidats) N'EXISTENT PAS dans ce projet** — il n'y a qu'un seul rôle
`commercial`. Je ne les ai ni ajoutés à l'ENUM ni inventés dans les tests —
conformément à la consigne "ne pas inventer de nouveaux rôles".

Le rôle vient de `req.user.role`, lui-même le champ `role` du payload JWT
signé à la connexion (`middleware/auth.middleware.js`) — jamais un second
champ `req.user.roles` (pluriel) : ce projet n'a qu'un rôle par utilisateur,
jamais une liste.

## 3. Rôles autorisés — décision et justification

| Rôle réel | Copilot autorisé ? | Pourquoi |
|---|---|---|
| `admin` | ✅ | Administration complète du CRM |
| `superadmin` | ✅ | Idem, niveau supérieur |
| `superadmin2` | ✅ | Idem (rôle ajouté après `superadmin`, mêmes besoins) |
| `commercial` | ✅ | Analyse KPI/pipeline/contacts commerciaux — le cas d'usage central du Copilot |
| `user` | ❌ | Rôle générique, aucun besoin métier identifié dans la demande |
| `accueil` | ❌ | Idem |
| `responsable_logistique_achat` | ❌ | **Déjà restreint, avant même le Copilot**, à un sous-ensemble fixe de modules (`middleware/moduleAccessGuard.js::ALLOWED_PREFIXES_BY_ROLE`, ne contient pas `/ai-copilot`) — règle métier PRÉEXISTANTE, non liée à cette correction, volontairement non élargie ici (aurait été un changement de périmètre non demandé) |

`Backend Master/.env` :
```
AI_COPILOT_ROLES_ALLOWED=admin,superadmin,superadmin2,commercial
```

## 4. Fichier(s) modifié(s)

| Fichier | Changement |
|---|---|
| `Backend Master/.env` | `AI_COPILOT_ROLES_ALLOWED` étendu à `admin,superadmin,superadmin2,commercial` (root cause fix) |
| `Backend Master/.env.example` | Même valeur, + commentaire listant les rôles RÉELS de l'ENUM |
| `Backend Master/src/ai/manager/aiManager.js` | `isRoleAllowed(role)` compare désormais en normalisant (trim + lowercase) les DEUX côtés — jamais une comparaison stricte sensible à la casse/aux espaces (ÉTAPE 4). Ajout de `canUseAiCopilot(user)` — **la seule source de vérité** (`{allowed, reason}`), combinant `isEnabled()` + `isRoleAllowed()` (ÉTAPE 5) |
| `Backend Master/src/modules/ai-copilot/services/aiCopilotBridge.service.js` | Ajout de `canUseAiCopilot(user)` — délègue à `AiManager.canUseAiCopilot()` et journalise `[AI-COPILOT] permission check userId=... role=... allowed=...` à CHAQUE appel (jamais de JWT/mot de passe/token/clé — voir ÉTAPE 2/10) |
| `Backend Master/src/modules/ai-copilot/routes/aiCopilot.routes.js` | `requireCopilotEnabled` appelle désormais UNE SEULE fois `bridge.canUseAiCopilot(req.user)` au lieu de deux appels séparés (`isEnabled()` puis `isRoleAllowed()`) avec leur propre construction de réponse dupliquée |
| `Backend Master/src/modules/ai-copilot/socket/aiCopilotSocket.js` | Même refonte côté WebSocket — plus aucune deuxième liste de rôles/logique dupliquée |
| `Backend Master/test/ai.copilotPermissions.test.js` | **Nouveau.** 14 tests : chaque rôle RÉEL de l'ENUM (autorisé/refusé), normalisation casse/espaces, priorité `copilot_disabled` sur `role_not_allowed`, et confirmation qu'aucun Tool RH n'expose de donnée salariale (ÉTAPE 9) |
| `Backend Master/test/aiCopilot.routes.test.js` | +2 tests : `canUseAiCopilot` appelé une seule fois avec `req.user` ; 401 sans authentification (jamais un 403 "rôle" pour un appelant sans rôle du tout) |
| `Backend Master/test/aiCopilot.socket.test.js` | Mock étendu avec `canUseAiCopilot` (délégation vers les mêmes mocks existants, aucun test cassé) |
| `Backend Master/test/aiCopilotBridge.service.test.js` | +3 tests : délégation vers `AiManager.canUseAiCopilot()`, contenu exact du log `[AI-COPILOT] permission check` (présence userId/role/allowed, absence de tout secret), robustesse sur un utilisateur `undefined` |

Aucun fichier Flutter modifié — la sécurité reste entièrement côté backend,
comme demandé (ÉTAPE 6/11).

## 5. Endpoint Copilot

`POST /ai-copilot/chat` (+ l'événement WebSocket `ai-copilot:send`,
même décision `canUseAiCopilot`). Chaîne : `authRequired` (401) →
`requireCopilotEnabled` → `bridge.canUseAiCopilot(req.user)` → 503
`copilot_disabled` / 403 `role_not_allowed` / passage à
`aiCopilot.controller.js::chat` → `bridge.sendMessage()` →
`AIManager.handleMessage()` (contexte CRM via les 74 AI Tools MCP réels,
chaque Tool revérifiant lui-même la permission de l'appelant — voir §6).

## 6. Le Copilot ne contourne aucune permission CRM existante (ÉTAPE 9)

Deux niveaux de contrôle INDÉPENDANTS, jamais un seul :
1. **Ce gate** (`canUseAiCopilot`) — grossier, "ce rôle a-t-il seulement le
   droit d'ouvrir le Copilot".
2. **Le contrôle par Tool/Agent**, inchangé par cette correction —
   `mcp/permissionManager.js`/`utils/authorization.js::isAuthorized`,
   revérifié pour CHAQUE question, indépendamment du gate ci-dessus. Déjà
   couvert par les 532 scénarios du corpus de validation (ex. `com-17`,
   `com-23` : un rôle `user`/`responsable_logistique_achat` reste refusé
   au niveau de l'Agent `commercial_agent` même s'il avait par hypothèse
   franchi le gate général).

Concernant l'exemple cité (« Donne-moi les salaires de tous les
employés ») : **aucun AI Tool MCP n'expose de donnée salariale** — vérifié
directement (`grep -rli salaire src/ai/mcp/tools/` → aucun résultat). Les
Tools RH (`src/ai/mcp/tools/hr/`) exposent uniquement des demandes de
congé/sortie, jamais un champ de paie. Le Copilot n'a donc structurellement
aucune capacité à répondre à cette question, quel que soit le rôle — pas
seulement une permission refusée, une CAPACITÉ absente (test dédié dans
`ai.copilotPermissions.test.js`).

## 7. Tests exécutés — résultats

```
Backend — suites liées à l'IA (ai.*/aiCopilot*/aiDashboard*)
  150 suites, 4675 tests — 100% verts (dont les 14 nouveaux de
  ai.copilotPermissions.test.js + 5 nouveaux répartis dans
  aiCopilot.routes.test.js/aiCopilotBridge.service.test.js)

Backend — suite complète du dépôt
  166 suites, 4780 tests, 4759 verts, 21 échecs
  (tous dans test/mfa.test.js / test/mfa.dedup.test.js — préexistants,
  dépendants d'un SMTP réel, fichiers non touchés par cette passe)

Preuve directe (hors Jest) — le vrai .env, rôles réellement chargés :
  $ node -e 'require("dotenv").config(); console.log(require("./src/ai/config").loadAiConfig().rolesAllowed)'
  [ 'admin', 'superadmin', 'superadmin2', 'commercial' ]
```

Détail des tests par rôle (`ai.copilotPermissions.test.js`, contre le VRAI
`AiManager`, jamais un mock) :

| Rôle testé | Résultat attendu | Vert ? |
|---|---|---|
| `admin` | autorisé | ✅ |
| `superadmin` | autorisé | ✅ |
| `superadmin2` | autorisé | ✅ |
| `commercial` | autorisé | ✅ |
| `user` | 403 `role_not_allowed` | ✅ |
| `accueil` | 403 `role_not_allowed` | ✅ |
| `responsable_logistique_achat` | 403 `role_not_allowed` | ✅ |
| rôle inconnu/garbage | 403 `role_not_allowed`, jamais un crash | ✅ |
| non authentifié | 401 (jamais 403) | ✅ |
| rôle avec casse/espaces (` Admin `) | toujours reconnu | ✅ |

## 8. Commande PM2 utilisée pour le déploiement

```bash
# 1. Vérifier .env sur le serveur (AI_COPILOT_ROLES_ALLOWED doit inclure
#    les rôles métier réels — voir §3).
# 2. Redémarrer avec prise en compte des nouvelles variables :
pm2 restart crmprobar-api --update-env

# 3. Vérifier les logs :
pm2 logs crmprobar-api --lines 100
# -> au démarrage : [AI-COPILOT] enabled=true provider=<...>
# -> à la première question posée par un utilisateur : [AI-COPILOT] permission check userId=... role=... allowed=true

# 4. Se connecter avec un compte "commercial" (ou admin/superadmin/superadmin2),
#    ouvrir le Copilot IA, poser :
#    « Quels projets sont en retard ? »
```

Comme pour l'incident précédent : je ne peux pas exécuter moi-même l'étape
finale "vraie réponse IA dans Flutter Web" (nécessite une vraie clé
`AI_LLM_API_KEY`, absente par choix — voir `03_INCIDENT_COPILOT_DESACTIVE.md`,
§4/§9). Ce que cette correction garantit, prouvé par les tests ci-dessus :
un utilisateur `admin`/`superadmin`/`superadmin2`/`commercial` franchit
désormais le gate de permission et atteint réellement
`AIManager.handleMessage()` — le blocage rapporté dans cette demande est
résolu.

## Comment vérifier ce rapport

```bash
cd "Backend Master"

# Le vrai .env autorise bien les 4 rôles métier
grep -n "^AI_COPILOT_ROLES_ALLOWED" .env

# Chaque rôle réel de l'ENUM, testé contre le vrai AiManager
npx jest test/ai.copilotPermissions.test.js

# Câblage HTTP/WebSocket vers la source unique canUseAiCopilot
npx jest test/aiCopilot.routes.test.js test/aiCopilot.socket.test.js test/aiCopilotBridge.service.test.js

# Régression complète liée à l'IA
npx jest --testPathPatterns="(ai\.|aiCopilot|aiDashboard)"
```
