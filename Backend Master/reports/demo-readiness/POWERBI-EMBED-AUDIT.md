# Intégration Power BI dans Flutter Web — audit et proposition (12/10/2026)

Rien n'a été modifié : ni modèle, ni code, ni base, ni Power BI Service. Aucune fonctionnalité décrite ici n'est opérationnelle ; tout est à l'état de proposition.

## 1. Fichiers concernés

| Élément | Emplacement | État |
|---|---|---|
| Modèle d'origine | `Documents\PFE_CRM_BI_DEMO\PFE_CRM.SemanticModel` | À ne pas toucher |
| Copie de travail | `Documents\PFE_CRM_BI_DEMO_V3\PFE_CRM.SemanticModel` | Cible des rôles RLS proposés |
| Rapport V3 | `Documents\PFE_CRM_BI_DEMO_V3\PFE_CRM.Report` | Aucune modification nécessaire pour la RLS |
| Middleware JWT | `src/middleware/auth.middleware.js`, `src/utils/tokens.js` | Existant, réutilisé |
| Rôles | `src/constants/roles.js` | Existant, réutilisé |
| Session Flutter | `lib/providers/auth_service.dart`, `lib/providers/api_client.dart` | Existant, réutilisé |
| Hôte web Flutter | `web/index.html` | À compléter (script Power BI) |
| Nouveau code | `src/modules/powerbi/` (backend), `lib/powerbi/` (Flutter) | À créer après accord |

## 2. Constats vérifiés

### Source de données (lue dans les fichiers, sans actualisation)
- Paramètres `PG_Server = 127.0.0.1:5432`, `PG_Database = cbigestionnairepfe_demo` (liste de valeurs limitée à la démo).
- Toutes les tables sont en mode Import. Le modèle affiche donc les données de sa dernière actualisation, pas l'état actuel de la base.

### Correspondance entre comptes et dimension Commercial
Requête SQL en lecture seule sur la démo, comparée à une requête DAX en lecture seule sur le modèle V3 ouvert.

