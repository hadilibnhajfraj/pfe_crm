# Correction — le rôle « user » n'était pas dans la liste autorisée du Copilot

> Suite de `04_INCIDENT_COPILOT_PERMISSIONS.md`. Chaque affirmation est
> vérifiable (fichier + ligne, ou commande exécutable) — voir "Comment
> vérifier" en fin de document.

## 1. Fichier modifié

`Backend Master/.env` (+ `.env.example` pour le gabarit) — **un seul
fichier de configuration**, aucun code changé : l'architecture centralisée
(`canUseAiCopilot`, comparaison normalisée) construite lors de la
correction précédente n'avait besoin que d'une liste de rôles mise à jour,
exactement comme prévu par sa conception.

```diff
- AI_COPILOT_ROLES_ALLOWED=admin,superadmin,superadmin2,commercial
+ AI_COPILOT_ROLES_ALLOWED=admin,superadmin,superadmin2,commercial,user
```

## 2. Fonction responsable du blocage

`src/ai/manager/aiManager.js::isRoleAllowed(role)` — appelée par
`AiManager.canUseAiCopilot(user)`, elle-même la SEULE source de vérité
consommée par `aiCopilot.routes.js::requireCopilotEnabled` et
`aiCopilotSocket.js` (voir `04_INCIDENT_COPILOT_PERMISSIONS.md`, §4-5,
inchangé ici). La fonction elle-même n'avait pas de bug — elle compare
correctement (normalisé, insensible casse/espaces depuis la correction
précédente) le rôle de l'appelant à `config.rolesAllowed`, construit à
partir de `AI_COPILOT_ROLES_ALLOWED`. Le blocage venait uniquement du
CONTENU de cette liste, pas de la logique de comparaison.

## 3. Rôle détecté

`"user"` — confirmé comme le rôle **standard par défaut** de tout compte
CRM : `src/models/User.js`,
`DataTypes.ENUM("user", "commercial", "accueil", "admin", "superadmin", "superadmin2", "responsable_logistique_achat")`,
`defaultValue: "user"`. Un rôle réel de l'ENUM, jamais inventé.

## 4. Rôles autorisés (mis à jour)

```
AI_COPILOT_ROLES_ALLOWED=admin,superadmin,superadmin2,commercial,user
```

| Rôle | Autorisé ? |
|---|---|
| `admin`, `superadmin`, `superadmin2`, `commercial`, `user` | ✅ |
| `accueil` | ❌ (aucun besoin métier identifié) |
| `responsable_logistique_achat` | ❌ (restreint CRM-wide avant même le Copilot, voir `moduleAccessGuard.js` — non lié à cette correction) |

**Le Copilot ne contourne aucune permission CRM existante en ouvrant
"user"** — vérifié directement, pas supposé :
- `src/modules/projects/routes/project.routes.js` : `router.use(authRequired)`
  puis AUCUNE vérification de rôle sur `GET /projects` — un compte "user"
  peut DÉJÀ lister tous les projets via l'écran normal du CRM, sans le
  Copilot.
- `src/ai/mcp/tools/projects/listProjectsTool.js` /
  `dashboard/getDashboardKpisTool.js` / `getUserDashboardTool.js` :
  `requiredRoles: []` — ouverts à tout appelant authentifié, la donnée
  elle-même étant scopée par le service (`actingUser.id`), pas par un
  filtre de rôle.
- Seuls deux Tools dashboard restent réservés (`get_professional_dashboard`,
  `get_legacy_dashboard_kpis` → `ADMIN_TIER_ROLES`) : un compte "user" reste
  correctement refusé SUR CES DEUX TOOLS SPÉCIFIQUES par le mécanisme de
  permission par Tool, indépendant de ce gate et inchangé.

Autrement dit : ouvrir le Copilot au rôle "user" ne fait qu'offrir une
interface conversationnelle à des données déjà accessibles à ce rôle par
ailleurs — jamais un nouvel accès.

## 5. Endpoint Copilot

