# AI Business Copilot — Plan de développement

**Document de cadrage technique · Aucune ligne de code produite par ce document**
Projet : CRM CBI Tunisia (PROBAR / PROMESH) — Backend Master (Node.js/Express/Sequelize) + Dash Master Toolkit (Flutter) + PostgreSQL
Rédigé à partir de l'analyse de `CRM_Architecture_Complète.pdf` (UML, ERD, DDD, référentiel API, constats structurels) et de la lecture du dépôt (`Backend Master/src/*`, `Dash Master Toolkit/lib/*`)
Statut : **Draft pour revue métier & technique** · Date : 2026-07-27

---

## 0. Comment lire ce document

Ce dossier ne décrit aucune implémentation : c'est un plan directeur destiné à cadrer le développement de l'**AI Business Copilot** avant la première ligne de code. Il s'appuie systématiquement sur l'existant réel du dépôt (et non sur une architecture idéale) : quand une contrainte AS-IS du CRM impose un choix (ex. : pas de Redis, pas de file de messages, deux styles de routage), ce document le signale explicitement plutôt que de l'ignorer.

Sommaire :
1. Objectifs & périmètre
2. Rappel des contraintes héritées (ce que le Copilot doit respecter)
3. Vision produit — cas d'usage du Copilot
4. Architecture cible
5. Composants à développer (catalogue)
6. Modèle de données additionnel
7. Dépendances entre modules IA
8. Roadmap technique par sprints
9. Risques techniques
10. Conventions de développement
11. Critères de validation par sprint (Definition of Done)
12. Gouvernance, sécurité & conformité données
13. Annexes (glossaire, questions ouvertes)

---

## 1. Objectifs & périmètre

### 1.1 Objectif du Copilot

L'AI Business Copilot est un assistant conversationnel et proactif intégré au CRM, capable de :