| | Base de démo (aujourd'hui) | Modèle Power BI (cache) |
|---|---|---|
| Identifiants (`id`) | 11 comptes | 10 comptes, **mêmes UUID** |
| E-mails | `demo.commercial01@cbi_tunisia.com` | `demo.commercial01@demo.invalid` |
| Séparateur | `demo.commercial_sedentaire01@…` | `demo.commercial-sedentaire01@…` |
| `issam@gmail.com` (superadmin2) | présent | **absent** |

Les e-mails de la base ont été modifiés aujourd'hui (dernier `updatedAt` : 13 h 36, heure locale). Les e-mails ne correspondent donc plus ; les identifiants, si.

Périmètre par commercial, identique des deux côtés :

| Compte | Projets | Contacts | Relances | Actions |
|---|---|---|---|---|
| commercial01 | 14 | 23 | 33 | 68 |
| commercial02 | 14 | 24 | 37 | 78 |
| commercial03 | 13 | 16 | 30 | 66 |
| commercial04 | 13 | 21 | 41 | 75 |
| commercial05 | 13 | 20 | 35 | 66 |
| commercial06 | 13 | 24 | 33 | 75 |
| admin, 2 sédentaires, logistique | 0 | 0 | 0 | 0 |

Ces valeurs serviront de référence aux tests RLS.

### Relations utiles à la RLS
- `Dim Commercial` est une table calculée : `SUMMARIZE('public users', id, email, role)`.
- `Dim Commercial[id]` filtre `projects[ownerId]` et `commercial_contacts[commercialId]`.
- `projects` filtre `project_actions`, `project_activities`, `project_devis`, `project_bon_de_commande`, `project_members`, `user_projects`.
- `commercial_contacts` filtre `commercial_contact_actions`, `commercial_contact_relances`, `commercial_projects`.
- `public users` (table masquée) a **aussi** une relation active vers `projects[ownerId]` : elle doit être filtrée par la RLS, sinon elle resterait lisible en entier.
- **Non reliés à un commercial** : `public clients`, `public machines`, `production_fiches_v`, `recuperable_fiches`, `recuperable_lignes`. Une RLS par commercial ne les restreint pas.
- 22 contacts sur 150 n'ont pas de commercial : ils seront invisibles pour tout commercial.
- Aucun rôle n'existe dans le modèle (pas de dossier `roles`, aucun `USERPRINCIPALNAME`).

### Authentification existante
- `authRequired` vérifie la signature du JWT et place `{sub, email, role, rv}` dans `req.user`. `sub` est l'UUID de l'utilisateur.
- Le middleware ne vérifie pas que l'utilisateur existe encore ni qu'il est actif : la route Power BI devra le faire elle-même.
- Rôles : `commercial`, `commercial_sedentaire`, `accueil`, `admin`, `superadmin`, `responsable_logistique_achat`, `superadmin2`. `ADMIN_TIER_ROLES = admin, superadmin, superadmin2`.
- CORS : seule l'origine `http://localhost:57745` est autorisée.

### Dépendances
- Backend : `axios` est déjà installé et suffit pour les deux appels Microsoft. Aucune nouvelle dépendance n'est indispensable ; `@azure/msal-node` est optionnel.
- Flutter : Dart `^3.6`, cible web. Il faut la bibliothèque JavaScript `powerbi-client` (balise `<script>` dans `web/index.html`, fichier servi localement de préférence) et un `HtmlElementView` via `dart:ui_web` + `dart:js_interop`. Ce code n'existe que pour le web : import conditionnel obligatoire pour ne pas casser les autres cibles.
- `web/index.html` n'a pas de politique CSP qui bloquerait `app.powerbi.com`.

## 3. Architecture proposée — « App owns data »

```
Flutter Web ──(JWT du CRM)──> GET /powerbi/embed-config
                                  │ 1. authRequired
                                  │ 2. relit l'utilisateur en base (existe, actif, rôle)
                                  │ 3. jeton Entra (client credentials, secret côté serveur)
                                  │ 4. GenerateToken avec identité effective + rôle RLS
Flutter Web <── embedUrl + jeton court ──┘
     └─ powerbi-client charge le rapport ; la RLS filtre le modèle
```

### Contrat de `GET /powerbi/embed-config`
Requête : en-tête `Authorization: Bearer <JWT du CRM>`. **Aucun paramètre** : ni e-mail, ni identifiant, ni rôle ne sont lus depuis le client.

Réponse 200 :
```json
{
  "reportId": "…", "embedUrl": "https://app.powerbi.com/reportEmbed?…",
  "embedToken": "…", "expiresAt": "2026-10-16T09:30:00Z",
  "viewer": { "email": "demo.commercial01@cbi_tunisia.com", "scope": "commercial", "label": "Utilisateur connecté : demo.commercial01@cbi_tunisia.com" }
}
```
Pour un administrateur : `"scope": "global"`, `"label": "Vue globale — Administrateur"`.

| Code | Cas |
|---|---|
| 401 | JWT absent, invalide ou expiré (comportement actuel du middleware) |
| 403 `POWERBI_ROLE_NOT_ALLOWED` | Rôle sans politique définie |
| 403 `POWERBI_USER_INACTIVE` | Compte désactivé ou supprimé depuis l'émission du JWT |
| 404 `POWERBI_USER_NOT_IN_MODEL` | Utilisateur sans correspondance dans `Dim Commercial` |
| 503 `POWERBI_NOT_CONFIGURED` | Variables Microsoft absentes |
| 502 `POWERBI_UPSTREAM_ERROR` | Refus de Microsoft (message générique, détail dans les logs serveur sans jeton) |

En-têtes : `Cache-Control: no-store`. Jetons jamais journalisés.

### Identité effective
- `username` = **UUID de l'utilisateur** (`req.user.sub`, revérifié en base), pas l'e-mail. Les UUID sont identiques entre la base et le modèle ; les e-mails ne le sont plus. Aucune actualisation du modèle n'est alors nécessaire.
- `roles` = `["Commercial"]` ou `["Vue globale"]`, choisi par le serveur d'après le rôle lu en base.
- `datasets` = le seul modèle du rapport ; jeton limité à ce rapport, en lecture.

### Politique par rôle (à valider)
| Rôle CRM | Rôle RLS proposé | Remarque |
|---|---|---|
| commercial | Commercial | Ses projets et contacts |
| admin, superadmin, superadmin2 | Vue globale | Conforme à `ADMIN_TIER_ROLES` |
| commercial_sedentaire | **à décider** | 0 projet et 0 contact dans la démo ; dans le CRM il gère tous les contacts |
| responsable_logistique_achat | **à décider** | Ne concerne que la production |
| accueil | Refus (403) | Aucune politique connue |

### Jetons, renouvellement, déconnexion
- Jeton d'intégration de courte durée ; Flutter le garde en mémoire uniquement, jamais dans `get_storage`.
- Renouvellement : rappel de la route quelques minutes avant `expiresAt`, puis `report.setAccessToken`.
- Si la route répond 401 : même traitement que le reste de l'application (déconnexion).
- Déconnexion ou changement de compte : destruction du cadre (`powerbi.reset`), oubli du jeton, nouvel appel pour le compte suivant. Un jeton déjà émis reste valable jusqu'à son expiration : d'où la durée courte.
- Segment « Commercial » : présélectionné et masqué pour un commercial. C'est un confort d'affichage ; la protection vient de la RLS.

### Prérequis Microsoft restant à confirmer
1. Locataire Entra et droit d'y créer une inscription d'application avec secret.
2. Paramètre d'administration Power BI « autoriser les principaux de service à utiliser les API ».
3. Espace de travail où ce principal est membre, et rapport publié dedans.
4. Capacité (Embedded A, Fabric F ou Premium). Sans capacité : jetons d'essai en nombre limité, pour le développement seulement.
5. Variables serveur : `POWERBI_TENANT_ID`, `POWERBI_CLIENT_ID`, `POWERBI_CLIENT_SECRET`, `POWERBI_WORKSPACE_ID`, `POWERBI_REPORT_ID`, `POWERBI_DATASET_ID` (hors `.env` de production).

## 4. RLS proposée pour la copie V3 (non appliquée)

Deux fichiers à ajouter dans `PFE_CRM.SemanticModel/definition/roles/`, plus deux lignes `ref role` dans `model.tmdl`. Aucune mesure, relation ni table n'est modifiée.

`Commercial.tmdl`
```
role Commercial
	modelPermission: read

	tablePermission 'Dim Commercial' = 'Dim Commercial'[id] = USERPRINCIPALNAME()

	tablePermission 'public users' = 'public users'[id] = USERPRINCIPALNAME()
```

`Vue globale.tmdl`
```
role 'Vue globale'
	modelPermission: read
```

Effets attendus :
- Un commercial ne voit que ses projets, contacts, actions et relances, sur toutes les pages.
- `Nombre Commerciaux` vaudra 1 pour lui ; les répartitions par commercial n'auront qu'une barre.
- Clients, production, machines et déchets restent globaux. Options : les laisser (ce ne sont pas des données par commercial), ou ajouter `tablePermission 'public clients' = FALSE()` et l'équivalent sur la production pour les masquer à ce rôle. **Décision à prendre.**
- Un identifiant inconnu donne un rapport vide ; le backend refuse avant d'en arriver là (404).

## 5. Tests prévus et commandes sûres

Tous en lecture seule, sur la démo ou sur le modèle local.

| Test | Moyen | Attendu |
|---|---|---|
| Commercial 01 | Desktop › Modélisation › « Afficher comme » rôle Commercial, autre utilisateur = `ee815d2c-3a83-57fa-9570-76693b29bf69` ; ou requête DAX avec emprunt d'identité | 14 projets, 23 contacts, 33 relances, 68 actions |
| Commercial 02 | idem avec `68d9ded1-f1e5-566e-8a8e-e9e202e0066e` | 14 / 24 / 37 / 78 |
| Administrateur | rôle « Vue globale » | 80 / 150 / 209 / 450 |
| Sans correspondance | rôle Commercial, identifiant `00000000-0000-0000-0000-000000000000` | tout vide |
| Références SQL | `node q.js -e "select count(*) from projects where \"ownerId\" = '<uuid>'"` (session en lecture seule, refuse toute base autre que la démo) | mêmes nombres |
| Route backend | tests Jest avec `axios` et le modèle `User` simulés, sans base | codes du § 3 ; e-mail envoyé par le client ignoré |
| Flutter | tests de widget avec service simulé | libellés, erreurs, réinitialisation au changement de compte |

Le test de bout en bout (deux comptes réels dans Flutter, rapport intégré) n'est possible qu'une fois les prérequis Microsoft réunis. Tant qu'il n'est pas fait, la synchronisation ne doit pas être déclarée réalisée.

## 6. Blocages

1. **Publication et Microsoft** : aucun rapport publié vérifiable, pas d'inscription d'application, capacité inconnue. Je ne crée rien de tout cela.
2. **Backend lancé sur la base réelle** : le processus `npm run dev` démarré à 14 h 51 est connecté à `cbigestionnairepfe`. Les essais de la route devront utiliser `npm run demo:start`.
3. **E-mails désalignés** entre base et modèle : contourné par l'usage de l'UUID ; les libellés affichés dans le rapport resteront en `@demo.invalid` tant que vous n'aurez pas actualisé depuis la démo.
4. **`issam@gmail.com`** absent du modèle : sans effet s'il reçoit « Vue globale ».
5. **Décisions métier** : politique des sédentaires et de la logistique ; visibilité des clients et de la production pour un commercial.

## 7. Autorisations attendues avant toute action

- Ajouter les deux rôles dans le modèle de la copie V3 (Desktop fermé sur la V3).
- Écrire la route backend et l'écran Flutter (code inactif tant que les variables Microsoft sont absentes).
- Publication, inscription Entra, capacité : de votre côté uniquement.
