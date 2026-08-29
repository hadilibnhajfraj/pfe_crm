# CRM Assistant — le premier Agent métier du Copilot

Ce document décrit le premier Agent métier construit sur l'infrastructure IA : un assistant qui aide les utilisateurs à **utiliser le CRM** (quels champs remplir, quels boutons cliquer, quelles erreurs surviennent et comment les résoudre) — distinct des 11 autres Agents, qui répondent à des questions sur les **données** du CRM. Point d'entrée : `agents/crmAssistantAgent.js`, base de connaissances : `docs/user-guide/`.

## Ce qui existait déjà, ce qui a été construit

L'infrastructure entière (RAG, `IntentDetector`, `AgentRouter`, `ResponseBuilder`, l'anti-hallucination déjà posée dans `RESPONSE_PROMPTS.md`) était déjà construite avant cette passe — un `SearchAgent` générique existait même déjà pour l'intention `documentation_question`. Ce qui manquait réellement, et ce que cette passe a construit :

1. **Une vraie base de connaissances produit** (`docs/user-guide/`, 6 fichiers) — avant cette passe, la documentation indexée par le RAG (`docs/audit/`, `docs/performance/`, `docs/security/`, `AI-Business-Copilot/`, `CRM_Architecture_Complète.pdf`) décrivait l'architecture technique et les audits, jamais "comment cliquer sur quoi à l'écran".
2. **Un Agent avec une identité et un prompt système dédiés** (`crmAssistantAgent.js`) — orienté explicitement vers le guidage étape par étape, pas la recherche documentaire générique.
3. Le câblage : `agents/manifest.js` enregistre désormais `CrmAssistantAgent` (pas `SearchAgent`) pour l'intention `documentation_question` — voir "Pourquoi remplacer SearchAgent" plus bas.

## La garantie "ne jamais inventer une réponse" — d'où elle vient réellement

Trois couches indépendantes, pas une simple promesse dans le prompt :

1. **Architecturale** — `CrmAssistantAgent` n'a AUCUN Tool autorisé (`allowedToolNames: []`) et répond exclusivement via `qaChain`, qui lui-même ne lit QUE ce que `RagContextBuilder`/`IRetriever` ont récupéré. `SourceGuard` (`rag/sourceGuard.js`) interdit structurellement l'indexation de `src/models`/`src/modules`/`src/routes`/`src/services` — ce qui EST indexé est nécessairement de la documentation produit, jamais une donnée client réelle. Vérifié mécaniquement par `test/ai.rag.policy.test.js` et `test/ai.agents.policy.test.js`.
2. **Prompt** — le prompt système (`SYSTEM_PROMPT`, voir `crmAssistantAgent.js`) et les instructions RAG déjà existantes dans `qaChain.js` demandent explicitement de dire "je ne trouve pas cette information dans la documentation" plutôt que de deviner, et de citer les sources par numéro.
3. **Contenu vérifié, pas halluciné, à la source** — chaque champ, bouton et message d'erreur documenté dans `docs/user-guide/` a été lu directement dans le vrai code (Flutter `Dash Master Toolkit/lib/`, routes/modèles `Backend Master/src/`), jamais deviné ou extrapolé — voir "Méthodologie" plus bas.

## La base de connaissances (`docs/user-guide/`)

| Fichier | Parcours couvert |
|---|---|
| `00-vue-ensemble-des-modules.md` | Tous les modules du CRM, en aperçu (objectif, écrans principaux, permissions) |
| `01-creer-un-projet.md` | Créer un projet — assistant en 5 étapes (Général/Détails/Contacts/Localisation/Action) |
| `02-creer-un-client.md` | Créer un client (contact commercial) |
| `03-envoyer-un-devis.md` | Envoyer un devis (upload + publication) |
| `04-creer-une-intervention.md` | Créer une intervention (demande de maintenance) |
| `05-modifier-une-opportunite.md` | Modifier une opportunité (étape du pipeline commercial d'un contact) |

Chaque guide des 5 parcours suit la même structure demandée : objectif de l'écran, chaque champ (avec son caractère obligatoire ou non, tel que réellement appliqué), chaque bouton, les actions possibles après l'action, les erreurs possibles (message exact affiché, cause, solution), et des bonnes pratiques dérivées de ce qui a été observé dans le vrai code (pas des conseils génériques).

Déjà dans les racines RAG par défaut (`rag/reindex.js::DEFAULT_CORPUS_ROOTS` indexe tout `docs/`) — aucun câblage supplémentaire n'a été nécessaire pour que ce contenu soit interrogeable.

## Méthodologie — comment le contenu a été vérifié, pas inventé

Pour chacun des 5 parcours, DEUX sources croisées, jamais une seule :

1. **Le code Flutter réel** (`Dash Master Toolkit/lib/`) — les écrans effectivement montrés à l'utilisateur : `lib/forms/view/project_form_screen.dart` + `lib/forms/view/sections/*.dart` (assistant en 5 étapes du formulaire projet), `lib/application/users/view/commercial_contact_create_screen.dart` + `commercial_contact_list_getx_screen.dart` (création/édition d'un contact commercial), `lib/forms/view/devis_upload_screen.dart` (upload de devis), `lib/forms/view/maintenance_request_dialog.dart` (demande de maintenance) — libellés de champs, textes de boutons, messages de validation lus directement dans le code source, jamais supposés.
2. **Le code serveur réel** (`Backend Master/src/`) — la validation qui s'applique réellement : `src/routes/projects.routes.js::validatePayload()`, `src/routes/commercial_contacts.routes.js` (POST `/`, PUT `/:id`), `src/routes/projects.routes.js` (POST/PUT `/:id/devis`), `src/models/MaintenanceRequest.js` + `maintenanceRequest.controller.js`, `src/models/CommercialContact.js` (le champ `pipelineStage`, l'ENUM des valeurs acceptées).