- **Répondre en langage naturel** à des questions sur les données métier déjà exposées par le CRM (KPI commerciaux, état du pipeline, projets en retard, demandes RH/maintenance en attente, statistiques industrielles PROMESH/PROBAR).
- **Résumer et synthétiser** (ex. : digest quotidien d'un commercial, résumé d'un projet, résumé d'une fiche POR PROMESH).
- **Proposer des actions** (relance à planifier, prochaine étape de pipeline suggérée, brouillon de réponse à une demande RH) — **jamais** exécutées sans validation humaine explicite en phase 1.
- **Assister la saisie** (aide au remplissage de formulaire, détection d'anomalies en s'appuyant sur — et en généralisant — l'heuristique existante `services/aiDataCleaner.js`).

### 1.2 Non-objectifs (explicitement hors périmètre v1)

- Le Copilot n'est **pas** un moteur de décision autonome : aucune action irréversible (archivage, validation POR PROMESH, changement de rôle utilisateur) ne doit pouvoir être déclenchée directement par le modèle sans passage par les workflows d'approbation déjà existants (§3.3 et §5.3 du dossier d'architecture — `ArchiveRequest`, `HrRequest`, `MaintenanceRequest`).
- Pas de remplacement du RBAC existant : le Copilot **hérite** des permissions de l'utilisateur connecté, il ne les étend jamais.
- Pas de fine-tuning de modèle en v1 : usage d'un LLM hébergé via API (prompting + retrieval), pas d'entraînement de modèle propriétaire.
- Pas de couverture du module Kanban « gabarit UI-Kit » non branché, ni des tableaux de bord de démonstration (académique/finance/ecommerce) identifiés comme non connectés au backend réel (§2.4, §11.12 du dossier d'architecture).

### 1.3 Pourquoi maintenant, et pourquoi prudemment

Le dossier d'architecture existant qualifie déjà le seul composant « IA » actuel (`aiDataCleaner.js`) d'heuristique, pas de modèle. Introduire un vrai LLM est donc un **saut d'architecture**, pas une extension incrémentale : nouvelle surface d'attaque, nouveau flux de données sortant vers un tiers (le fournisseur LLM), nouveau mode de défaillance (hallucination). Le plan ci-dessous traite chacun de ces trois points comme un livrable de sprint à part entière, pas comme un détail d'implémentation.

---

## 2. Rappel des contraintes héritées (ce que le Copilot doit respecter)

Ces constats viennent directement du dossier d'architecture (chap. 2, 3, 10, 14) et conditionnent des choix de conception ci-dessous — ils ne sont pas rappelés par exhaustivité mais parce que chacun **change une décision d'architecture du Copilot** :

| Constat AS-IS | Impact direct sur la conception du Copilot |
|---|---|
| Backend = un seul processus Node (`node src/app.js`), pas de cluster, pas de Redis, pas de file de messages | Les appels LLM (latence 1–10s) **ne doivent jamais bloquer** la boucle d'événements ni la connexion Socket.IO existante. Le Copilot doit introduire son propre mécanisme de traitement asynchrone (worker in-process avec file en base, cf. §4.3) plutôt que de supposer une infrastructure de queue qui n'existe pas. |
| Autorisation hybride rôle + e-mails codés en dur (root admin, gestionnaire RH, responsable maintenance…) | Le Copilot ne doit **pas** coder en dur de nouvelles règles métier dans le module IA : il doit déléguer chaque vérification de permission aux services/policies existants (`project.policy`, `requireRole`, `kpiRoleGuard`) — jamais réimplémenter une logique de portée parallèle. |
| Deux styles de routage coexistants (`src/routes/*` legacy vs `src/modules/*` en couches) | Le module IA est **greenfield** : il doit être écrit exclusivement dans le style en couches (`modules/ai-copilot/{routes,controllers,services,repositories,dto,validators}`), sans jamais toucher au routeur legacy. |
| Tables historiques sans FK physique vs tables récentes (RH, maintenance, archivage, POR PROMESH) avec FK réelles | Toutes les nouvelles tables IA doivent déclarer des **contraintes FK physiques** dès la première migration — pas de dette reproduite. |
| Notifications multi-canal existantes (DB + Socket.IO + e-mail + WhatsApp) et pattern `emailQueue.service` (retries exponentiels 30s/1m/2m/5m, 5 tentatives) | Le Copilot doit **réutiliser** ces canaux pour ses propres notifications (ex. : « résumé prêt », « suggestion en attente ») plutôt que d'en créer un quatrième. |
| `.env.example` a contenu des secrets réels (P0 du dossier d'architecture) | Les clés API des fournisseurs LLM sont **plus sensibles encore** (facturation à l'usage, fuite de données métier en cas de vol). La gestion des secrets IA est traitée comme prérequis bloquant, pas comme un risque secondaire (§9, §12). |
| `POST /notifications/send-email` sans middleware d'authentification (P0) | Rappel qu'un endpoint IA mal gardé est un vecteur d'exfiltration de données bien pire (un appel non authentifié à un endpoint de chat pourrait interroger le contexte métier d'un tiers) — chaque route IA est donc auditée en revue de sécurité avant merge (§11). |
| Duplication frontend (2× `ApiClient`, GetX + Provider en parallèle) | Le widget Copilot Flutter doit consommer **un seul** client API et une seule convention de gestion d'état ; le choix (GetX ou Provider) est une décision produit à prendre en Sprint 0 (§13.2), pas à dupliquer une troisième fois. |
| Pas de bus d'événements applicatif (événements diffusés de façon impérative, §5.6 du dossier) | L'indexation des données pour le RAG (§4.4) ne peut pas s'abonner à des événements qui n'existent pas : elle doit soit être déclenchée par des hooks explicites ajoutés dans les services existants, soit tourner en tâche planifiée (`cron`), au choix documenté en §8 Phase 4. |

---

## 3. Vision produit — cas d'usage du Copilot

Cas d'usage priorisés en MoSCoW, mappés aux modules métier existants (§11 du dossier d'architecture) et aux rôles (§3.1).

### 3.1 Must have (v1)

| Cas d'usage | Rôles concernés | Module(s) source de données |
|---|---|---|
| Répondre à des questions sur les KPI déjà exposés (« combien de projets en négociation ce mois-ci ? ») | user, commercial, admin-tier | Dashboard, Projects, Pipeline |
| Résumer un projet (historique d'actions, statut, prochaine relance) | Propriétaire du projet, admin-tier | Projects, Project-Actions, Project-Activities |
| Digest quotidien personnel (« vos relances du jour », « vos demandes en attente ») | Tous rôles | Commercial-Contacts, HR-Requests, Maintenance-Requests |
| Rédaction assistée (brouillon de réponse à une demande RH/maintenance, brouillon de message de relance) — **jamais envoyé sans validation humaine** | Gestionnaire RH, responsable maintenance, commercial | HR-Requests, Maintenance-Requests, Commercial-Contacts |

### 3.2 Should have (v2)

| Cas d'usage | Rôles concernés | Module(s) source |
|---|---|---|
| Suggestion de prochaine étape de pipeline argumentée | commercial, admin-tier | Pipeline, Project-Actions |
| Détection d'anomalies de saisie étendue (successeur de `aiDataCleaner.js`) sur Commercial-Contacts et Projects | admin-tier | Commercial-Contacts, Projects |
| Recherche sémantique inter-modules (« tous les projets PROMESH Ø8 en négociation avec SOTRACOB ») | admin-tier, commercial | Projects, Companies |
| Synthèse hebdomadaire des fiches POR PROMESH / Récupérables (non-conformités récurrentes) | responsable_logistique_achat, admin-tier | Por-Promesh, Recuperables |

### 3.3 Could have (v3+)

- Prévision simple de risque de perte de projet à partir de l'historique des étapes (modèle de scoring, pas un LLM).
- Génération assistée du PDF congé/sortie (proposition de justification pré-remplie).
- Assistant vocal (hors périmètre technique de ce plan).

### 3.4 Won't have (explicitement exclu)

- Décision automatique d'approbation/rejet sur `ArchiveRequest`, `HrRequest`, `MaintenanceRequest`.
- Modification directe de `Project.isArchived`, `PorPromesh.status`, ou de tout champ verrouillé après validation.
- Court-circuit des e-mails codés en dur (root admin, gestionnaire RH…) : le Copilot ne doit jamais notifier « à la place » de ces acteurs, seulement les assister.

---

## 4. Architecture cible

### 4.1 Principe directeur : le Copilot est un **module supplémentaire**, pas une réécriture

Le Copilot s'ajoute au diagramme de composants existant (§2.2 du dossier d'architecture) comme un nouveau composant métier backend au même niveau que Projets/RH/Maintenance, plus un widget frontend transverse. Il ne remplace ni ne modifie les modules existants — il les **consomme en lecture** via leurs repositories, et ne les **écrit** que via leurs services publics existants (jamais d'accès direct aux modèles Sequelize d'un autre module depuis le module IA).

```
Poste client (Flutter)
 └─ CopilotChatWidget ──uses──> CopilotService (Dio, 1 seul ApiClient) ──subscribes──> SocketService (existant)
        │ REST + SSE (stream de réponse)
        ▼
Backend Express (même processus, même port 4000)
 └─ moduleAccessGuard (existant, réutilisé tel quel)
     └─ /ai-copilot  (nouveau module en couches, style modules/*)
          ├─ controllers/  (chat, actions suggérées, digest)
          ├─ services/
          │    ├─ orchestrator.service     (boucle prompt → tool-use → réponse)
          │    ├─ llmGateway.service       (abstraction fournisseur LLM)
          │    ├─ contextBuilder.service   (assemble le contexte autorisé pour l'utilisateur courant)
          │    ├─ toolRegistry.service     (liste blanche des actions appelables, délègue aux services existants)
          │    ├─ guardrails.service       (filtrage PII, anti prompt-injection, quotas)
          │    └─ retrieval.service        (RAG — v2, cf. Phase 4)
          ├─ repositories/  (lecture des tables ai_* uniquement)
          ├─ jobs/          (worker in-process pour appels LLM asynchrones, cf. §4.3)
          └─ dto / validators (Joi, comme le reste des modules)
 └─ Modules métier existants (Projects, Pipeline, Commercial-Contacts, HR-Requests, …)
     — consommés en lecture par contextBuilder/retrieval via leurs repositories publics
     — consommés en écriture par toolRegistry via leurs services publics (jamais en direct)
 └─ Notification (DB+Socket.IO+e-mail) — réutilisé tel quel pour les notifications IA
 └─ emailQueue.service — réutilisé tel quel si le Copilot doit envoyer un e-mail (résumé, digest)

Services externes
 └─ Fournisseur LLM (API externe, hors dépôt) — nouveau, accédé uniquement via llmGateway.service
```

### 4.2 Où loger le Copilot dans l'AS-IS de déploiement

Le dossier d'architecture distingue clairement l'AS-IS (un seul processus Node, PostgreSQL local, stockage disque local, pas de Docker/Nginx/Redis) du TO-BE recommandé. Le Copilot v1 **doit fonctionner dans l'AS-IS actuel**, sans exiger de migration d'infrastructure préalable — sinon le projet IA devient dépendant d'un chantier d'infrastructure non planifié. Conséquences concrètes :

- Pas de file de messages externe (Kafka/RabbitMQ) : le traitement asynchrone des appels LLM est géré par une table `ai_jobs` + un worker in-process réveillé par `node-cron` (déjà une dépendance du projet), sur le modèle exact du pattern retry de `emailQueue.service`.
- Pas de cache Redis : le cache de contexte/réponses (si nécessaire pour les coûts) est géré en mémoire process avec TTL court, avec dégradation gracieuse (rien ne doit dépendre de la survie du cache entre deux redémarrages).
- Pas de vector store dédié (Pinecone/Weaviate) en v1 : le RAG initial (Phase 2, cas d'usage Must-have) s'appuie sur des requêtes SQL structurées classiques (le contexte KPI/projet est déjà structuré en base, pas besoin de recherche sémantique pour y répondre). Un vector store n'est introduit qu'en Phase 4 pour la recherche sémantique sur du texte libre (commentaires, notes POR PROMESH) — décision explicitement différée, cf. §8.

### 4.3 Traitement asynchrone sans file de messages

Pattern retenu (aligné sur `emailQueue.service` déjà connu de l'équipe) :

1. La requête chat crée une ligne `ai_jobs` (status=`pending`) et répond immédiatement avec un identifiant de job.
2. Un worker in-process (déclenché par un intervalle court, ou immédiatement via `setImmediate` après insertion) traite le job, appelle `llmGateway.service`, écrit la réponse.
3. Le frontend reçoit soit un flux SSE (si l'endpoint le supporte, réponse « streamée » comme un chat classique), soit une notification Socket.IO `ai-response-ready` (réutilisation du canal existant `emitToUser`) en repli si la connexion socket est coupée — même schéma de repli par sondage que les notifications existantes (§6.7 du dossier d'architecture).

### 4.4 Construction du contexte autorisé (`contextBuilder.service`)

Le point le plus sensible de l'architecture. Le contexte envoyé au LLM doit être **filtré par les mêmes règles de portée que le reste de l'application** avant de quitter le backend :

- Pour un `commercial` : uniquement ses `CommercialContact` (créés/assignés) et ses `Project` (`ownerId`), jamais l'ensemble de la base.
- Pour un `responsable_logistique_achat` : uniquement ses enregistrements `createdBy` sur Industrial-Records/Por-Promesh/Recuperables (portée « owner-scoped » identique à celle déjà documentée en §3.4 du dossier d'architecture).
- Pour un `admin-tier` : accès large, mais toujours au travers des repositories existants (pas de requête SQL brute écrite spécifiquement pour le Copilot en dehors des repositories déjà audités).

Règle de conception : **`contextBuilder.service` n'a le droit d'appeler que des fonctions de repository déjà utilisées par un contrôleur existant** (ou strictement équivalentes en portée). Cela garantit qu'aucune fuite de périmètre n'est introduite spécifiquement pour l'IA.

### 4.5 Le Copilot comme « utilisateur » du RBAC existant, jamais comme un rôle à part

Le Copilot n'introduit pas de nouveau rôle `role=ai`. Chaque appel s'exécute **au nom de l'utilisateur connecté** (son JWT, son `req.user`), avec les mêmes middlewares (`authRequired`, `requireRole`, policies) que n'importe quelle autre route. C'est ce qui permet de garantir, par construction, que le Copilot ne peut jamais voir ou faire plus que l'utilisateur qui l'interroge.

---

## 5. Composants à développer (catalogue)

### 5.1 Backend — nouveau module `modules/ai-copilot/`

| Composant | Rôle | Dépend de |
|---|---|---|
| `routes/ai.routes.js` | Expose `/ai-copilot/*` (chat, historique, digest, suggestions), monté après `moduleAccessGuard` comme tous les modules existants | authRequired, moduleAccessGuard (existants) |
| `controllers/chat.controller.js` | Reçoit un message utilisateur, crée un `ai_jobs`, retourne l'id de job / stream SSE | services/orchestrator |
| `controllers/digest.controller.js` | Endpoint déclenché par cron pour générer les digests personnels | services/orchestrator, services/contextBuilder |
| `controllers/suggestions.controller.js` | Liste/accepte/rejette les suggestions d'action en attente (jamais d'exécution auto) | repositories/ai_suggestions |
| `services/orchestrator.service.js` | Boucle principale : construit le prompt, appelle le LLM, interprète les appels d'outils, écrit la réponse | llmGateway, contextBuilder, toolRegistry, guardrails |
| `services/llmGateway.service.js` | Abstraction fournisseur LLM (modèle, clé API, timeout, retry, mesure de coût/tokens) — **le seul point du code qui connaît le fournisseur** | Config, secrets manager |
| `services/contextBuilder.service.js` | Assemble le contexte autorisé (cf. §4.4) | Repositories des modules existants (lecture seule) |
| `services/toolRegistry.service.js` | Liste blanche typée des actions que le LLM peut « proposer » (jamais exécuter directement) — ex. `draftRelanceMessage`, `summarizeProject`, `suggestNextStage` | Services publics des modules existants |
| `services/guardrails.service.js` | Redaction PII avant envoi au LLM, détection de prompt injection dans les données CRM injectées en contexte, application des quotas par utilisateur/rôle | Config |
| `services/retrieval.service.js` (Phase 4) | Recherche sémantique (vector store) sur contenu texte libre | Vector store (nouveau composant, cf. §8 Phase 4) |
| `jobs/aiJobWorker.js` | Worker in-process, pattern retry aligné sur `emailQueue.service` | node-cron (existant) |
| `repositories/*` | Accès aux tables `ai_*` uniquement | Sequelize (existant) |
| `dto/`, `validators/` | Schémas Joi, cohérents avec les autres modules (`hr-requests`, `pipeline`…) | Joi (existant) |

### 5.2 Backend — services transverses à étendre (pas à dupliquer)

| Service existant | Extension nécessaire |
|---|---|
| `notification.service` | Ajouter les types `ai_digest_ready`, `ai_suggestion_pending` au vocabulaire de `Notification.type` existant — pas de nouvelle table de notification |
| `emailQueue.service` | Réutilisation directe pour l'envoi des digests par e-mail (aucune modification de service, juste un nouveau type d'e-mail) |
| `aiDataCleaner.js` | Conservé tel quel en v1 ; **candidat à absorption** dans `guardrails.service`/`contextBuilder` en Phase 3 une fois le pattern IA générique en place (évite deux heuristiques « qualité de données » parallèles) |

### 5.3 Frontend — `Dash Master Toolkit/lib/`

| Composant | Rôle | Convention à respecter |
|---|---|---|
| `services/copilotService.dart` | Client HTTP dédié au Copilot | **Doit utiliser l'`ApiClient` unique retenu en Sprint 0** — pas une 3ᵉ instance Dio |
| `providers/copilotProvider.*` | État de la conversation (historique, statut de streaming) | Convention de gestion d'état unique retenue en Sprint 0 (GetX ou Provider, décision produit §13.2) |
| `widgets/copilot/CopilotChatWidget.dart` | Bulle de chat flottante, montée dans `AppShell` (accessible depuis tout écran métier réel, pas les écrans gabarit) | S'appuie sur `AuthService.userRole` existant pour n'afficher que les actions pertinentes au rôle |
| `widgets/copilot/CopilotSuggestionCard.dart` | Carte d'action suggérée avec bouton « Valider » / « Rejeter » explicite (jamais d'auto-exécution) | — |
| `screens/admin/CopilotAdminScreen.dart` | Écran admin : activer/désactiver le Copilot par rôle, consulter le journal d'audit IA, voir la consommation (tokens/coût) | Réservé admin-tier, même garde que les écrans d'administration existants |

### 5.4 Composants transverses nouveaux (ni backend module, ni frontend)

| Composant | Rôle |
|---|---|
| **Registre de prompts versionné** (`modules/ai-copilot/prompts/*.md` + métadonnées de version) | Chaque prompt système est versionné et testable indépendamment du code (cf. conventions §10.6) |
| **Jeu d'évaluation (golden set)** | Ensemble de questions/réponses de référence par cas d'usage (§3.1), utilisé pour détecter les régressions de prompt avant chaque déploiement |
| **Tableau de bord de coût/usage IA** | Vue agrégée (tokens, coût, latence, taux d'erreur) par rôle et par cas d'usage — alimente `CopilotAdminScreen` |

---

## 6. Modèle de données additionnel

Toutes les nouvelles tables suivent la convention des modules récents (RH, maintenance, archivage, POR PROMESH) : **UUID**, **contraintes FK physiques déclarées**, migrations versionnées via `sequelize-cli` — jamais de `sequelize.sync()`.

| Table | Objectif | FK physiques | Notes |
|---|---|---|---|
| `ai_conversations` | Une conversation Copilot par utilisateur (ou par contexte, ex. un projet) | `userId → users` (CASCADE) | `contextType` (`global`/`project`/`commercial_contact`), `contextId` nullable |
| `ai_messages` | Chaque message (utilisateur ou assistant), append-only | `conversationId → ai_conversations` (CASCADE) | Jamais de update/delete — même discipline que `CommercialContactStatusHistory` (§5.2 du dossier d'architecture) |
| `ai_jobs` | File d'attente asynchrone (cf. §4.3) | `messageId → ai_messages` (CASCADE), `userId → users` | `status` (pending/processing/done/failed), `attempts`, `maxAttempts` — même vocabulaire que `email_queue.status` |
| `ai_suggestions` | Actions proposées par le Copilot, en attente de validation humaine | `userId → users`, `sourceMessageId → ai_messages` | `type` (relance_draft, next_stage, hr_reply_draft…), `status` (pending/accepted/rejected), `payload` JSONB |
| `ai_audit_log` | Journal immuable de tout appel LLM (prompt envoyé — après redaction PII —, réponse, contexte source, coût) | `userId → users` | Append-only, rétention définie en §12 ; base du golden set et des audits sécurité |
| `ai_usage_quota` | Compteurs de consommation par utilisateur/jour pour l'application des quotas | `userId → users` | Purge périodique (cron) |

**Constat structurel à ne pas reproduire** : le dossier d'architecture note que `notifications` porte 7 pointeurs polymorphes nullables sans contrainte. Le module IA n'introduit **aucun pointeur polymorphe non contraint** — `ai_conversations.contextId` est accompagné d'un `contextType` mais reste explicitement documenté comme dette acceptée uniquement si une table de contexte unique s'avère impraticable ; sinon, préférer une table de liaison dédiée par type de contexte.

---

## 7. Dépendances entre modules IA

```
                        ┌─────────────────────┐
                        │  guardrails.service  │◄── Config (quotas, listes PII)
                        └──────────┬───────────┘
                                   │ valide entrée/sortie
                                   ▼
┌────────────────┐        ┌───────────────────┐        ┌─────────────────────┐
│ contextBuilder  │──────► │ orchestrator.svc   │◄──────│ toolRegistry.service │
│ (lecture seule) │        │ (boucle principale) │        │ (actions proposées)  │
└───────┬─────────┘        └─────────┬──────────┘        └──────────┬───────────┘
        │ lit via repos existants     │ appelle                     │ délègue à
        ▼                             ▼                              ▼
┌─────────────────────────┐   ┌───────────────┐          ┌───────────────────────────┐
│ Repositories des modules │   │ llmGateway.svc │          │ Services publics existants │
│ métier existants (RO)    │   │ (fournisseur)   │          │ (Projects, HR-Requests,…)  │
└─────────────────────────┘   └───────┬─────────┘          └───────────────────────────┘
                                       │
                                       ▼
                              Fournisseur LLM externe

┌───────────────┐     ┌───────────────┐     ┌────────────────────┐
│ aiJobWorker    │────►│ ai_jobs (DB)   │◄────│ chat.controller     │
│ (asynchrone)   │     └───────────────┘     └────────────────────┘

┌────────────────────┐     ┌───────────────────────┐
│ retrieval.service   │────►│ Vector store (Phase 4) │
│ (Phase 4, différé)  │     └───────────────────────┘

Frontend :
CopilotChatWidget ──► copilotProvider ──► copilotService (ApiClient unique) ──► /ai-copilot/*
        
        
        
                                     └──► SocketService (existant, événement ai-response-ready)
```

### 7.1 Matrice de dépendances (lecture : la ligne dépend de la colonne)

| Dépend de → | guardrails | contextBuilder | llmGateway | toolRegistry | orchestrator | Modules métier existants | ai_jobs/worker |
|---|---|---|---|---|---|---|---|
| **orchestrator** | ✔ | ✔ | ✔ | ✔ | — | — (indirect via contextBuilder/toolRegistry) | — |
| **contextBuilder** | — | — | — | — | — | ✔ (repositories, lecture) | — |
| **toolRegistry** | — | — | — | — | — | ✔ (services publics, écriture contrôlée) | — |
| **chat.controller** | — | — | — | — | ✔ | — | ✔ |
| **digest.controller** | — | ✔ | — | — | ✔ | — | ✔ |
| **retrieval (Phase 4)** | ✔ | ✔ | — | — | — | ✔ (indexation) | — |
| **CopilotChatWidget (Flutter)** | — | — | — | — | — | — (via API uniquement) | — |

**Conséquence de planification** : `contextBuilder.service`, `guardrails.service` et `llmGateway.service` sont les trois seuls composants sans dépendance montante interne au module IA — ce sont eux qui doivent être livrés et testés **en premier** (Sprint 1), puisque tout le reste en dépend directement ou indirectement.

---

## 8. Roadmap technique par sprints

Découpage en **phases fonctionnelles**, chacune subdivisée en sprints de 2 semaines (indicatif — à ajuster à la capacité réelle de l'équipe). Chaque phase ne démarre que si la précédente a validé ses critères (§11).

### Phase 0 — Cadrage & prérequis sécurité (Sprint 0, 2 semaines)

Objectif : lever les blocages identifiés dans le dossier d'architecture qui deviendraient **plus graves** une fois l'IA introduite, et prendre les décisions produit non tranchées par ce document.

- Rotation et purge des secrets exposés dans `.env.example` (P0 existant, prérequis avant d'ajouter des clés API LLM au même mécanisme de configuration).
- Correction de l'endpoint `POST /notifications/send-email` non authentifié (P0 existant) — un module IA additionnel ne doit pas s'ajouter sur une base dont la garde d'authentification est déjà connue pour avoir des trous.
- Décision produit : fournisseur LLM retenu (cf. §13.1), budget/quotas cibles, politique de rétention des conversations (§12).
- Décision technique frontend : GetX **ou** Provider pour le Copilot (§13.2) — tranchée avant d'écrire le premier widget.
- Mise en place du feature flag global `AI_COPILOT_ENABLED` (même pattern que `AUTO_EMAIL_JOBS_ENABLED`/`MFA_ENABLED` déjà utilisés dans le projet) : le Copilot doit pouvoir être coupé instantanément sans déploiement.

### Phase 1 — Fondations backend (Sprints 1–2)

- `llmGateway.service` (intégration fournisseur, gestion clé API via variables d'environnement **hors** `.env.example` versionné, retry/timeout, mesure tokens/coût).
- `guardrails.service` v1 (redaction PII de base, quotas par utilisateur, filtrage de longueur de contexte).
- `contextBuilder.service` v1, limité au cas d'usage « KPI & résumé projet » (Must-have §3.1), branché exclusivement sur les repositories déjà existants de Projects/Dashboard.
- Migrations des tables `ai_conversations`, `ai_messages`, `ai_jobs`, `ai_audit_log` avec FK physiques.
- `aiJobWorker` (traitement asynchrone in-process, pattern `emailQueue.service`).
- Aucune interface utilisateur en Phase 1 : validation via tests automatisés + appels API directs (Postman/Insomnia) par l'équipe technique et le PO.

### Phase 2 — Copilot conversationnel en lecture seule (Sprints 3–4)

- Endpoints `/ai-copilot/chat` (question/réponse) et `/ai-copilot/digest` (résumé personnel), pour les cas d'usage Must-have §3.1.
- `orchestrator.service` complet pour les questions de type Q&A sur données déjà structurées (pas encore de tool-use en écriture).
- Frontend : `CopilotChatWidget` v1 (lecture seule, pas de suggestions actionnables), intégré dans `AppShell`, respectant les rôles.
- Golden set v1 (≥ 30 questions/réponses de référence couvrant les 4 cas Must-have) et premiers tests de non-régression de prompt.

### Phase 3 — Suggestions actionnables avec validation humaine (Sprints 5–6)

- `toolRegistry.service` : premiers outils en écriture proposée (brouillon de relance, brouillon de réponse RH/maintenance) — toujours via les services publics existants, jamais d'écriture directe.
- Table `ai_suggestions` + endpoints accept/reject.
- `CopilotSuggestionCard` côté Flutter, avec flux de validation explicite.
- Notifications IA (`ai_suggestion_pending`) branchées sur `notification.service` existant (DB+Socket.IO+e-mail).
- Absorption de `aiDataCleaner.js` dans `guardrails.service`/`contextBuilder` (cf. §5.2) — décision à confirmer selon la complexité réelle observée en Phase 2.

### Phase 4 — Recherche sémantique (RAG) sur contenu libre (Sprints 7–9)

- Introduction du vector store (composant nouveau, à sélectionner en Sprint 7 — cf. questions ouvertes §13.3) pour indexer le contenu texte libre : commentaires de projet (`ProjectComment`), descriptions de non-conformité (`PorPromeshNonConformite`), messages d'archivage (`ArchiveRequestMessage`).
- Mécanisme d'indexation : en l'absence de bus d'événements applicatif (§2 constat), deux options à trancher en Sprint 7 : (a) hooks explicites ajoutés dans les services concernés (`services.create()/update()` appelle un indexeur), ou (b) tâche planifiée d'indexation incrémentale (`cron`, sur le modèle des jobs existants dans `src/cron/`). Le choix (a) est recommandé pour la fraîcheur des résultats, (b) en filet de sécurité de rattrapage.
- `retrieval.service` + extension de `contextBuilder.service` pour les cas d'usage Should-have §3.2 (recherche sémantique, synthèse de non-conformités récurrentes).

### Phase 5 — Proactivité & industrialisation (Sprints 10+)

- Digests automatiques programmés (cron) par rôle.
- Tableau de bord de coût/usage IA (`CopilotAdminScreen` complet).
- Durcissement des guardrails (détection de prompt injection avancée, cf. §9), audit de sécurité dédié avant généralisation à tous les rôles.
- Réévaluation de la cible d'architecture (§4.2) : si le volume d'appels LLM ou la charge du worker in-process dégrade les temps de réponse du reste de l'application, réexaminer l'introduction d'un vrai processus worker séparé — décision alignée sur la même logique que la cible TO-BE (Nginx/cluster/Redis) déjà documentée comme non urgente dans le dossier d'architecture (§2.3, §14.2-P3).

---

## 9. Risques techniques

Registre priorisé (sévérité × probabilité), avec mitigation concrète rattachée à un composant du plan.

| # | Risque | Sévérité | Mitigation planifiée |
|---|---|---|---|
| R1 | **Hallucination** : le Copilot affirme un chiffre ou un statut métier faux (ex. mauvais total de KPI) | Élevée | Cas d'usage Must-have limités à des données structurées récupérées par requête directe (pas de génération libre de chiffres) ; golden set (§8 Phase 2) exécuté avant chaque déploiement de prompt |
| R2 | **Fuite de données vers le fournisseur LLM externe** (données commerciales, RH, industrielles envoyées à un tiers) | Élevée | `guardrails.service` (redaction PII) obligatoire avant tout envoi ; `contextBuilder.service` limité strictement à la portée déjà autorisée pour l'utilisateur ; clause contractuelle du fournisseur retenu vérifiée en Sprint 0 (non-réutilisation des données pour l'entraînement) |
| R3 | **Prompt injection via données CRM** : un commentaire de projet ou une description de non-conformité contenant une instruction malveillante manipule le comportement du Copilot | Moyenne-Élevée | `guardrails.service` sépare strictement « instructions système » et « données de contexte » (encodage/délimitation), aucune donnée injectée en contexte n'est interprétée comme une instruction ; testé explicitement en Phase 4 avant l'ouverture du RAG sur contenu libre |
| R4 | **Contournement du RBAC** via le Copilot (un utilisateur obtient, via une reformulation habile, une information hors de sa portée) | Élevée | Le filtrage se fait **avant** l'appel LLM (au niveau `contextBuilder`, jamais en aval sur la réponse) — le modèle ne reçoit jamais de données hors périmètre, donc ne peut structurellement pas les répéter |
| R5 | **Blocage de la boucle d'événements Node** par des appels LLM synchrones dans le seul processus applicatif existant | Moyenne | Traitement 100% asynchrone via `ai_jobs`/`aiJobWorker` (§4.3) ; aucun appel LLM synchrone dans le chemin d'une requête HTTP bloquante |
| R6 | **Dérive de coût** (facturation à l'usage du fournisseur LLM) non maîtrisée | Moyenne | `ai_usage_quota` + quotas durs par utilisateur/rôle dès Phase 1 ; tableau de bord de coût dès Phase 5, alerte avant Phase 5 si besoin |
| R7 | **Duplication de la dette technique déjà identifiée** (2 styles de routage, RBAC hybride, doublons frontend) reproduite dans le module IA | Moyenne | Conventions strictes §10 ; revue de code obligatoire vérifiant l'alignement avec `modules/*` (jamais `routes/*` legacy) |
| R8 | **Vendor lock-in** sur un fournisseur LLM unique | Faible-Moyenne | `llmGateway.service` comme unique point de couplage au fournisseur — changement de fournisseur limité à ce service |
| R9 | **Dégradation de l'expérience existante** (notifications, Socket.IO) par surcharge du canal partagé | Faible | Réutilisation des canaux existants mais avec un type d'événement dédié (`ai-response-ready`) filtrable côté client, pas de flux à haute fréquence |
| R10 | **Décisions métier prises sur suggestion IA sans revue suffisante** (dérive d'usage malgré le garde-fou technique « validation humaine ») | Moyenne | Traçabilité complète dans `ai_suggestions`/`ai_audit_log` (qui a accepté quoi) ; formation/consignes utilisateurs hors périmètre technique mais mentionnée comme dépendance produit |
| R11 | **Base legacy sans FK physique** (users, projects…) rendant certaines requêtes de `contextBuilder` fragiles en cas d'incohérence de données orphelines | Faible-Moyenne | `contextBuilder` ne fait que réutiliser des repositories déjà tolérants à ces incohérences (aucune nouvelle hypothèse d'intégrité ajoutée) |

---

## 10. Conventions de développement

### 10.1 Structure de code

- Le module IA vit exclusivement sous `Backend Master/src/modules/ai-copilot/`, avec la structure `routes/ controllers/ services/ repositories/ dto/ validators/` — copie conforme du pattern déjà utilisé par `hr-requests`, `maintenance-requests`, `por-promesh`.
- Aucun accès direct à un modèle Sequelize d'un autre module métier depuis `ai-copilot` : uniquement via les repositories/services publics déjà exposés (import explicite, jamais de requête SQL brute croisée).
- Nommage des tables : préfixe `ai_` systématique, colonnes en `camelCase` côté Sequelize / `snake_case` en base (cohérent avec le reste du schéma).

### 10.2 Migrations

- Une migration = un changement, versionnée `sequelize-cli`, jamais de `sequelize.sync()`.
- Toute nouvelle table déclare ses FK physiques dès la création (pas de correctif différé comme observé sur `por_promesh_non_conformites`).
- Toute colonne `status`/`type` de type ENUM applicatif documente ses valeurs autorisées dans le modèle Sequelize et dans la validation Joi, pour éviter la classe de bug déjà rencontrée sur `project_actions.typeAction_legacy` (ENUM Postgres plus restrictif que le modèle).

### 10.3 Gestion des secrets

- Aucune clé API LLM dans `.env.example` (même en placeholder trompeur) : `.env.example` ne contient que des noms de variables avec valeur vide ou commentaire explicite `# à renseigner`.
- Clés API LLM chargées via variables d'environnement dédiées (`AI_LLM_API_KEY`, `AI_LLM_PROVIDER`, `AI_LLM_MODEL`), jamais committées, rotation documentée dans le runbook opérationnel (hors périmètre de ce document).

### 10.4 Feature flags

- `AI_COPILOT_ENABLED` (global) — même emplacement de config que `AUTO_EMAIL_JOBS_ENABLED`/`MFA_ENABLED`.
- `AI_COPILOT_ROLES_ALLOWED` (liste de rôles autorisés) pour permettre un rollout progressif rôle par rôle sans redéploiement de code.

### 10.5 Journalisation & audit

- Toute interaction (prompt → réponse) est journalisée dans `ai_audit_log`, en écriture seule (même discipline que `CommercialContactStatusHistory`, `ProjectActivity`).
- Le contenu journalisé est **post-redaction** (jamais de PII brute en base d'audit) — la redaction elle-même (avant journalisation) doit être testée unitairement.

### 10.6 Prompts comme artefacts versionnés

- Chaque prompt système vit dans un fichier dédié (`modules/ai-copilot/prompts/*.md`) avec un numéro de version en en-tête.
- Toute modification de prompt en production repasse par le golden set (§8 Phase 2) avant merge — traité comme un changement de comportement fonctionnel, pas comme une simple modification de texte.

### 10.7 Tests

- Tests unitaires pour `guardrails.service` (redaction PII, anti prompt-injection) et `contextBuilder.service` (portée par rôle) — priorité absolue, ce sont les composants de sécurité.
- Tests d'intégration avec fournisseur LLM **mocké** (pas d'appel réseau réel dans la CI) pour `orchestrator.service`.
- Le golden set (§8 Phase 2) est exécuté en pipeline avant tout déploiement touchant un prompt ou `contextBuilder`.
- Réutilisation de `jest`/`supertest` déjà présents dans `devDependencies` — pas de nouveau framework de test introduit.

### 10.8 API

- Toutes les routes sous `/ai-copilot/*`, versionnées dès le départ si l'équipe anticipe une évolution de contrat (`/ai-copilot/v1/*`) — à trancher en Sprint 0 selon la pratique déjà en vigueur ou non ailleurs dans le projet (le référentiel API actuel n'est pas versionné : décision à harmoniser, pas à imposer unilatéralement dans un seul module).
- Réponses de chat : privilégier un flux de type SSE (`text/event-stream`) pour l'expérience de streaming, avec repli sur réponse JSON complète si le client ne supporte pas le flux (cohérent avec le repli déjà pratiqué pour les notifications Socket.IO → sondage HTTP).

---

## 11. Critères de validation par sprint (Definition of Done)

### Phase 0 — Sprint 0
- [ ] Secrets `.env.example` régénérés et purgés de l'historique Git (validation par le responsable sécurité).
- [ ] `POST /notifications/send-email` protégé par `authRequired`.
- [ ] Fournisseur LLM choisi, contrat/DPA vérifié (pas de réutilisation des données pour l'entraînement).
- [ ] Convention frontend (GetX vs Provider) actée par écrit et communiquée à l'équipe.
- [ ] `AI_COPILOT_ENABLED=false` par défaut, testé en environnement de dev (le Copilot est invisible quand désactivé).

### Phase 1 — Sprints 1–2
- [ ] `llmGateway.service` répond correctement à un appel de test, avec gestion d'erreur/timeout couverte par des tests.
- [ ] `guardrails.service` : 100% des cas de test PII du golden set de redaction passent.
- [ ] `contextBuilder.service` retourne un contexte strictement borné à la portée attendue pour 3 profils de test (`user`, `commercial`, `admin`) — vérifié par tests d'intégration explicites comparant le contexte généré à la portée attendue.
- [ ] Migrations `ai_*` appliquées avec succès sur une base de test, FK physiques vérifiées par requête `information_schema`.
- [ ] `aiJobWorker` traite un job de bout en bout (création → traitement → statut `done`) en environnement de test, y compris le chemin d'échec/retry.

### Phase 2 — Sprints 3–4
- [ ] Golden set v1 (≥ 30 questions) exécuté avec un taux de réponses correctes/pertinentes ≥ seuil fixé par le PO avant démarrage (à documenter, ex. 90%).
- [ ] `CopilotChatWidget` affiche une réponse pour chacun des 4 cas d'usage Must-have, testé manuellement par rôle (`user`, `commercial`, `admin-tier`).
- [ ] Aucune requête LLM synchrone détectée dans le chemin d'une route HTTP (vérifié par revue de code + test de charge basique ne montrant pas de dégradation du reste de l'API pendant un appel Copilot).
- [ ] Démonstration croisée : un `commercial` ne peut pas obtenir, via le Copilot, une donnée hors de sa portée (test de contournement délibéré, documenté).

### Phase 3 — Sprints 5–6
- [ ] Chaque type de suggestion (`relance_draft`, `hr_reply_draft`, …) passe par un accept/reject explicite, aucune action n'est exécutée sans ce passage (vérifié par test d'intégration : une suggestion `pending` n'a aucun effet de bord observable en base tant qu'elle n'est pas `accepted`).
- [ ] Notifications IA visibles dans le centre de notifications existant, sur les 3 canaux (DB, Socket.IO, e-mail) pour au moins un scénario de bout en bout.
- [ ] Revue de sécurité dédiée sur `toolRegistry.service` (aucun outil ne permet de dépasser les permissions du service public sous-jacent).

### Phase 4 — Sprints 7–9
- [ ] Vector store choisi et justifié (critères : coût, hébergement compatible avec les contraintes de données définies en Sprint 0, effort d'intégration) — documenté en ADR.
- [ ] Indexation testée sur au moins 2 types de contenu libre (`ProjectComment`, `PorPromeshNonConformite`) avec vérification que la portée d'accès (owner-scoped) est respectée aussi en recherche sémantique, pas seulement en lecture structurée.
- [ ] Test explicite de prompt injection via un commentaire de projet contenant une instruction — le Copilot ne doit pas exécuter l'instruction injectée.

### Phase 5 — Sprints 10+
- [ ] Tableau de bord de coût/usage opérationnel, données cohérentes avec la facturation réelle du fournisseur (écart < seuil défini par le PO).
- [ ] Audit de sécurité externe ou revue formalisée réalisée avant ouverture du Copilot à l'ensemble des rôles.
- [ ] Décision documentée sur le maintien ou l'évolution du worker in-process selon les métriques de charge observées.

---

## 12. Gouvernance, sécurité & conformité données

- **Rétention** : définir en Sprint 0 la durée de conservation de `ai_conversations`/`ai_messages`/`ai_audit_log` (proposition de départ : 90 jours pour les conversations, conservation plus longue pour `ai_audit_log` à des fins d'audit, à confirmer avec les exigences de conformité applicables à CBI Tunisia).
- **Droit à l'effacement** : si un utilisateur est désactivé (`isActive=false`, cf. §8.6 du dossier d'architecture), ses conversations IA doivent suivre la même politique que le reste de ses données personnelles — décision à harmoniser avec la politique de rétention générale du CRM (non documentée à ce jour dans le dossier d'architecture existant — question ouverte, cf. §13.3).
- **Séparation des rôles pour l'administration IA** : l'écran `CopilotAdminScreen` (§5.3) suit la même garde que les autres écrans d'administration (`admin-tier`), sans créer de nouvelle catégorie d'acteur codée en dur — cohérent avec la recommandation P1 du dossier d'architecture de remplacer, à terme, les e-mails codés en dur par une table de délégation.
- **Auditabilité** : chaque suggestion acceptée doit être traçable jusqu'à l'utilisateur qui l'a validée et à l'action métier réelle qu'elle a déclenchée dans le module cible (ex. la relance créée porte une référence à la suggestion d'origine).

---

## 13. Annexes

### 13.1 Glossaire spécifique au Copilot

| Terme | Définition |
|---|---|
| LLM Gateway | Service d'abstraction qui isole tout le reste du code du fournisseur LLM concret utilisé |
| Guardrails | Ensemble de contrôles (redaction PII, anti prompt-injection, quotas) appliqués avant/après chaque appel LLM |
| RAG (Retrieval-Augmented Generation) | Technique consistant à injecter dans le prompt des données récupérées dynamiquement (structurées ou via recherche sémantique) plutôt que de compter sur la mémoire du modèle |
| Tool-use / Function calling | Mécanisme par lequel le LLM peut demander l'exécution d'une action prédéfinie (jamais exécutée sans validation humaine en v1 de ce projet) |
| Golden set | Jeu de questions/réponses de référence utilisé pour détecter les régressions de comportement du Copilot |
| Prompt injection | Attaque consistant à faire passer, via des données de contexte, des instructions que le modèle exécute à tort comme si elles venaient de l'opérateur |
| Owner-scoped | Motif d'autorisation déjà existant dans le CRM (portée limitée aux enregistrements `createdBy` d'un utilisateur) que le Copilot doit respecter à l'identique |

### 13.2 Décisions produit à trancher avant Sprint 1

Ces points ne sont pas des détails d'implémentation : ils changent des choix d'architecture décrits ci-dessus et doivent être arbitrés par le binôme produit/technique avant le démarrage de la Phase 1.

1. **Fournisseur LLM retenu** (impacte `llmGateway.service`, le contrat de traitement des données, le budget).
2. **Convention de gestion d'état frontend** (GetX ou Provider) pour le module Copilot — occasion de trancher une dette déjà identifiée plutôt que de l'aggraver.
3. **Politique de rétention des données conversationnelles** (§12).
4. **Seuil de qualité du golden set** en dessous duquel un déploiement de prompt est bloqué.
5. **Budget/quota IA cible** par rôle (nombre de requêtes/jour, coût mensuel plafond).

### 13.3 Questions ouvertes (non tranchées par ce document)

- Le vector store de Phase 4 doit-il être hébergé (SaaS) ou auto-hébergé, compte tenu de l'absence actuelle de toute infrastructure conteneurisée dans le projet (§2.3 du dossier d'architecture) ? Cette question conditionne si la Phase 4 nécessite, ou non, un chantier d'infrastructure préalable.
- La politique de rétention générale des données personnelles du CRM (hors IA) n'est pas documentée dans le dossier d'architecture existant — un alignement explicite est nécessaire avant de fixer la politique de rétention des données IA (§12).
- Faut-il, en Phase 5, réévaluer la recommandation P1 du dossier d'architecture (remplacement des e-mails codés en dur par une table de délégation) **avant** de généraliser le Copilot à ces acteurs spéciaux (root admin, gestionnaire RH, responsable maintenance), pour éviter que le module IA ne finisse par dépendre lui aussi de ces constantes fragiles ?
- Versionnage de l'API REST globale du CRM (actuellement non versionnée) : le module IA doit-il ouvrir la voie (`/ai-copilot/v1/*`) ou rester cohérent avec l'absence de versionnage constatée ailleurs (§10.8) ?

---

*Fin du document. Ce plan est un point de départ de cadrage ; il doit être revu et amendé collectivement avant le lancement de la Phase 1, et tenu à jour à chaque changement de décision listé en §13.2.*