`POST /ai-copilot/chat` (+ WebSocket `ai-copilot:send`) — inchangé, voir
`04_INCIDENT_COPILOT_PERMISSIONS.md`, §5.

## 6. Tests effectués

```
Backend — suites liées à l'IA (ai.*/aiCopilot*/aiDashboard*) : 150 suites,
4675 tests — 100% verts

Backend — npm test (suite complète du dépôt) : 166 suites, 4780 tests,
4759 verts, 21 échecs (tous test/mfa.test.js/test/mfa.dedup.test.js,
préexistants, SMTP réel requis, fichiers non touchés)
```

`test/ai.copilotPermissions.test.js` mis à jour : `"user"` déplacé de la
liste "refusé" vers la liste "autorisé" (14 tests, tous verts) ; le
négatif demandé (ÉTAPE 7, un rôle réellement non autorisé) utilise
désormais `"accueil"`/`"responsable_logistique_achat"` — des rôles réels,
toujours refusés.

| Cas | Résultat attendu | Vert ? |
|---|---|---|
| `user` | autorisé | ✅ |
| `admin`/`superadmin`/`superadmin2`/`commercial` | toujours autorisés (non-régression) | ✅ |
| `accueil` | 403 `role_not_allowed` | ✅ |
| `responsable_logistique_achat` | 403 `role_not_allowed` | ✅ |
| non authentifié | 401 (jamais 403) | ✅ |

## 7. Résultat du test réel avec le rôle "user"

Je ne peux pas exécuter un VRAI appel LLM (pas de clé configurée, voir
`03_INCIDENT_COPILOT_DESACTIVE.md` §4/§9 — je n'en fabrique pas). Preuve la
plus proche possible, avec le VRAI routage/permissions et un VRAI
`AIManager`, contre un fournisseur LLM factice :

```bash
$ npx jest test/ai.validation.copilotScenarios.test.js -t "Scénario prj-02"
# prj-02 = { message: "Quels projets sont en retard ?", user: USERS.user }
# (la question EXACTE demandée à l'ÉTAPE 6)
5 passed  →  intention détectée=projects, contexte=tools, Agent=project_agent
             ATTEINT et AUTORISÉ pour le rôle "user", Tools attendus présents,
             permission Tool vérifiée.

$ npx jest test/ai.validation.copilotEndToEnd.test.js -t "prj-01"
# prj-01 = { message: "Montre-moi la liste des projets en cours.", user: USERS.user }
1 passed  →  enveloppe de réponse complète produite par un VRAI AIManager
             pour ce rôle exact (fournisseur LLM factice, tout le reste réel).
```

Ces deux scénarios existaient DÉJÀ dans le corpus de 532 (construits avant
cette demande) avec `USERS.user` comme acteur — confirmant que
`project_agent`/`kpi_agent` étaient conçus dès le départ comme "ouverts à
tout utilisateur authentifié" (voir leurs commentaires dans
`copilotValidationScenarios.js`). Le blocage venait donc entièrement du
gate `AI_COPILOT_ROLES_ALLOWED`, jamais des Agents eux-mêmes — cette
correction aligne enfin le gate grossier sur ce que les Agents autorisaient
déjà.

Reste, côté utilisateur, à vérifier en conditions réelles (`https://crmprobar.com`,
avec une vraie clé LLM configurée) :
1. `pm2 restart crmprobar-api --update-env`
2. `pm2 logs crmprobar-api --lines 100` → `[AI-COPILOT] enabled=true ...`
   puis, à la connexion du compte "user" testé :
   `[AI-COPILOT] permission check userId=... role=user allowed=true`
3. Se connecter avec ce compte, poser : « Quels sont mes KPI ? »,
   « Quels projets sont en retard ? », « Combien de projets ai-je ? ».

## Comment vérifier ce rapport

```bash
cd "Backend Master"
grep -n "^AI_COPILOT_ROLES_ALLOWED" .env
npx jest test/ai.copilotPermissions.test.js
npx jest test/ai.validation.copilotScenarios.test.js -t "Scénario prj-02"
npx jest test/ai.validation.copilotEndToEnd.test.js -t "prj-01"
npm test
```
