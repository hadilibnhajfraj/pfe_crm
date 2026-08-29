# Updated_Documentation.md — Ce qui change pour l'équipe

Ce document résume, pour un développeur ou un opérateur qui n'a pas suivi l'audit en détail, ce qui a changé et ce qu'il doit faire.

## 1. Action immédiate requise (avant toute mise en production)

1. **Faire tourner (rotate) tous les secrets** listés dans `Security_Report.md` §1 : mot de passe DB, mot de passe SMTP, les 2 mots de passe superadmin, secret client OAuth Google, clé de chiffrement des tokens Google, `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/`JWT_MFA_SECRET`.
2. **Vérifier la visibilité du dépôt GitHub** (`hadilibnhajfraj/pfe_crm`) et qui y a eu accès.
3. Mettre à jour votre `.env` local avec les nouvelles valeurs — `.env.example` a été assaini et ne contient plus que des placeholders, il ne peut plus servir de référence pour d'anciennes valeurs.

## 2. Changements de comportement à connaître

### Routes désormais protégées (précédemment publiques)
- `POST /api/clients/import-csv` et `/import-factures` exigent maintenant un token **admin/superadmin/superadmin2** (auparavant : aucune authentification). Si un outil interne appelait ces routes sans token, il doit être mis à jour.
- `POST /notifications/send-email` exige maintenant un token valide.
- `GET /utils/geocode` exige maintenant un token valide (auparavant : public).

### Nouveaux contrôles de propriété (403 possibles là où c'était auparavant permissif)
- `PUT /pipeline/projects/:id/stage` (drag-and-drop kanban) : renvoie désormais **403** si l'utilisateur n'est ni admin-tier ni propriétaire du projet.
- `GET/PUT/DELETE /projects/:projectId/actions/:id` : idem, scopé au projet parent.
- `POST /maintenance-requests/:id/comments` : renvoie désormais **403** si l'utilisateur n'est ni le demandeur ni un gestionnaire maintenance.

### Mot de passe à l'inscription
- `POST /auth/signup` exige désormais un mot de passe avec majuscule + minuscule + chiffre + caractère spécial (comme la réinitialisation). `POST /auth/signin` **n'a pas changé** — un compte existant avec un mot de passe plus simple continue de fonctionner.

### Upload d'avatar
- `PUT /users/me/profile` (et l'endpoint `/me/avatar`, actuellement mort) n'acceptent plus que `.png/.jpg/.jpeg/.webp/.gif`. Un fichier d'un autre type renvoie désormais un **400** avec un message explicite au lieu d'être accepté silencieusement.

### Socket.IO — action requise côté client Flutter
- Le serveur Socket.IO exige désormais un token JWT à la connexion : `io(url, { auth: { token: accessToken } })`.
- **Sans cette mise à jour côté client, les connexions Socket.IO échouent** et les notifications temps réel ne fonctionnent plus — mais aucune donnée n'est exposée entre-temps (échec fermé). Ce correctif serveur est néanmoins nécessaire (auparavant, n'importe qui pouvait espionner les notifications de n'importe quel utilisateur).

## 3. Nouvelle documentation de sécurité (ce dossier)

- `Security_Report.md` — le rapport d'audit complet (gravité, impact, risque métier, cause, correction pour chaque constat).
- `Security_Fixes.md` — journal de chaque changement de code, fichier par fichier.
- `Security_Test_Plan.md` — comment les correctifs ont été testés, comment relancer les tests.
- `Threat_Model.md` — modèle de menaces (acteurs, surfaces d'entrée, actifs, risques résiduels priorisés).
- Ce fichier.

## 4. Ce qui reste ouvert (à planifier)

Voir `Threat_Model.md` §5 pour la liste priorisée. En résumé :
1. Rotation des secrets (ci-dessus, immédiat).
2. Téléchargement authentifié des pièces jointes (`/uploads/*`) — nécessite un changement de contrat client/serveur plus large.
3. Rotation des refresh tokens.
4. Décision produit sur la visibilité `list_projects`/KPI personnel entre commerciaux.
5. Extension du rate limiting à davantage de routes.
6. Mise à jour du client Flutter pour l'auth Socket.IO (ci-dessus).

## 5. Variables d'environnement — changements

Aucune nouvelle variable d'environnement introduite par cet audit. `.env.example` documente maintenant plus fidèlement les clés réellement lues par le code (voir `Security_Report.md` §4.7 pour `JWT_SECRET`, une variable pré-existante mais jusqu'ici non documentée, utilisée uniquement par `GET /metabase/token`).

## 6. Pour le module IA (`src/ai/`)

Le README dédié (`src/ai/README.md`, section « Sécurité du module IA ») a été mis à jour lors de la passe d'audit précédente de cette session pour refléter : le câblage par défaut de la limitation d'appels/audit dans `mcp/server/start.js::createServer()`, et l'extension du `PromptInjectionGuard` aux résultats d'outils réinjectés (`ToolCallingChain`, tous les Agents, `WorkflowManager`) réalisée dans cette passe. Aucune action supplémentaire requise côté documentation module IA au-delà de ce qui y est déjà décrit.