## Une vraie incohérence découverte, documentée honnêtement (pas corrigée dans cette passe)

En croisant les deux sources pour "modifier une opportunité" : l'écran Flutter propose "Plan technique", "Échantillonnage" et "Relance" dans la liste déroulante de l'étape du pipeline d'un contact commercial, mais le modèle de données serveur (`CommercialContact.pipelineStage`, un `ENUM` PostgreSQL) n'accepte que `Prospect`, `Contacté`, `Visite`, `Devis envoyé`, `Negociation`, `Gagné`, `Perdu` — ces 3 valeurs de l'écran ne font PAS partie de l'ENUM et provoqueraient probablement une erreur serveur si elles étaient effectivement soumises. Documenté explicitement dans `docs/user-guide/05-modifier-une-opportunite.md` ("⚠️ Point d'attention réel") plutôt que silencieusement corrigé ou ignoré — corriger le code Flutter/le modèle de données est un chantier séparé, hors périmètre de cette passe (qui construit un Agent documentaire, pas un correctif produit), mais mérite d'être signalé à l'équipe qui maintient l'application.

## Pourquoi remplacer `SearchAgent` plutôt que coexister

`SearchAgent` (`agents/searchAgent.js`, code conservé mais retiré de `agents/manifest.js`) et `CrmAssistantAgent` visent tous deux l'intention `documentation_question` — deux Agents ne peuvent pas se partager la même intention sans que l'un des deux ne devienne du code mort (`AgentRegistry.findHandler()` choisit toujours le premier `canHandle()` vrai). `CrmAssistantAgent` est un vrai remplacement fonctionnel : mêmes Tools (aucun), même intention, même mécanisme RAG — seuls le prompt système (orienté guidage produit plutôt que recherche documentaire générique) et le contenu indexé (`docs/user-guide/`, en plus de ce qui existait déjà) changent.

## Ce qui n'a pas été fait (délibérément)

- **Couverture superficielle des modules au-delà des 5 parcours demandés** — `00-vue-ensemble-des-modules.md` couvre tous les autres modules (RH, Industriel, POR PROMESH, Dashboard, Utilisateurs, Notifications, Pipeline, Automatisation) mais en aperçu (objectif/écrans principaux/permissions), pas champ par champ comme les 5 guides détaillés — un travail réel mais délibérément mis à l'échelle du périmètre demandé.
- **L'incohérence "Plan technique/Échantillonnage/Relance"** (voir plus haut) n'a pas été corrigée dans le code Flutter/backend — seulement documentée.
- **Aucun contenu en anglais** — l'écran Flutter est partiellement en anglais (ex. "Project Name", "Save Contact"), mais toute la base de connaissances est rédigée en français, conformément à l'exigence "répond en français" ; les libellés anglais réels de l'écran sont cités tels quels (entre guillemets) pour que l'utilisateur reconnaisse ce qu'il voit à l'écran.

## Tests

- `test/ai.agents.crmAssistantAgent.test.js` : identité (nom, intention, aucune restriction de rôle, aucun Tool autorisé), vérifie littéralement que le prompt système satisfait chacune des exigences demandées (modules/écrans/boutons/champs/workflows/permissions/français/simplicité/étape par étape/jamais inventer), ne délègue jamais à un Tool même disponible, dégrade gracieusement si le RAG échoue.
- `test/ai.rag.crmAssistantKnowledgeBase.test.js` : ingestion réelle des 7 guides (aucune erreur, au moins un chunk chacun), et pour CHACUN des 5 parcours explicitement demandés, le VRAI pipeline de récupération (`HashingEmbeddingProvider` + `LexicalOverlapReranker`, aucun mock) retrouve le bon guide en première position — prouve que le contenu réel est retrouvable, pas seulement présent.
- `test/ai.agents.manifest.test.js`/`test/ai.agents.specialized.test.js`/`test/ai.agents.policy.test.js` : mis à jour pour refléter `crm_assistant_agent` comme gestionnaire de `documentation_question` (remplace `search_agent`).
- Les scénarios "documentation_question" du corpus de validation (`test/fixtures/copilotValidationScenarios.js`, voir `COPILOT_VALIDATION.md`) pointent maintenant vers `crm_assistant_agent`.
