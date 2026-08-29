# `src/ai` — Kernel du AI Business Copilot

Contrats (ports) + adaptateurs génériques sans logique métier, **plus un serveur MCP complet** exposant 73 capacités CRM (lecture et écriture) sur 11 modules métier exclusivement via les services existants, **plus un système RAG complet** (ingestion → chunking → embeddings → vector store → retriever → reranking → citations) qui, à l'inverse, n'a le droit de lire que de la documentation — jamais les données métier du CRM, **plus une intégration LangChain.js** (Chains, Tool Calling, Planner, Router, Workflow Engine, Context Builder) qui compose les deux précédents sans jamais introduire de nouvel accès aux données, **plus un AIManager** (`orchestrator/`) qui assemble le tout en un point d'entrée unique pour un tour de conversation : comprendre l'intention, sélectionner l'Agent ou les Tools pertinents, appeler LangChain, et utiliser le RAG lorsque nécessaire, **plus 11 Agents spécialisés** (`agents/`) — un par domaine métier (Assistant, Recherche documentaire, Projets, Commercial, Pipeline, KPI, Reporting, Maintenance, Industriel, Notifications, Automatisation) — chacun avec son propre prompt système, ses Tools autorisés, ses permissions, sa mémoire, son workflow et sa gestion des erreurs (voir « Les Agents spécialisés » plus bas), **plus une mémoire conversationnelle Redis** (`memory/`) — ShortTermMemory, SessionMemory, ContextMemory, LongTermMemory, PreferenceMemory — cinq composants adressant chacun une durée de vie et un usage différents (transcript volatil, enveloppe de session, slots de contexte, faits durables, préférences utilisateur), tous construits sur un unique port `IKeyValueStore` (voir « La mémoire conversationnelle » plus bas), **plus 8 automatisations IA** (`automations/`) — création automatique, rappels, e-mails, notifications, Google Calendar, analyses automatiques, recommandations, qualité des données — qui, comme les Agents, n'accèdent JAMAIS aux données métier autrement qu'en appelant les AI Tools MCP existants (voir « Les automatisations IA » plus bas), **plus un Dashboard IA** (`dashboard/`) qui analyse automatiquement 7 domaines métier (projets, pipeline, ventes, maintenance, RH, industriel, KPI) et affiche 6 catégories d'insights (alertes, recommandations, anomalies, prévisions, risques, qualité des données) — en lecture seule, exclusivement via les AI Tools existants, exposé par une **API HTTP réelle** (`modules/ai-dashboard/`, montée dans `app.js` — voir « Le Dashboard IA » plus bas, la première capacité de ce kernel accessible depuis l'extérieur du process Node). Voir `AI-Business-Copilot/00_PLAN_DEVELOPPEMENT.md` à la racine du dépôt pour la roadmap complète et le raisonnement derrière chaque choix ci-dessous.

## Ce que ce module fait

- Définit un **contrat** (classe abstraite JS, méthodes qui lèvent `NotImplementedError`) pour chaque préoccupation du Copilot : bus d'événements, mémoire de conversation, dépôt de prompts, registre d'outils, exécuteur de workflow, agent, client MCP, retriever RAG, store vectoriel, fournisseur LLM, guardrails, constructeur de contexte.
- Fournit des **adaptateurs par défaut, génériques et sans logique métier**, uniquement pour les préoccupations qui sont de la pure plomberie technique : `InMemoryEventBus`, `InMemoryConversationMemory`, `InMemoryPromptRepository`, `ToolRegistry`, `WorkflowRunner`, `AgentRegistry`.
- Assemble tout ça dans `AiManager`, une racine de composition qui ne dépend que des abstractions (Dependency Inversion) et expose `isEnabled()` / `isRoleAllowed(role)` / `getStatus()`.
- Charge et valide la configuration (`AI_COPILOT_ENABLED`, `AI_COPILOT_ROLES_ALLOWED`, `AI_LLM_PROVIDER`, `AI_LLM_MODEL`, `AI_LLM_API_KEY`) — **désactivé par défaut**, même pattern que `AUTO_EMAIL_JOBS_ENABLED` / `MFA_ENABLED` déjà utilisés dans le projet.
- Fait tourner un **serveur MCP complet** (`mcp/`) : protocole JSON-RPC 2.0 sur stdio (`initialize`, `ping`, `tools/list`, `tools/call`), avec Tool Registry (réutilisé de `tools/`), Tool Loader, Permission Manager, Validation Manager, Logger, Error Handler, et **74 Tools concrets répartis sur 12 modules métier** (Users, Projects, Project-Actions, Pipeline, Commercial-Contacts, Maintenance, Notifications, Industrial, POR PROMESH, Dashboard, HR, Google Calendar) qui **n'appellent que des services existants** — jamais un modèle Sequelize ni une requête SQL directement (règle vérifiée mécaniquement par `test/ai.mcp.tools.policy.test.js`). Démarrage : `node src/ai/mcp/server/start.js`.
- Fait tourner un **système RAG complet** (`rag/`) : ingestion (Markdown/texte/PDF/UML) → chunking avec chevauchement → embeddings (adaptateur offline déterministe) → vector store (`InMemoryVectorStore`, dans `vector/`) → retriever (implémente `IRetriever`) → reranking hybride → citations. Garanti par construction et vérifié mécaniquement (`test/ai.rag.policy.test.js`) : **ne lit jamais les données métier du CRM**, uniquement des sources documentaires explicitement autorisées. Câblé par défaut dans `createDefaultAiManager()` (index vide tant qu'aucune ingestion n'est lancée). Démonstration : `node src/ai/rag/reindex.js`.
- Fournit une **intégration LangChain.js complète** (`langchain/`) : Chains (Q&A, résumé, tool-calling), Planner, Router (lexical offline + LLM), Workflow Engine déclaratif, Context Builder — voir « Le LangChain.js » plus bas. Compose le serveur MCP et le RAG existants sans jamais leur ajouter de nouveau chemin d'accès aux données ; ne s'active que si un `ILlmProvider` réel est injecté explicitement (`createLangChainPipeline(...)`), **non câblé par défaut** dans `createDefaultAiManager()`.
- Fournit un **AIManager** (`orchestrator/`) : ConversationManager, IntentDetector, ToolRouter, AgentRouter, WorkflowManager, ResponseBuilder — le point d'entrée d'un tour de conversation complet (`handleMessage({message, user, conversationId})`), qui compose le serveur MCP, le RAG et LangChain sans jamais construire lui-même un nouvel accès aux données — voir « Le AIManager » plus bas. Même discipline que LangChain : exige un `ILlmProvider` (et un `McpServer`/`actingUser`) réels via `createAiOrchestrator(...)`, **non câblé par défaut** dans `createDefaultAiManager()`.
- Fournit **15 Agents spécialisés concrets** (`agents/`) — AssistantAgent, CrmAssistantAgent (le "CRM Assistant" — voir `orchestrator/CRM_ASSISTANT.md`), ProjectAgent, CommercialAgent, PipelineAgent, KPIAgent (le "Dashboard intelligent" : analyses/comparaisons/prévisions/alertes/graphiques, explique pourquoi un KPI augmente ou diminue — voir `orchestrator/KPI_AGENT.md`), ReportingAgent, MaintenanceAgent, IndustrialAgent, NotificationAgent, AutomationAgent (propose 5 actions — activité/rappel/rendez-vous/email/rapport — mais n'en exécute AUCUNE sans confirmation explicite de l'utilisateur au tour suivant — voir `orchestrator/AUTOMATION_WORKFLOWS.md`), BusinessAnalystAgent (analyse KPI/projets/ventes/pipeline/devis/activités/interventions/performance avec causes/risques/recommandations — voir `orchestrator/BUSINESS_ANALYST.md`), RecommendationAgent (le Copilot conseiller : priorités/tâches/clients à relancer/projets critiques/risques/anomalies/actions recommandées, chacune justifiée — voir `orchestrator/RECOMMENDATION_AGENT.md`), DataQualityAgent (détecte doublons/informations manquantes/emails-téléphones invalides/documents manquants/incohérences/erreurs de workflow/données orphelines, calcule un Score Qualité, propose des corrections SANS jamais modifier une donnée — voir `orchestrator/DATA_QUALITY_AGENT.md`), AdvancedSearchAgent (le "Search Agent" : recherches complexes multi-critères — période, seuil de montant, absence de correspondance — en combinant plusieurs AI Tools, jamais en inventant une donnée manquante — voir `orchestrator/ADVANCED_SEARCH_AGENT.md`) — chacun implémentant `IAgent` via `BaseAgent` (prompt système, Tools autorisés en liste blanche, permissions rôle/e-mail, mémoire de conversation, workflow LangChain, gestion des erreurs en réponse dégradée) — voir « Les Agents spécialisés » plus bas. Câblés par défaut dans `createAiOrchestrator(...)` (`agents/manifest.js::loadDefaultAgents`), désactivables via `includeSpecializedAgents: false`.
- Fournit une **mémoire conversationnelle Redis complète** (`memory/`) : `ShortTermMemory` (transcript volatil d'une conversation — implémente le port `IConversationMemory` déjà existant, remplacement direct d'`InMemoryConversationMemory`), `SessionMemory`, `ContextMemory`, `LongTermMemory`, `PreferenceMemory` — voir « La mémoire conversationnelle » plus bas. Chacune dépend d'un seul port `IKeyValueStore` (jamais du client `redis` directement), implémenté par `RedisKeyValueStore` (production) ou `InMemoryKeyValueStore` (tests/dev offline). `createRedisMemoryPipeline()` ne se connecte à Redis qu'au premier appel explicite de `pipeline.connect()` — construire le pipeline ne fait aucune I/O.
- Fournit **8 automatisations IA concrètes** (`automations/`) — `AutoCreationAutomation`, `ReminderAutomation`, `EmailAutomation`, `NotificationHousekeepingAutomation`, `GoogleCalendarAutomation`, `AnalysisAutomation`, `RecommendationAutomation`, `DataQualityAutomation` — des routines déclenchées par un ordonnanceur/une action admin (pas par un tour de conversation), qui traitent des lots d'éléments (l'échec d'un élément n'interrompt jamais les autres) en n'appelant **exclusivement** que des Tools MCP existants — jamais un service métier ni un modèle Sequelize directement (règle vérifiée mécaniquement par `test/ai.automations.policy.test.js`, symétrique de `test/ai.mcp.tools.policy.test.js`). Voir « Les automatisations IA » plus bas.
- Fournit un **Dashboard IA** (`dashboard/`) : 7 `DomainAnalyzer` (projects, pipeline, sales, maintenance, hr, industrial, kpi — une seule classe générique configurée différemment par domaine, pas 7 sous-classes) produisant les 6 catégories d'insights demandées (alerts, recommendations, anomalies, forecasts, risks, dataQuality), agrégés par `DashboardService` en un instantané par domaine ET une vue transversale par catégorie. Lecture seule par construction (aucun Tool d'écriture dans aucune liste blanche, vérifié mécaniquement par `test/ai.dashboard.policy.test.js`). Exposé en HTTP par `modules/ai-dashboard/` (`GET /ai-dashboard`, `GET /ai-dashboard/:domain`, `GET /ai-dashboard/insights/:category`), monté dans `app.js` — voir « Le Dashboard IA » plus bas.
- Sécurise l'ensemble du kernel (`security/`) : `RateLimiter` (limitation des appels, fenêtre fixe par `{actingUser, tool}`), `AuditLog` (journal des décisions de sécurité), `PromptInjectionGuard` (heuristiques bilingues FR/EN, modes flag/sanitize/block) et `secretRedaction` (filtrage automatique des secrets dans tous les loggers namespacés) — branchés en collaborateurs optionnels dans `McpServer`, `RagContextBuilder` et `AIManager`, en plus du contrôle de permissions/validation d'entrée/gestion d'erreurs déjà existants (`mcp/permissionManager.js`/`validationManager.js`/`errorHandler.js`) et d'un `express-rate-limit` sur les routes `ai-dashboard` — voir « Sécurité du module IA » plus bas.

## Ce que ce module ne fait pas (volontairement, à ce stade)

- **Pas d'agent véritablement autonome** : les 15 Agents spécialisés (`agents/`) exécutent chacun un workflow **déterministe et borné** (tool-calling à boucle bornée, ou — pour `AutomationAgent` — un plan produit une fois par `LlmPlanner`, PROPOSÉ, puis exécuté seulement sur confirmation explicite de l'utilisateur au tour suivant — voir `AUTOMATION_WORKFLOWS.md`) ; aucun ne relit sa propre sortie pour décider indéfiniment de la suite, et aucun n'a la possibilité de s'enregistrer lui-même ou de modifier le comportement d'un autre Agent. Trois modules (`users`, `hr`, `por_promesh`) n'ont délibérément pas d'Agent dédié parmi les 11 demandés : `AgentRouter.select()` retourne `null` pour leurs intentions, et `AIManager` retombe alors sur `WorkflowManager` (Tools/RAG génériques via LangChain), exactement comme avant que le premier Agent n'existe.
- **Aucun fournisseur LLM branché par défaut** (`services/llmProvider.interface.js`) : le choix du fournisseur est une décision de Sprint 0 (plan §13.2), non tranchée par ce commit. Ni le serveur MCP ni le RAG n'appellent un LLM eux-mêmes. L'intégration LangChain (`langchain/`), elle, sait *comment* appeler un `ILlmProvider` (via `LlmProviderChatModel`) mais n'en construit aucun elle-même — `createLangChainPipeline({ llmProvider, ... })` exige qu'on lui en injecte un réel ou un faux ; sans ça elle lève `NotConfiguredError` plutôt que de démarrer avec un défaut silencieux.
- **Aucune règle de guardrails/redaction PII générique** (`services/guardrails.interface.js`) : contrat seul — le serveur MCP a son propre `ValidationManager`/`PermissionManager` (§ ci-dessous), volontairement plus étroit et déjà concret. Le port `services/contextBuilder.interface.js`, en revanche, a désormais une première implémentation concrète : `RagContextBuilder` (`langchain/context/`), qui compose le RAG et la mémoire de conversation — voir « Le LangChain.js » plus bas.
- **Deux points de montage dans `app.js`** : `modules/ai-dashboard/` (le Dashboard IA, lecture seule) ET, depuis la passe "AI Business Copilot Flutter", `modules/ai-copilot/` — le module de livraison HTTP conversationnel complet, qui appelle réellement `AIManager.handleMessage()` (l'orchestrateur : intention, Agents, MCP, RAG, LangChain, permissions, explicabilité, suggestions) depuis un contrôleur Express, plus un canal WebSocket dédié (typing indicator + révélation "streaming" artificielle d'une réponse déjà complète — voir `modules/ai-copilot/AI_COPILOT_HTTP.md`). Le serveur MCP reste, par ailleurs, un **process autonome** exécutable seul (voir `mcp/server/start.js`) — les deux modules HTTP le réutilisent **en process** (`createServer()` appelé une fois par leur bridge respectif) plutôt que de dupliquer le catalogue de Tools ou d'ouvrir un second transport. Les deux réponses en langage naturel réelles dépendent d'un `ILlmProvider` configuré (`AI_LLM_PROVIDER`/`MODEL`/`API_KEY`, voir `services/providers/`) — absent, le Copilot reste inerte proprement (`NotConfiguredError`, jamais un crash), voir `docs/admin-guide/copilot-administration.md`.
- **Aucune nouvelle table/migration Postgres** : `ai_conversations`, `ai_messages`, etc. (plan §6) ne sont pas créées ici — `InMemoryConversationMemory`, `InMemoryPromptRepository` et le `InMemoryVectorStore` du RAG restent des adaptateurs volatils (perdus au redémarrage du process), à usage dev/démo/test. Redis (`memory/`) est un magasin **différent**, pas un remplacement de cette décision : il apporte une persistance qui survit au redémarrage du process Node, mais borne l'essentiel de ce qu'il stocke par un TTL — ce n'est toujours pas l'archivage permanent, sans expiration, que des tables Postgres `ai_*` offriraient. Voir « Le RAG » et « La mémoire conversationnelle » plus bas pour ce que ça implique concrètement.
- **Trois nouvelles dépendances npm, justifiées et documentées** : `pdf2json` (zéro dépendance transitive), pour l'ingestion PDF du RAG — voir « Pourquoi pdf2json » plus bas — `@langchain/core` + `zod` pour l'intégration LangChain (Runnables, prompts, parseurs de sortie, outils structurés), et `redis` (le client officiel v4) pour la mémoire conversationnelle — voir « La mémoire conversationnelle » plus bas. L'orchestrateur (`orchestrator/`) et les Agents (`agents/`) n'en ajoutent aucune : ils ne font que composer des collaborateurs déjà construits (Joi pour leur propre configuration, comme partout ailleurs dans le kernel). Tout le reste (serveur MCP, chunking, embeddings, vector store, reranking) est écrit avec les modules natifs de Node.js (`events`, `readline`, `crypto`) et `joi`/`dotenv`, déjà présents dans `package.json`. Le protocole JSON-RPC/MCP est implémenté à la main plutôt qu'avec le SDK officiel `@modelcontextprotocol/sdk` (qui est ESM-only) — voir « Pourquoi un serveur MCP fait main » plus bas.

## Structure

```
src/ai/
├── manager/    AiManager (racine de composition) + createDefaultAiManager()
├── config/     Chargement/validation des variables AI_* (Joi), désactivé par défaut
├── events/     IEventBus (port) + InMemoryEventBus (adaptateur)
├── memory/     IConversationMemory (port) + InMemoryConversationMemory (adaptateur volatil) + mémoire Redis complète — voir détail ci-dessous
├── prompts/    IPromptRepository (port) + PromptTemplate (rendu {{variable}}) + InMemoryPromptRepository
├── tools/      ITool (port) + ToolRegistry + ServiceBackedTool (base générique "déclare + délègue à un service")
├── workflows/  IWorkflowStep (port) + WorkflowRunner (exécuteur séquentiel générique)
├── agents/     IAgent (port) + AgentRegistry + BaseAgent + 11 Agents spécialisés — voir détail ci-dessous
├── mcp/        Serveur MCP complet — voir détail ci-dessous
├── rag/        Système RAG complet — voir détail ci-dessous
├── langchain/  Intégration LangChain.js complète — voir détail ci-dessous
├── orchestrator/  AIManager (racine de composition d'un tour de conversation) — voir détail ci-dessous
├── automations/  8 automatisations IA (BaseAutomation + Tools existants uniquement) — voir détail ci-dessous
├── dashboard/  Dashboard IA : 7 DomainAnalyzer + 6 catégories d'insights, lecture seule — voir détail ci-dessous
├── proactive/  Proactive AI : surveillance sans question (cron), alerte réelle avec problème/solution/actions préparées — voir détail ci-dessous
├── security/   RateLimiter + AuditLog + PromptInjectionGuard + pipeline (limitation des appels, audit, anti-injection) — voir détail ci-dessous
├── vector/     IVectorStore (port) + InMemoryVectorStore (adaptateur volatil, utilisé par le RAG)
├── services/   ILlmProvider / IGuardrails / IContextBuilder (ports ; IContextBuilder a désormais RagContextBuilder comme première implémentation, dans langchain/context/)
└── utils/      Erreurs typées (AiError, NotImplementedError, NotConfiguredError) + logger namespacé

src/ai/rag/
├── sourceGuard.js       Le garde-fou : allowlist d'extensions + blocklist de fragments métier + allowlist de racines
├── errors.js / logger.js / config.js   Mêmes conventions que le reste du kernel (RagError, createRagLogger, RAG_* via Joi)
├── ingestion/            Loaders Markdown/Texte/PDF/UML + LoaderRegistry (OCP) + DirectoryScanner (applique SourceGuard)
├── chunking/             IChunker (port) + RecursiveTextChunker (chevauchement, headings, hard-split)
├── embeddings/           IEmbeddingProvider (port) + HashingEmbeddingProvider (adaptateur offline déterministe)
├── reranking/            IReranker (port) + LexicalOverlapReranker (hybride vecteur + recouvrement lexical)
├── citations/            CitationBuilder — transforme des résultats de recherche en citations structurées
├── documentRegistry.js   Suivi par document (hash de contenu) pour une ré-ingestion idempotente
├── ingestionService.js   RagIngestionService — orchestrateur : garde → loader → chunker → embedder → vector store
├── retrievalService.js   RagRetrievalService — implémente IRetriever : embed → recherche → rerank → citations
├── pipeline.js           createRagPipeline() — racine de composition (comme manager/index.js)
└── reindex.js            Script de démonstration : ingère la documentation réelle de ce dépôt

src/ai/mcp/
├── mcpClient.interface.js   IMcpClient — port CLIENT (pour consommer un serveur MCP externe depuis un futur orchestrateur)
├── jsonRpc.js               Constantes + builders de réponses JSON-RPC 2.0
├── errors.js                McpError + ToolNotFoundError/PermissionDeniedError/ToolValidationError/ToolExecutionError
├── logger.js                Logger MCP (wrapper namespacé du logger du kernel, pas une nouvelle implémentation)
├── schemaDescriptor.js       Conversion Joi → JSON Schema minimale, pour tools/list
├── validationManager.js      Validation Manager — forme JSON-RPC + forme actingUser + input métier (Joi)
├── permissionManager.js      Permission Manager — délègue à tool.requiredRoles, jamais de logique de rôle dupliquée
├── errorHandler.js           Error Handler — toute erreur → réponse JSON-RPC valide, jamais de fuite de détail interne
├── toolLoader.js              Tool Loader — enregistrement explicite (manifeste), pas de découverte automatique de fichiers
├── server/
│   ├── transport.interface.js  IServerTransport (port)
│   ├── stdioTransport.js       Transport stdio MCP (JSON-RPC, une ligne = un message)
│   ├── mcpServer.js             McpServer — initialize/ping/tools-list/tools-call
│   └── start.js                  Point d'entrée process : `node src/ai/mcp/server/start.js`
└── tools/                     74 Tools, un sous-dossier par module métier (voir plus bas) + manifeste defaultToolFactories

src/ai/mcp/tools/
├── users/            9 Tools  → services/user.service.js (nouveau, extraction fidèle)
├── notifications/    5 Tools  → services/notification.service.js (étendu, extraction fidèle)
├── pipeline/         6 Tools  → modules/pipeline/services/pipelineStage.service.js
├── projects/         3 Tools  → modules/projects/services/project.service.js
├── commercialContacts/ 3 Tools → modules/commercial-contacts/services/commercialContactKpi.service.js
├── maintenance/      15 Tools → modules/maintenance-requests/services/maintenanceRequest.service.js
├── industrial/       5 Tools  → modules/industrial-records/services/industrialRecord.service.js
├── porPromesh/       10 Tools → modules/por-promesh/services/porPromesh.service.js
├── dashboard/        4 Tools  → modules/dashboard/services/dashboard.service.js
├── hr/               9 Tools  → modules/hr-requests/services/hrRequest.service.js
└── googleCalendar/   4 Tools  → services/googleCalendar.service.js (ajouté pour les automatisations, extraction fidèle)

src/ai/langchain/
├── errors.js / logger.js / config.js   Mêmes conventions que le reste du kernel (LangChainError, createLangChainLogger, LANGCHAIN_* via Joi)
├── model/
│   └── llmProviderChatModel.js   LlmProviderChatModel — sous-classe BaseChatModel de LangChain, adapte ILlmProvider au monde LangChain
├── tools/
│   └── mcpToolAdapter.js         createMcpToolAdapter(s) — DynamicStructuredTool par Tool MCP, route via mcpServer.handleMessage()
├── chains/
│   ├── chain.interface.js        IChain (port kernel, pas un concept LangChain natif)
│   ├── qaChain.js                QaChain — question + contexte RAG → réponse
│   ├── summarizationChain.js     SummarizationChain — texte long → résumé
│   └── toolCallingChain.js       ToolCallingChain — sortie JSON structurée → décision d'appeler un Tool MCP ou de répondre
├── planner/
│   ├── planner.interface.js      IPlanner (port)
│   └── llmPlanner.js             LlmPlanner — découpe un objectif en étapes, filtre les Tools inconnus, borne à maxSteps
├── router/
│   ├── router.interface.js       IRouter (port)
│   ├── lexicalIntentRouter.js    LexicalIntentRouter — routage par mots-clés, offline, aucun LLM requis
│   └── llmIntentRouter.js        LlmIntentRouter — routage par LLM avec repli (fallbackRouter) optionnel
├── workflow/
│   ├── workflowEngine.interface.js   IWorkflowEngine (port)
│   └── langChainWorkflowEngine.js    LangChainWorkflowEngine — exécute une liste déclarative d'étapes chain/tool/router, routeurs imbriqués supportés
├── context/
│   └── ragContextBuilder.js      RagContextBuilder — première implémentation concrète de IContextBuilder (compose IRetriever + IConversationMemory)
├── pipeline.js                   createLangChainPipeline() — racine de composition (comme manager/index.js et rag/pipeline.js)
└── index.js                      Barrel — réexporte tous les composants ci-dessus

src/ai/orchestrator/
├── errors.js / logger.js / config.js   Mêmes conventions que le reste du kernel (OrchestratorError, createOrchestratorLogger, AI_ORCHESTRATOR_* via Joi)
├── intentCatalog.js              DEFAULT_INTENT_CATALOG — un intent par module de Tools MCP + documentation_question + general_chat (donnée, pas du code — OCP)
├── conversationManager.js        ConversationManager — enveloppe IConversationMemory (append/getHistory/clear) + getCurrentTopic (sujet courant, survit à la fenêtre d'historique)
├── intentDetector.interface.js   IIntentDetector (port)
├── intentDetector.js             IntentDetector (délègue à un IRouter injecté) + createLexicalIntentDetector() (défaut offline, LexicalIntentRouter)
├── toolRouter.js                 ToolRouter — filtre par module puis classe par recouvrement lexical, retourne au plus maxTools Tools
├── agentRouter.js                AgentRouter — enveloppe AgentRegistry.findHandler(intent), retourne null tant qu'aucun agent n'est enregistré
├── workflowManager.js             WorkflowManager — construit les WorkflowStep (chain qa ou tool-calling) et les exécute via LangChainWorkflowEngine
├── responseBuilder.js             ResponseBuilder — enveloppe de réponse stable + buildErrorResponse() (ne fuite jamais le détail d'une erreur non typée)
├── aiManager.js                   AIManager — handleMessage({message, user, conversationId}), le point d'entrée demandé par cette passe
├── pipeline.js                    createAiOrchestrator() — racine de composition (comme langchain/pipeline.js)
└── index.js                       Barrel — réexporte tous les composants ci-dessus

src/ai/agents/
├── agent.interface.js             IAgent (port — name/canHandle(intent)/execute(context))
├── agentRegistry.js                AgentRegistry — register()/get()/list()/findHandler(intent) (OCP)
├── errors.js                       AgentError, AgentPermissionError (fails closed sur une permission refusée)
├── logger.js                       createAgentLogger(name)
├── baseAgent.js                    BaseAgent — squelette commun aux 11 Agents : prompt système + Tools autorisés (liste blanche) +
│                                    permissions (rôle/e-mail, réutilise utils/authorization.js) + mémoire (IConversationMemory) +
│                                    workflow par défaut (tool-calling scopé, repli RAG) + gestion des erreurs (réponse dégradée)
├── assistantAgent.js                AssistantAgent — general_chat, concierge général, aucun Tool, RAG uniquement
├── searchAgent.js                   SearchAgent — documentation_question, RAG générique, conservé mais plus câblé par défaut (voir crmAssistantAgent.js)
├── crmAssistantAgent.js              CrmAssistantAgent — documentation_question, "CRM Assistant" (voir CRM_ASSISTANT.md), aucun Tool, RAG uniquement
├── projectAgent.js                  ProjectAgent — projects (3 Tools)
├── commercialAgent.js               CommercialAgent — commercial_contacts (3 Tools, permissions alignées sur les Tools)
├── pipelineAgent.js                 PipelineAgent — pipeline (6 Tools)
├── kpiAgent.js                      KPIAgent — dashboard (4 Tools), Dashboard intelligent (voir KPI_AGENT.md)
├── reportingAgent.js                ReportingAgent — reporting (mêmes 4 Tools que KPIAgent), workflow à 2 étapes (tool-calling → SummarizationChain)
├── maintenanceAgent.js               MaintenanceAgent — maintenance (15 Tools, le plus grand module)
├── industrialAgent.js                IndustrialAgent — industrial (5 Tools, permissions alignées sur les Tools)
├── notificationAgent.js              NotificationAgent — notifications (5 Tools)
├── automationAgent.js                AutomationAgent — automation, IPlanner (LlmPlanner), cross-module, admin-tier — propose puis exécute SEULEMENT sur confirmation (voir AUTOMATION_WORKFLOWS.md)
├── businessAnalystAgent.js           BusinessAnalystAgent — business_analysis, résultat/causes/risques/recommandations sur 8 domaines (voir BUSINESS_ANALYST.md)
├── recommendationAgent.js            RecommendationAgent — recommendation, priorités/tâches/clients/projets critiques/risques/anomalies/actions (voir RECOMMENDATION_AGENT.md)
├── dataQualityAgent.js               DataQualityAgent — data_quality, 8 détections + Score Qualité + corrections proposées, jamais appliquées (voir DATA_QUALITY_AGENT.md)
├── advancedSearchAgent.js            AdvancedSearchAgent — advanced_search, "Search Agent" : recherches complexes, 2 Tools (2 modules), voir ADVANCED_SEARCH_AGENT.md
├── manifest.js                       defaultAgentFactories (15) + loadDefaultAgents(agentRegistry, deps) — manifeste explicite (comme mcp/tools/index.js)
└── index.js                          Barrel — réexporte tous les composants ci-dessus

src/ai/memory/
├── conversationMemory.interface.js   IConversationMemory (port, déjà existant) — ShortTermMemory l'implémente
├── inMemoryConversationMemory.js     InMemoryConversationMemory (déjà existant, adaptateur volatil dev/test, inchangé)
├── errors.js / logger.js / config.js   Mêmes conventions que le reste du kernel (MemoryError, createMemoryLogger, REDIS_*/MEMORY_* via Joi)
├── keyValueStore.interface.js        IKeyValueStore (port) — les seules primitives Redis dont les 5 classes ont besoin (string/liste/hash)
├── inMemoryKeyValueStore.js           InMemoryKeyValueStore — fake pour les tests/dev offline (jamais utilisé en production)
├── hashMemoryBase.js                  createHashBucket() — helper interne (pas un port) partagé par LongTermMemory/ContextMemory/PreferenceMemory (DRY)
├── shortTermMemory.js                 ShortTermMemory — implémente IConversationMemory, transcript volatil (liste Redis, TTL glissant, plafonné)
├── sessionMemory.interface.js         ISessionMemory (port)
├── sessionMemory.js                   SessionMemory — enveloppe de session (chaîne Redis JSON, TTL glissant)
├── contextMemory.interface.js         IContextMemory (port)
├── contextMemory.js                   ContextMemory — slots de "focus courant" d'une conversation (hash Redis, TTL glissant)
├── longTermMemory.interface.js        ILongTermMemory (port)
├── longTermMemory.js                  LongTermMemory — faits durables par utilisateur (hash Redis, pas de TTL par défaut)
├── preferenceMemory.interface.js      IPreferenceMemory (port)
├── preferenceMemory.js                PreferenceMemory — préférences durables par utilisateur (hash Redis, pas de TTL par défaut)
├── redis/
│   ├── redisClient.js                  createRedisClient(env) — configure un client `redis` v4, ne se connecte jamais lui-même
│   └── redisKeyValueStore.js            RedisKeyValueStore — implémente IKeyValueStore par-dessus un client `redis` déjà connecté
├── pipeline.js                        createRedisMemoryPipeline() — racine de composition (comme langchain/pipeline.js) + connect()/disconnect()
└── index.js                           Barrel — réexporte tous les composants ci-dessus

src/ai/automations/
├── automation.interface.js            IAutomation (port — name/run(context))
├── errors.js                           AutomationError, UnknownAutomationToolError, AutomationPermissionError
├── logger.js                           createAutomationLogger(name)
├── baseAutomation.js                   BaseAutomation — Tools autorisés (liste blanche) + permissions (réutilise utils/authorization.js) +
│                                        _callTool() (parse le JSON renvoyé par un Tool LangChain) + enveloppe {success,actions,errors} qui ne lève jamais pour un échec métier
├── autoCreationAutomation.js            AutoCreationAutomation — "création automatique" : dispatch par lot vers les create_* Tools existants
├── reminderAutomation.js                ReminderAutomation — "rappels" : liste des Tools existants, filtre les éléments dus, notifie via send_notification_email
├── emailAutomation.js                   EmailAutomation — "emails" : envoi par lot via send_notification_email
├── notificationHousekeepingAutomation.js NotificationHousekeepingAutomation — "notifications" : nettoyage via list_my_notifications/mark_all_notifications_read/delete_notification
├── googleCalendarAutomation.js           GoogleCalendarAutomation — "Google Calendar" : get_calendar_status puis create_calendar_event par lot
├── analysisAutomation.js                 AnalysisAutomation — "analyses automatiques" : instantané multi-Tools de lecture/KPI
├── recommendationAutomation.js           RecommendationAutomation — "recommandations" : règles de lecture seule qui font émerger un insight
├── dataQualityAutomation.js              DataQualityAutomation — "qualité des données" : détection de problèmes sur un ensemble d'éléments lus
├── manifest.js                           defaultAutomationFactories (8) + createDefaultAutomations(deps) → Map nom → instance
├── pipeline.js                           createAutomationsPipeline({mcpServer, actingUser}) — racine de composition (réutilise createMcpToolAdapters, comme les Agents)
└── index.js                              Barrel — réexporte tous les composants ci-dessus

src/ai/dashboard/
├── domainAnalyzer.interface.js  IDomainAnalyzer (port — domain/analyze(context))
├── errors.js                     DashboardError, UnknownAnalyzerToolError, DashboardPermissionError
├── logger.js                     createDashboardLogger(domain)
├── domainAnalyzer.js              DomainAnalyzer — le moteur générique : dataSources (Tools de lecture) + rules (une par catégorie) → CATEGORIES
├── statsUtils.js                  detectNumericOutliers()/mean()/stdDev() — détection d'anomalies par z-score, partagée (industrialAnalyzer.js, kpiAnalyzer.js)
├── projectsAnalyzer.js             ProjectsAnalyzer — domaine "projects" (list_projects)
├── pipelineAnalyzer.js              PipelineAnalyzer — domaine "pipeline" (list_pipeline_stages)
├── salesAnalyzer.js                 SalesAnalyzer — domaine "sales"/ventes (get_commercial_contact_kpi/analytics)
├── maintenanceAnalyzer.js            MaintenanceAnalyzer — domaine "maintenance" (list_all_maintenance_requests)
├── hrAnalyzer.js                     HrAnalyzer — domaine "hr" (list_hr_requests)
├── industrialAnalyzer.js             IndustrialAnalyzer — domaine "industrial" (list_industrial_records)
├── kpiAnalyzer.js                    KpiAnalyzer — domaine "kpi" (get_dashboard_kpis/get_por_promesh_dashboard)
├── manifest.js                       defaultAnalyzerFactories (7) + createDefaultAnalyzers(deps) → Map domaine → instance + DOMAIN_NAMES
├── dashboardService.js               DashboardService — agrège : instantané par domaine + résumé transversal par catégorie
├── pipeline.js                       createDashboardPipeline({mcpServer, actingUser}) — racine de composition (réutilise createMcpToolAdapters, comme les Agents/Automations)
└── index.js                          Barrel — réexporte tous les composants ci-dessus

src/modules/ai-dashboard/
├── services/aiDashboardBridge.service.js   Seul fichier qui touche src/ai/ : construit le McpServer singleton (createServer(), une fois) et un pipeline PAR requête (scopé à l'actingUser de l'appelant)
├── controllers/aiDashboard.controller.js    getSnapshot/getDomain/getInsightsByCategory — validation des paramètres, {success, data}/{success:false, message}
└── routes/aiDashboard.routes.js              authRequired puis GET /, GET /:domain, GET /insights/:category — monté sur /ai-dashboard dans src/app.js
```

## Le serveur MCP (`mcp/`)

### Composants livrés

| Composant demandé | Fichier | Statut |
|---|---|---|
| MCP Server | `mcp/server/mcpServer.js` | JSON-RPC 2.0 complet : `initialize`, `ping`, `tools/list`, `tools/call` |
| Tool Registry | `tools/toolRegistry.js` (réutilisé, pas recréé) | Le serveur MCP s'appuie sur le `ToolRegistry` déjà construit dans le kernel générique |
| Tool Loader | `mcp/toolLoader.js` | Enregistrement **explicite** (manifeste `mcp/tools/index.js`), pas d'auto-discovery filesystem |
| Permission Manager | `mcp/permissionManager.js` | Vérifie `actingUser` contre `tool.requiredRoles` **OU** `tool.allowedEmails` (acteurs e-mail codé en dur) ; échoue fermé (anonyme = refusé) |
| Validation Manager | `mcp/validationManager.js` | Valide l'enveloppe JSON-RPC, la forme d'`actingUser`, et l'input métier via `tool.inputSchema` (Joi) |
| Logger | `mcp/logger.js` | Wrapper namespacé (`mcp:server`, `mcp:permission`, ...) du logger du kernel |
| Error Handler | `mcp/errorHandler.js` | Toute erreur (McpError, `{status,message}` CRM, ou inconnue) → réponse JSON-RPC valide, jamais de stack/detail interne |

### 74 Tools sur 12 modules, et comment lire la couverture

Chaque Tool est un `ServiceBackedTool` (déclare `name`/`description`/`inputSchema`/`requiredRoles`/`allowedEmails`, délègue à une fonction pure existante — voir `mcp/tools/<module>/index.js` pour la liste exacte de chaque module). Contrairement à la première passe (4 Tools en lecture seule), cette couverture inclut aussi des Tools en écriture : la sécurité repose sur `PermissionManager` (mêmes rôles/e-mails que les routes HTTP d'origine) plutôt que sur l'exclusion de toute mutation — un Tool n'exécute jamais rien que l'`actingUser` ne pourrait déjà faire via l'API existante.

| Module | Tools | Service(s) appelé(s) |
|---|---|---|
| Users | 9 | `services/user.service.js` (nouveau — voir ci-dessous) |
| Notifications | 5 | `services/notification.service.js` (étendu — voir ci-dessous) |
| Pipeline | 6 | `modules/pipeline/services/pipelineStage.service.js` |
| Projects | 3 | `modules/projects/services/project.service.js` (périmètre limité, voir plus bas) |
| Project-Actions | 1 | `modules/project-actions/services/projectAction.service.js` (ajouté pour `AutomationAgent` — voir `AUTOMATION_WORKFLOWS.md`) |
| Commercial-Contacts | 3 | `modules/commercial-contacts/services/commercialContactKpi.service.js` (périmètre limité, voir plus bas) |
| Maintenance | 15 | `modules/maintenance-requests/services/maintenanceRequest.service.js` |
| Industrial-Records | 5 | `modules/industrial-records/services/industrialRecord.service.js` |
| POR PROMESH | 10 | `modules/por-promesh/services/porPromesh.service.js` |
| Dashboard | 4 | `modules/dashboard/services/dashboard.service.js` |
| HR | 9 | `modules/hr-requests/services/hrRequest.service.js` |
| Google Calendar | 4 | `services/googleCalendar.service.js` (ajouté pour `GoogleCalendarAutomation` — voir « Les automatisations IA » plus bas) |

**Règle mécanique, pas seulement une convention de revue de code** : `test/ai.mcp.tools.policy.test.js` lit récursivement le code source de chaque fichier sous `mcp/tools/<module>/` et échoue si l'un d'eux référence un modèle Sequelize, `sequelize` lui-même, ou une requête SQL brute — et échoue aussi s'il ne référence *aucun* service existant. Toute tentative de contourner "les Tools utilisent exclusivement les services existants" casse la suite de tests (plus de 160 assertions sur ce seul point).

#### Google Calendar : un module ajouté pour que les automatisations respectent "utiliser les AI Tools existants"

`services/googleCalendar.service.js` existait déjà dans le CRM (OAuth2, création/mise à jour/suppression d'événements sur le calendrier `primary` du commercial connecté, déjà branché sur `routes/googleCalendar.routes.js`) mais n'avait jamais été enveloppé en Tools MCP — Google Calendar ne faisait pas partie des 10 modules de la passe initiale. Il aurait été impossible de construire `GoogleCalendarAutomation` (voir plus bas) sans lui donner un accès aux données autrement qu'un Tool. 4 Tools ont donc été ajoutés, par extraction fidèle (même patron que les 69 précédents) : `get_calendar_status`, `create_calendar_event`, `update_calendar_event`, `delete_calendar_event` — tous les quatre `requiredRoles: []` mais **scopés à `actingUser.id`** (le `userId` passé au service n'est jamais lu depuis l'input, toujours depuis l'identité appelante) : un utilisateur ne peut agir que sur SON PROPRE calendrier Google, jamais celui d'un autre. Le service sous-jacent ne lève jamais (un compte non connecté ou une erreur d'API renvoie `{success:false, ...}`) — ces Tools renvoient donc ce résultat tel quel plutôt que de le traduire en erreur MCP.

#### Deux services créés/étendus pour Users et Notifications (décision produit)

`Users` et `Notifications` n'avaient **aucune couche service** : leurs capacités vivaient directement dans des requêtes Sequelize écrites en ligne dans `src/routes/admin.js`, `src/routes/users.routes.js` et `src/routes/notifications.routes.js` (style « routes grasses » déjà documenté comme dette dans `CRM_Architecture_Complète.pdf`). Après validation explicite, deux fichiers ont été créés/étendus par **extraction fidèle** (même requêtes, même comportement, aucune règle métier nouvelle) :

- `src/services/user.service.js` (nouveau, 9 fonctions).
- `src/services/notification.service.js` (étendu, +5 fonctions ; la fonction historique `notifyProjectComment` est inchangée).

Les routes HTTP d'origine **ne sont pas modifiées** — ce sont des ajouts, pas un remplacement. Effet de bord découvert pendant l'extraction : la route legacy `POST /notifications/send-email` appelle `emailService.send(...)` (`services/emailService.js`), qui n'exporte que `sendRelanceEmail` — cet appel lève donc déjà une `TypeError` dans le code existant (bug préexistant, non lié à ce travail). `notification.service.js::sendEmailNotification` utilise à la place `services/email.service.js::sendEmail`, le service réellement fonctionnel déjà utilisé par le module HR — reproduire fidèlement un appel cassé n'aurait eu aucune valeur pour un Tool censé fonctionner. Par ailleurs, `send_notification_email` exige un `actingUser` admin-tier alors que la route legacy n'exige **aucune authentification** (le P0 déjà documenté dans le dossier d'architecture) — plus restrictif délibérément, pas un oubli.

#### Deux modules à périmètre volontairement réduit

- **Projects** : `modules/projects/services/project.service.js` n'exporte que 3 fonctions (`listProjects`, `moveStage`, `assignOwner`) ; le reste des capacités visibles côté HTTP (fiche par id, timeline, notes, archivage, export Excel) vit directement dans les contrôleurs, sans couche service — donc hors périmètre de « transformer les services existants ». De plus, `moveStage`/`assignOwner` ne vérifient pas l'ownership en interne (seul le middleware de route `requireOwnerOrAdmin` le faisait) : les Tools `move_project_stage`/`assign_project_owner` restreignent donc l'accès à l'admin-tier uniquement, plus restrictif que la route HTTP, faute d'une fonction de lecture d'ownership exposée en service.
- **Commercial-Contacts** : `src/modules/commercial-contacts/` ne contient que le service KPI (`commercialContactKpi.service.js`) — le CRUD réel des contacts/relances vit dans la couche legacy `src/routes/commercial_contacts.routes.js`, hors périmètre de ce travail.

Sorties binaires (PDF, buffers, upload de fichier) sont également exclues par construction : `get_hr_request_pdf`, `get_por_promesh_pdf`, `add_por_promesh_attachment` n'ont pas de Tool équivalent — un Tool MCP répond en JSON, pas en flux binaire.

#### `allowedEmails` : parité avec le modèle d'autorisation hybride du CRM

Plusieurs acteurs du CRM sont autorisés par une adresse e-mail codée en dur plutôt que par un rôle (Responsable RH `manegerofficecbi@gmail.com`, Responsable maintenance `accueilcbif@gmail.com`, root admin...). `PermissionManager.assertCanCall()` et `ServiceBackedTool` supportent désormais `allowedEmails` en plus de `requiredRoles` (OR logique) — sans ce mécanisme, ces comptes auraient été refusés par les Tools alors qu'ils sont autorisés côté HTTP. Voir `test/ai.mcp.permissionManager.test.js` pour la couverture dédiée.

### Pourquoi un serveur MCP fait main (pas le SDK officiel)

`@modelcontextprotocol/sdk` est ESM-only ; ce backend est intégralement CommonJS (`require`/`module.exports`, pas de `"type": "module"` dans `package.json`). Plutôt que de faire cohabiter deux systèmes de modules pour un unique sous-dossier, le protocole (JSON-RPC 2.0 sur stdio — un message par ligne, sans framing `Content-Length`) est implémenté directement avec `readline`/`events` natifs de Node.js. Effet secondaire positif : chaque composant (Validation/Permission/Error Handler) est testable unitairement sans dépendance réseau ni protocole réel — voir `test/ai.mcp.*.test.js`.

### Extension CRM-spécifique du protocole : `actingUser`

Le standard MCP `tools/call` ne porte que `{name, arguments}`. Ce serveur exige en plus un `actingUser: {id, role, email?}` dans `params` — parce que le principe directeur du plan (§4.5) est que **le Copilot agit toujours au nom de l'utilisateur connecté, jamais avec des privilèges élevés**. Sans `actingUser`, `PermissionManager` refuse l'appel (`PERMISSION_DENIED`, traité comme "anonyme") ; avec un `actingUser` mal formé, `ValidationManager` refuse avant même de regarder les permissions (`INVALID_PARAMS`). Un futur orchestrateur MCP-côté-client doit donc toujours transmettre l'identité réelle de l'utilisateur CRM qu'il représente — jamais une identité de service générique.

## Le RAG (`rag/`)

### Les 7 composants demandés, et où ils vivent

| Composant | Fichier(s) | Rôle |
|---|---|---|
| Ingestion | `rag/ingestion/` | `MarkdownLoader`, `TextLoader`, `PlantUmlLoader`, `PdfLoader`, `LoaderRegistry` (OCP), `DirectoryScanner` (applique `SourceGuard` à chaque fichier trouvé) |
| Chunking | `rag/chunking/RecursiveTextChunker` | Paragraphes → chunks avec chevauchement configurable, hard-split des paragraphes trop longs, attribution du titre de section (markdown) à chaque chunk |
| Embeddings | `rag/embeddings/HashingEmbeddingProvider` | Vectorisation offline déterministe ("hashing trick"/feature hashing signé) — voir "Pourquoi un embedding par hashing" plus bas |
| Vector database | `vector/InMemoryVectorStore` | Recherche par similarité cosinus, en mémoire, groupée par `collection` — implémente le port `IVectorStore` qui existait déjà depuis la passe d'infrastructure initiale |
| Retriever | `rag/retrievalService.js` (`RagRetrievalService`) | Implémente le port `IRetriever` existant : embed requête → recherche vectorielle → reranking → citations |
| Reranking | `rag/reranking/LexicalOverlapReranker` | Score hybride (similarité cosinus + recouvrement lexical Jaccard) — rattrape les termes exacts qu'un vecteur hashé peut diluer |
| Citations | `rag/citations/CitationBuilder` | Transforme chaque résultat en citation structurée : source, titre, type, chemin, section, page, extrait tronqué, score |

`RagIngestionService` (`rag/ingestionService.js`) et `createRagPipeline()` (`rag/pipeline.js`) ne sont pas dans la liste ci-dessus au sens strict — ce sont les orchestrateurs qui assemblent les 7 composants, exactement comme `McpServer` assemble Permission/Validation/Error Handler côté serveur MCP.

### La contrainte centrale : jamais les données métier du CRM

Tout le système est construit autour d'une seule garantie, appliquée à trois niveaux indépendants :

1. **`SourceGuard` (`rag/sourceGuard.js`)** — chaque chemin de fichier passe par trois vérifications avant tout chargement : (a) extension dans l'allowlist documentation (`.md`, `.markdown`, `.txt`, `.pdf`, `.puml`, `.plantuml`, `.uml`) ; (b) absence de tout fragment de chemin métier bloqué (`src/models/`, `src/modules/`, `src/routes/`, `src/services/`, `src/migrations/`, `src/seeders/`, `src/config/`, `src/middleware/`, `node_modules/`, `uploads/`, `.env`) — vérifié **même** à l'intérieur d'une racine autorisée, en défense en profondeur ; (c) le chemin doit être sous l'une des racines **explicitement** configurées — son constructeur lève une erreur sans au moins une racine, il n'existe aucun défaut "scanner tout le dépôt".
2. **Séparation architecturale** — `rag/` n'importe jamais un modèle Sequelize, `sequelize`, ni un service CRM (`modules/*/services`, `src/services/*`). `RagRetrievalService`/`RagIngestionService` ne dépendent que de leurs collaborateurs injectés (embedding provider, vector store, loaders) — aucun ne connaît l'existence des modules métier.
3. **Application mécanique** — `test/ai.rag.policy.test.js` lit le code source de chaque fichier sous `rag/` et échoue si l'un d'eux référence un modèle, `sequelize`, un service métier, du SQL brut, ou même un appel HTTP sortant (`axios`/`fetch`). Symétrique de `test/ai.mcp.tools.policy.test.js` (qui, lui, impose l'inverse aux Tools MCP) — les deux tests ensemble rendent la frontière entre "peut lire le métier" et "ne peut jamais le lire" vérifiable à chaque exécution de la suite, pas seulement documentée.

### Pourquoi un embedding par hashing (pas un modèle de langage)

Aucun fournisseur LLM/embeddings n'est choisi à ce stade (décision Sprint 0, plan §13.2) — mais un RAG a besoin de *quelque chose* de fonctionnel pour être testable de bout en bout sans dépendance externe. `HashingEmbeddingProvider` utilise le "hashing trick" (feature hashing signé sur un sac de mots, la même technique que `HashingVectorizer` de scikit-learn ou Vowpal Wabbit) : déterministe, 100% offline, aucune clé API, aucun poids de modèle à télécharger. `LexicalOverlapReranker` compense la principale faiblesse de cette approche (dilution des termes exacts dans les collisions de hachage) en réintroduisant un score de recouvrement lexical exact. Remplacer cet adaptateur par un vrai modèle d'embedding plus tard ne change rien d'autre dans le pipeline : une nouvelle classe derrière `IEmbeddingProvider`, c'est tout.

### Pourquoi `pdf2json` (nouvelle dépendance, justifiée)

Extraire du texte d'un PDF existant nécessite un analyseur — ni `pdfkit` (génération uniquement, déjà présent) ni aucune bibliothèque standard de Node.js ne le permettent. Comparé aux alternatives évaluées : `pdf-parse@1.x` embarque `debug`/`node-ensure` et a un piège documenté (exécute son propre fichier PDF de test si `require()`d sans `module.parent`) ; `pdf-parse@2.x` tire une dépendance native (`@napi-rs/canvas`) juste pour extraire du texte. `pdf2json` (v4, **zéro dépendance transitive**) a été retenu et testé sur le vrai `CRM_Architecture_Complète.pdf` du dépôt (220 chunks extraits avec succès). Un détail non trivial a dû être corrigé pendant l'intégration : `pdf2json` renvoie le texte sous forme de *runs* positionnés par (x, y), parfois coupés en plein milieu d'un mot pour le texte de diagrammes (rendu glyphe par glyphe) — les joindre avec un séparateur systématique transformait "avec MFA" en "a v e c M F A" lettre par lettre. Le correctif regroupe les runs par ligne (y proche) avant de les concaténer : aucun séparateur à l'intérieur d'une ligne (on fait confiance aux espaces déjà présents dans les données), un espace entre lignes distinctes. Voir `rag/ingestion/pdfLoader.js` et `test/ai.rag.loaders.test.js`.

### Ce que `reindex.js` est — et n'est pas

`node src/ai/rag/reindex.js` ingère la documentation réelle de ce dépôt (`Backend Master/docs/`, `GOOGLE_CALENDAR_SETUP.md`, `src/ai/README.md`, `AI-Business-Copilot/`, `CRM_Architecture_Complète.pdf`) et affiche un résumé — utile pour prouver que le pipeline fonctionne sur du contenu réel. Ce n'est **pas** un outil d'indexation persistante : `InMemoryVectorStore` est volatil, tout est perdu à la fin du process (même disclosure que `InMemoryConversationMemory`/`InMemoryPromptRepository` dans le reste du kernel). Un usage réaliste consiste à appeler `ingestionService.ingestDirectories(...)` une fois au démarrage d'un process long-vivant (avant de servir la première requête), pas à l'exécuter comme un script "indexe une fois, c'est fini".

## Le LangChain.js (`langchain/`)

### Les 6 composants demandés, et où ils vivent

| Composant | Fichier(s) | Rôle |
|---|---|---|
| Chains | `langchain/chains/` | `QaChain` (question + contexte RAG → réponse), `SummarizationChain` (texte long → résumé) — `RunnableSequence` LangChain autour d'un `ChatPromptTemplate` + `StringOutputParser` |
| Tool Calling | `langchain/chains/toolCallingChain.js` + `langchain/tools/mcpToolAdapter.js` | `ToolCallingChain` demande au LLM une décision structurée en JSON (`{action: "call_tool"\|"respond", ...}`) ; `mcpToolAdapter` expose chaque Tool MCP enregistré comme un `DynamicStructuredTool` LangChain |
| Planner | `langchain/planner/` | `LlmPlanner` — découpe un objectif en une liste d'étapes ordonnées, en s'appuyant uniquement sur les Tools réellement disponibles |
| Router | `langchain/router/` | `LexicalIntentRouter` (mots-clés, offline, défaut) et `LlmIntentRouter` (classification par LLM, avec repli optionnel vers un autre routeur) — tous deux implémentent `IRouter` |
| Workflow Engine | `langchain/workflow/langChainWorkflowEngine.js` | `LangChainWorkflowEngine` — exécute une liste déclarative d'étapes (`chain`/`tool`/`router`), fait circuler un state partagé, supporte des routeurs imbriqués (branche qui route à nouveau) |
| Context Builder | `langchain/context/ragContextBuilder.js` | `RagContextBuilder` — première implémentation concrète du port `IContextBuilder` (déjà défini depuis la passe d'infrastructure) : compose `IRetriever` (RAG → citations) et `IConversationMemory` (historique) en un contexte prêt à injecter dans un prompt |

`createLangChainPipeline()` (`langchain/pipeline.js`) n'est pas dans la liste ci-dessus au sens strict — c'est la racine de composition qui assemble les 6 composants, exactement comme `McpServer` (côté MCP) et `createRagPipeline()` (côté RAG). Chaque chaîne dispose en plus de sa propre documentation JSDoc en tête de fichier (sections Rôle / Entrée / Sortie / Composition LangChain / Erreurs) — ce README résume l'architecture d'ensemble, le JSDoc de chaque fichier documente son contrat précis.

### Génération de réponse — prompts système et ton par rôle (`langchain/prompts/`)

`QaChain`/`ToolCallingChain` composent systématiquement `langchain/prompts/responsePrompts.js::buildResponseSystemPrompt()` : des principes de base non négociables (professionnel, naturel, court, compréhensible, jamais halluciné, toujours citer les données/outils utilisés, expliquer le raisonnement, signaler une information manquante), optionnellement adaptés au ton de l'un des 5 rôles CRM reconnus (`admin`, `commercial`, `rh`, `maintenance`, `direction`) — dérivé automatiquement de `actingUser.role` dans `createLangChainPipeline()`/`createAiOrchestrator()`, sans qu'un appelant ait à le répéter. Avant cette passe, `ToolCallingChain` ne portait AUCUNE instruction de qualité de réponse (seulement le protocole JSON de sélection d'outil) — comblé ici. Voir `langchain/prompts/RESPONSE_PROMPTS.md` pour le détail complet, y compris ce qui n'a pas encore été propagé aux 11 Agents spécialisés.

### Pourquoi une sortie JSON structurée plutôt que le function-calling propriétaire d'un provider

`ToolCallingChain` et `LlmPlanner` demandent au LLM de répondre avec un objet JSON respectant un schéma documenté dans le prompt (`buildSystemPrompt`), plutôt que d'utiliser l'API de function-calling native d'un provider (OpenAI, Anthropic, etc.). Deux raisons, cohérentes avec le reste du kernel : (1) **portabilité** — aucun fournisseur LLM n'est encore choisi (Sprint 0, plan §13.2), et `ILlmProvider` est volontairement un port texte-en/texte-out ; coupler `langchain/` à une API de function-calling spécifique aurait recréé une dépendance concrète prématurée. (2) **testabilité offline** — `FakeListChatModel`/un faux `ILlmProvider` peuvent renvoyer une chaîne JSON canée sans simuler un protocole de function-calling propriétaire, ce qui garde toute la suite `test/ai.langchain.*` rapide et déterministe (138 tests, aucun appel réseau).

### Pourquoi `createLangChainPipeline()` n'est pas câblé dans `createDefaultAiManager()`

Contrairement au RAG (qui a un adaptateur offline réellement utile — `HashingEmbeddingProvider` — et donc un défaut fonctionnel), aucune capacité LangChain n'a de sens sans un vrai `ILlmProvider` : générer du texte est justement ce qu'aucun adaptateur offline ne peut faire honnêtement. `createLangChainPipeline({ llmProvider, retriever, ... })` lève donc `NotConfiguredError` si `llmProvider` ou `retriever` manque, plutôt que de démarrer avec un défaut silencieux qui masquerait l'absence de décision Sprint 0. `toolCallingChain`/`tools` restent également `null`/`[]` tant qu'un `mcpServer` + `actingUser` ne sont pas fournis — le pipeline ne construit jamais lui-même un serveur MCP ou une identité utilisateur.

### Le modèle de sécurité de `mcpToolAdapter` : aucune logique d'autorisation dupliquée

Chaque `DynamicStructuredTool` produit par `mcpToolAdapter` n'exécute rien directement : son `invoke` appelle `mcpServer.handleMessage({ jsonrpc: "2.0", method: "tools/call", params: { name, arguments, actingUser } })` — le **même** point d'entrée que n'importe quel client MCP externe, donc soumis aux **mêmes** `ValidationManager`/`PermissionManager`/`ErrorHandler` que dans `mcp/`. Deux conséquences vérifiées par test : un `actingUser` avec un rôle insuffisant reçoit une vraie erreur `PERMISSION_DENIED` (pas de chemin de contournement côté LangChain) ; et `actingUser` est fixé une fois pour toutes à la construction du pipeline — aucune entrée de Tool ne peut l'écraser pour usurper une autre identité.

### Ce que `langchain/` ne fait toujours pas lui-même

`LangChainWorkflowEngine` exécute une liste d'étapes **déclarée à l'avance** par l'appelant (chain/tool/router, avec branches explicites) — il ne décide jamais lui-même de la prochaine étape à partir d'un raisonnement libre du LLM. `LlmPlanner` produit un plan, mais ne l'exécute pas et ne boucle pas dessus. Aucun composant de `langchain/` ne relit sa propre sortie pour décider d'itérer indéfiniment : c'est la couche au-dessus (`agents/`, voir « Les Agents spécialisés » plus bas) qui décide QUAND appeler un Planner ou construire quelles étapes — `langchain/` reste la boîte à outils, jamais le décideur.

## Le AIManager (`orchestrator/`)

### Les 7 composants demandés, et où ils vivent

| Composant | Fichier | Rôle |
|---|---|---|
| AIManager | `orchestrator/aiManager.js` | Point d'entrée d'un tour de conversation : `handleMessage({message, user, conversationId})` — comprend l'intention, sélectionne l'Agent ou les Tools, appelle LangChain, utilise le RAG lorsque nécessaire, met en forme la réponse |
| ConversationManager | `orchestrator/conversationManager.js` | Enveloppe `IConversationMemory` : enregistre chaque tour (`recordUserMessage`/`recordAssistantMessage`), lit l'historique (fenêtrée), avec des gardes `conversationId` optionnelles ; `getCurrentTopic()` suit le sujet courant SANS fenêtre — voir « Natural Conversation Engine » plus bas |
| IntentDetector | `orchestrator/intentDetector.js` (+ `intentDetector.interface.js`) | Résout un message en `Intent` structuré (`{name, moduleKey, requiresRag, requiresTools, description}`) en déléguant le choix de route à un `IRouter` (LangChain) puis en enrichissant via `intentCatalog.js` |
| ToolRouter | `orchestrator/toolRouter.js` | Réduit tous les Tools LangChain disponibles à un sous-ensemble pertinent : filtre strict par module métier, puis classement par recouvrement lexical avec le message |
| AgentRouter | `orchestrator/agentRouter.js` | Enveloppe `AgentRegistry.findHandler(intent)` (agents/) — l'`AgentRegistry` par défaut contient désormais les 11 Agents spécialisés (voir « Les Agents spécialisés » plus bas) ; retourne `null` pour une intention qu'aucun Agent ne revendique (`users`, `hr`, `por_promesh`) |
| WorkflowManager | `orchestrator/workflowManager.js` | Construit la liste de `WorkflowStep` adaptée (chain `qa` RAG-grounded, ou `tool_calling` scopé aux Tools sélectionnés) et l'exécute via `LangChainWorkflowEngine` |
| ResponseBuilder | `orchestrator/responseBuilder.js` | Met en forme une enveloppe de réponse stable, et transforme toute erreur en réponse `mode: "error"` sans jamais fuiter le détail d'une exception non typée |
| ExplanationBuilder | `orchestrator/explanationBuilder.js` | Étape "ajouter des explications si nécessaire" : calcule le champ `explanation` (déterministe, hors-ligne, phrase courte, `null` si rien à dire), câblé dans `ResponseBuilder` |
| ExplainabilityBuilder | `orchestrator/explainabilityBuilder.js` | Calcule `explainability` (TOUJOURS présent, y compris en cas d'échec/clarification) : pourquoi cette réponse, quelles données, quels AI Tools, quelles règles métier — voir « Explainability Engine » plus bas et `EXPLAINABILITY_ENGINE.md` |

`createAiOrchestrator()` (`orchestrator/pipeline.js`) n'est pas dans la liste au sens strict — c'est la racine de composition qui assemble les 7 composants, exactement comme `createLangChainPipeline()` assemble Chains/Planner/Router/Workflow Engine/Context Builder côté LangChain.

### Le workflow en 12 étapes — voir `orchestrator/WORKFLOW.md`

Le détail complet (schéma, chaque étape reliée au fichier qui l'implémente, ce qui a été ajouté lors de la passe "cerveau du Copilot") vit dans `orchestrator/WORKFLOW.md`, pour ne pas dupliquer un document déjà long. Résumé :

1. Recevoir la question (`AIManager.handleMessage`), guardée contre l'injection de prompt directe.
2-3. Détecter l'intention ET son module métier en une résolution catalogue (`IntentDetector`/`intentCatalog.js`).
4. **Vérifier les permissions** — `Intent.requiredRoles`/`allowedEmails` (optionnels) + `isAuthorized()`, avant toute construction de contexte (échec rapide).
5. Construire le contexte métier (historique + RAG le cas échéant).
6-7. Décider Tool vs RAG (`ToolRouter`/`WorkflowManager` — repli RAG délibéré si aucun Tool ne correspond).
8. Exécuter les Tools (`ToolCallingChain` → `McpServer`).
9. Fusionner les résultats (`{answer, citations, toolSteps}` → `ResponseBuilder`).
10. Générer la réponse naturelle (LLM, une fois un fournisseur branché).
11. **Ajouter des explications si nécessaire** — `explanationBuilder.js`, champ `explanation` de la réponse, `null` quand rien d'utile à dire. Voir aussi `explainabilityBuilder.js` (champ `explainability`, distinct et TOUJOURS présent — « Explainability Engine » plus bas).
12. **Journaliser la conversation** — `ConversationManager` (contexte) ET `AuditLog` optionnel (sécurité, un événement `conversation_turn` par tour).

Le cas "un Agent a été sélectionné" (étape entre 4 et 5) court-circuite `ToolRouter`/`WorkflowManager` : l'Agent reçoit l'intégralité du tour et applique sa propre liste blanche de Tools et son propre workflow (voir « Les Agents spécialisés » plus bas).

Toute erreur à n'importe quelle étape est interceptée par `AIManager.handleMessage()` et transformée en réponse `mode: "error"` via `ResponseBuilder.buildErrorResponse()` — jamais une exception qui remonte à l'appelant (voir « Clean Architecture & SOLID » plus bas pour le principe de sécurité derrière ce choix).

### Un second détecteur d'intention, autonome et scoré — `orchestrator/intentClassifier.js`

En complément d'`IntentDetector` (ci-dessus, déjà câblé dans `AIManager`), `IntentClassifier` reconnaît 15 intentions en français (10 questions par domaine métier — KPI, Projet, Commercial, RH, Maintenance, Industriel, Dashboard, Reporting, Recherche, Documentation — et 5 demandes transversales — Action, Résumé, Comparaison, Statistiques, Prévision) avec un **score de confiance** (`confidence = score de la gagnante / somme de tous les scores`). Livré comme un composant autonome, pas encore branché à la place du routeur par défaut (les deux taxonomies ne partagent pas les mêmes clés) — voir `orchestrator/INTENT_CLASSIFIER.md` pour le détail des 15 intentions, la formule de confiance, et la correspondance avec le catalogue existant.

### Pourquoi `ToolRouter` filtre en deux passes (module, puis recouvrement lexical)

Présenter les 74 Tools MCP à un LLM à chaque tour serait à la fois coûteux (chaque description entre dans le prompt) et risqué (plus un modèle a de choix, plus il se trompe de Tool). Le filtre par module (`intent.moduleKey`, dérivé du même manifeste `mcp/tools/index.js::byModule` que `ToolLoader` utilise pour peupler le vrai `McpServer` — une seule source de vérité) élimine d'abord toute possibilité structurelle qu'un Tool d'un autre module apparaisse (une intention "maintenance" ne peut jamais faire remonter un Tool RH). Le recouvrement lexical ensuite (même technique que `LexicalIntentRouter`/`LexicalOverlapReranker` — réutilise le même `tokenize`, voir `rag/embeddings/hashingEmbeddingProvider.js`) affine encore, pour un module qui compte à lui seul jusqu'à 15 Tools (maintenance).

Une intention peut aussi déclarer `relatedModules` (`intentCatalog.js`, optionnel, `[]` par défaut) pour élargir ce filtre à PLUSIEURS modules à la fois — ex. l'intention `"projects"` déclare `relatedModules: ["dashboard"]`, pour qu'une question comme « Quels projets sont en retard ? » puisse faire remonter à la fois `list_projects` (module `projects`) et `get_dashboard_kpis` (module `dashboard`), et que `ToolCallingChain` appelle les deux avant de fusionner leurs résultats dans une seule réponse. Voir `orchestrator/TOOL_ROUTER.md` pour l'exemple complet et comment la fusion des résultats de plusieurs Tools fonctionne concrètement.

### Pourquoi `AIManager` (orchestrateur) est distinct de `AiManager` (kernel)

Le kernel possède déjà un `AiManager` (`manager/aiManager.js`) : une racine de composition légère, construite sans jamais nécessiter de fournisseur LLM, qui expose `isEnabled()`/`isRoleAllowed(role)`/`getStatus()`. `AIManager` (`orchestrator/aiManager.js`) est un objet volontairement distinct et plus "lourd" : il EXIGE un pipeline LangChain pleinement configuré (`createAiOrchestrator({llmProvider, retriever, mcpServer, actingUser})`), donc un `ILlmProvider` réel — même raisonnement que `createLangChainPipeline()` ("un Chain sans vrai modèle ne produit rien d'utile"), et `createAiOrchestrator` n'est donc, comme LangChain, pas câblé dans `createDefaultAiManager()`. Fusionner les deux aurait alourdi un contrôle probablement appelé à chaque requête (`isEnabled()`/`isRoleAllowed()`) avec des dépendances qui n'ont de sens qu'une fois un tour de conversation réellement engagé — les deux coexistent donc à des niveaux différents plutôt que d'être confondus.

### La mémoire de conversation est partagée, pas dupliquée

`createAiOrchestrator()` construit (ou reçoit) une seule instance d'`IConversationMemory` et la passe à la fois à `ConversationManager` (qui y écrit chaque tour) et à `createLangChainPipeline()` — donc à `RagContextBuilder` (qui y lit l'historique pour l'injecter dans le prompt du `QaChain`). Deux instances distinctes auraient silencieusement désynchronisé "ce qui est enregistré" de "ce que le modèle voit comme historique" ; voir `test/ai.orchestrator.pipeline.test.js` pour la vérification (`pipeline.memory === pipeline.langChainPipeline.contextBuilder.memory`).

### Natural Conversation Engine — références, corrections, conversations longues, ambiguïtés (`orchestrator/conversationContextResolver.js`)

Avant la détection d'intention (étape 2), `ConversationContextResolver.resolve({message, history, currentTopic})` (activé par défaut dans `createAiOrchestrator`) détecte si un message se réfère implicitement à ce qui précède, via trois signaux combinés : un pronom explicite ("lesquels", "celui", "ça", ...), une correction/reformulation explicite ("plutôt", "finalement", "non" en tête de phrase, "voulais dire"), ou une reformulation courte sans mot-clé propre ("et les autres ?"). Si l'un est présent, retrouve le sujet — via `currentTopic` (`ConversationManager.getCurrentTopic()`, survit à la fenêtre d'historique, donc aux conversations LONGUES) en priorité, sinon en relisant le dernier tour ASSISTANT à intention connue de l'historique (jamais `"general_chat"`, le repli délibéré "aucune intention précise", pas un sujet) — pour enrichir le message avant qu'`IntentDetector`/`ToolRouter` ne le voient (ex. « Et lesquels sont en retard ? » → « ... (à propos de projet) »), sans qu'aucun de ces composants n'ait à connaître ce mécanisme. Un signal fort (référence ou correction) sans sujet résolvable (première question d'une conversation) est signalé `ambiguous: true` plutôt que deviné — `AIManager` répond alors par un nouveau `mode: "clarification"` (`ResponseBuilder.buildClarificationResponse()`), jamais une hallucination. Entièrement hors-ligne et déterministe, même philosophie que `LexicalIntentRouter`/`IntentClassifier`. Voir `orchestrator/CONVERSATION_CONTEXT.md` pour l'exemple complet, le schéma, et les trois bugs réels (faux positif sur une salutation, marqueurs à trait d'union jamais matchés, "retard" absent des marqueurs d'attention de `ProjectAgent` — l'exemple canonique routait correctement sans pour autant déclencher le vrai raisonnement métier) découverts et corrigés via les tests.

## Les Agents spécialisés (`agents/`)

### Les 11 Agents demandés, et ce qui les distingue

Chacun implémente `IAgent` via `BaseAgent` (`agents/baseAgent.js`) et possède les six propriétés demandées : **prompt système**, **Tools autorisés** (liste blanche explicite), **permissions** (rôle/e-mail), **mémoire** (historique de conversation), **workflow** (comment il utilise LangChain), **gestion des erreurs** (réponse dégradée, jamais une exception visible). Le tableau ci-dessous ne répète que ce qui change d'un Agent à l'autre.

| Agent | Intention | Tools autorisés | Permissions | Workflow |
|---|---|---|---|---|
| `AssistantAgent` | `general_chat` | Aucun | Ouvert | RAG (`qaChain`) uniquement — concierge général, réoriente vers le bon module |
| `CrmAssistantAgent` | `documentation_question` | Aucun | Ouvert | RAG (`qaChain`) uniquement — le "CRM Assistant" : guide étape par étape pour UTILISER le CRM (voir `CRM_ASSISTANT.md`), remplace `SearchAgent` (code conservé, non câblé) |
| `ProjectAgent` | `projects` | 3 (module Projects) | Ouvert (Tools mixtes, gate fin côté MCP) | Tool-calling scopé par défaut ; **raisonnement métier déterministe** sur un marqueur d'attention/priorité/risque (voir plus bas) |
| `CommercialAgent` | `commercial_contacts` | 3 (module Commercial-Contacts) | `commercial`/`admin`/`superadmin`/`superadmin2` (identique à chaque Tool du module) | Tool-calling scopé, défaut `BaseAgent` |
| `PipelineAgent` | `pipeline` | 6 (module Pipeline) | Ouvert (Tools mixtes) | Tool-calling scopé, défaut `BaseAgent` |
| `KPIAgent` | `dashboard` | 4 (module Dashboard) | Ouvert | **Raisonnement déterministe** — Dashboard intelligent : résultat, comparaison au mois précédent, pourquoi le KPI évolue, prévision heuristique, alertes réelles, données de graphique (voir `KPI_AGENT.md`) |
| `ReportingAgent` | `reporting` | Les 4 mêmes Tools que `KPIAgent` | Ouvert | **2 étapes** : `ToolCallingChain` → `SummarizationChain` — synthèse narrative, pas une réponse directe (voir plus bas) |
| `MaintenanceAgent` | `maintenance` | 15 (module Maintenance, le plus grand) | Ouvert (Tools mixtes) | Tool-calling scopé, défaut `BaseAgent` |
| `IndustrialAgent` | `industrial` | 5 (module Industrial-Records) | `admin`/`superadmin`/`superadmin2`/`responsable_logistique_achat` (identique à chaque Tool du module) | Tool-calling scopé, défaut `BaseAgent` |
| `NotificationAgent` | `notifications` | 5 (module Notifications) | Ouvert (Tools mixtes) | Tool-calling scopé, défaut `BaseAgent` |
| `AutomationAgent` | `automation` | **Aucune restriction** (tous les Tools disponibles, cross-module) | `admin`/`superadmin`/`superadmin2` (délibérément conservateur — voir plus bas) | **`LlmPlanner` → PROPOSITION** (`PendingActionStore`) → étapes `tool` exécutées via `LangChainWorkflowEngine` SEULEMENT sur confirmation explicite (« confirme »/« annule ») au tour suivant — voir `AUTOMATION_WORKFLOWS.md` |
| `BusinessAnalystAgent` | `business_analysis` | 6 (dashboard/projects/commercialContacts/maintenance, cross-module) | Ouvert | Raisonnement déterministe à 4 volets (résultat/causes/risques/recommandations) sur 8 domaines — voir `BUSINESS_ANALYST.md` |
| `RecommendationAgent` | `recommendation` | 2 (projects/maintenance) | Ouvert | Conseil proactif systématique à 7 catégories (priorités/tâches/clients/projets critiques/risques/anomalies/actions) — voir `RECOMMENDATION_AGENT.md` |
| `DataQualityAgent` | `data_quality` | 1 (`list_projects`, **lecture seule**) | Ouvert | Audit de fiabilité à 8 catégories + Score Qualité + corrections proposées, jamais appliquées — voir `DATA_QUALITY_AGENT.md` |
| `AdvancedSearchAgent` | `advanced_search` | 2 (`list_projects`/Projects, `get_commercial_contact_kpi`/Commercial-Contacts) | Ouvert | Recherches complexes multi-critères (période, seuil de montant, absence de correspondance) — voir `ADVANCED_SEARCH_AGENT.md` |

`agents/manifest.js::defaultAgentFactories` (15 entrées) + `loadDefaultAgents(agentRegistry, deps)` forment le manifeste explicite qui les construit et les enregistre — même discipline que `mcp/tools/index.js::defaultToolFactories`/`ToolLoader` : une liste réviewable dans un diff, jamais une découverte automatique de fichiers.

### `BaseAgent` : un squelette partagé, pas 11 copier-coller

Les 7 Agents "simples" (tous sauf `ProjectAgent`/`ReportingAgent`/`AutomationAgent`/`KPIAgent`/`BusinessAnalystAgent`/`RecommendationAgent`/`DataQualityAgent`/`AdvancedSearchAgent`, qui redéfinissent tous `_run()` avec un raisonnement propre) ne sont que de la **configuration** au-dessus de `BaseAgent` : un `systemPrompt`, une liste `intentNames`, une liste blanche `allowedToolNames`, et `requiredRoles`/`allowedEmails`. `BaseAgent.execute()` applique dans l'ordre :

1. **Permissions** (`utils/authorization.js::isAuthorized` — le MÊME prédicat que `mcp/permissionManager.js`, extrait pour ne pas dupliquer la logique de rôle CRM une troisième fois) : refuse avec `AgentPermissionError` AVANT toute construction de Chain — une erreur de permission reste visible, jamais absorbée en réponse dégradée.
2. **Mémoire** : si `conversationId` et `memory` sont fournis, lit l'historique récent (`IConversationMemory.getHistory`) et l'injecte dans l'instruction envoyée au modèle.
3. **Workflow par défaut** (`_run()`) : construit un `ToolCallingChain` scopé aux Tools de `allowedToolNames` réellement disponibles (jamais tout le pool) et l'exécute via `LangChainWorkflowEngine` ; si aucun Tool n'est disponible, retombe sur `qaChain` (RAG) — pour `AssistantAgent`/`CrmAssistantAgent`, `allowedToolNames: []` force systématiquement ce repli.
4. **Gestion des erreurs** : toute erreur levée par `_run()` (Chain, Tool, Planner) est absorbée et transformée en réponse en langage naturel, honnête sur l'échec, sans détail interne — jamais une exception qui atteint l'utilisateur final. Seule la vérification de permission (étape 1) fait exception à cette règle.

`ReportingAgent` et `AutomationAgent` redéfinissent `_run()` avec un workflow différent (voir ci-dessous) mais héritent du reste (permissions, mémoire, gestion des erreurs) sans dupliquer ce code.

### Pourquoi `ReportingAgent` et `KPIAgent` partagent leurs Tools mais pas leur workflow

Les deux consomment le même module Dashboard (4 Tools), mais pas de la même façon. `ReportingAgent` enchaîne un `ToolCallingChain` puis une **deuxième étape** — le `SummarizationChain` déjà livré lors de l'intégration LangChain (`langchain/chains/summarizationChain.js`) — pour transformer la sortie brute du premier appel en synthèse narrative ÉCRITE PAR LE MODÈLE. Ce cas démontre que `LangChainWorkflowEngine` fait circuler l'état d'une étape `chain` vers la suivante (`buildInput` de l'étape 2 lit `state.raw` produit par l'étape 1 — déjà couvert par `test/ai.langchain.workflowEngine.test.js`, "threads state through multiple sequential chain steps").

`KPIAgent`, lui, n'appelle plus JAMAIS le modèle de langage : son `_run()` est entièrement déterministe (même famille que `BusinessAnalystAgent`/`RecommendationAgent`/`DataQualityAgent`) — voir la sous-section dédiée ci-dessous.

### KPIAgent — Dashboard intelligent : analyses, comparaisons, prévisions, alertes, graphiques (`agents/kpiAgent.js`)

Pour TOUTE question qui atteint l'intention `dashboard` (même discipline que `RecommendationAgent`/`DataQualityAgent` — un tableau de bord ne se construit pas à la carte), `KPIAgent` construit systématiquement 6 volets : Résultat (`reasoning/businessAnalyzer.js::analyzeKpiDomain`, réutilisé, jamais une 2e logique de scoring), Comparaison au mois précédent, explication de **pourquoi** le KPI augmente/diminue (présentée comme une corrélation possible avec les causes déjà identifiées, JAMAIS une causalité affirmée — aucun Tool ne relie un chiffre de cause à un mois précis), Prévision (tendance heuristique des 3 derniers mois, explicitement étiquetée comme telle), Alertes (risques déjà identifiés + l'objet `alerts` réel de `get_professional_dashboard`), et Graphique (`{labels, series}`, dérivé de la même série). Toute comparaison/prévision/graphique repose EXCLUSIVEMENT sur la seule série multi-points réellement stockée côté CRM — une répartition des projets par mois de création (`charts.monthlyEvolution`/`myMonthlyEvolution` de `get_dashboard_kpis`) — car aucun Tool ne conserve d'instantané périodique des KPI ; une métrique instantanée isolée (ex. `myRelancesLate`) n'est donc jamais comparée ni projetée, seulement rapportée telle quelle. `get_user_dashboard` (répartition produit) et `get_professional_dashboard` (alertes réelles) enrichissent la réponse en meilleur effort, sans faire échouer le reste si refusés ; `get_legacy_dashboard_kpis` (vue historique/entonnoir) n'est appelé que si le message contient un marqueur LOCAL à cet Agent (`historique`, `entonnoir`, `legacy` — même mécanisme que `ProjectAgent.ATTENTION_MARKERS`). Voir `orchestrator/KPI_AGENT.md` pour la correspondance exacte volet → Tool → champs consommés et les limites assumées (pas un modèle statistique, pas de causalité prouvée, pas de rendu graphique — seulement les données).

### `AutomationAgent` : le seul Agent piloté par un Planner, et le seul dont l'exécution attend une confirmation explicite

Une automatisation ("crée une demande de maintenance ET préviens le technicien") peut légitimement traverser plusieurs modules en une seule demande — contrairement aux 14 autres Agents, restreindre `AutomationAgent` à une liste blanche de Tools n'aurait aucun sens. Son `_run()` appelle `planner.plan(message, {availableTools})` (`LlmPlanner`, déjà livré côté LangChain) mais NE CONFIE PLUS chaque étape retenue à `LangChainWorkflowEngine` immédiatement : le plan devient une PROPOSITION, stockée dans `PendingActionStore` (`orchestrator/pendingActionStore.js`, un collaborateur construit UNE FOIS dans `pipeline.js` et partagé, comme `SuggestionEngine`) pour cette conversation — l'exécution réelle (`{type: "tool", ...}` confiée à `LangChainWorkflowEngine`, le seul Agent qui exerce le chemin `_runToolStep` du moteur de workflow) n'a lieu qu'au tour SUIVANT, si (et seulement si) ce tour contient « confirme »/« confirmer » ; « annule »/« annuler » retire la proposition sans jamais l'exécuter. Cinq actions concrètes sont couvertes (création d'activité/de rappel via le nouveau Tool `create_project_action`, création de rendez-vous via `create_calendar_event`, préparation d'un email via `send_notification_email` — où la confirmation joue elle-même le rôle de validation du brouillon — génération d'un rapport via `get_dashboard_kpis`) — voir `AUTOMATION_WORKFLOWS.md` pour le cycle complet et pourquoi c'est une garantie STRUCTURELLE (`_propose()` n'appelle physiquement jamais un Tool), pas une promesse de prompt. Le contrepoids à l'absence de restriction de Tools reste une **permission plus stricte** (`admin`/`superadmin`/`superadmin2` uniquement) plutôt qu'un filtrage de Tools — chaque Tool individuellement appelé reste de toute façon encore soumis à sa propre vérification de permission via `mcpToolAdapter`/`McpServer`. Un plan sans étape exécutable (Tool inconnu, ou un `PlanningError`) dégrade gracieusement en une réponse honnête plutôt que d'échouer.

### CrmAssistantAgent — le CRM Assistant, premier Agent métier (`agents/crmAssistantAgent.js`)

Distinct des 14 autres Agents (qui répondent sur les DONNÉES du CRM) : le CRM Assistant répond sur l'USAGE du CRM — « Comment créer un projet ? », « Comment envoyer un devis ? » — étape par étape, en citant les champs et boutons exacts de l'écran concerné, sans jamais interroger une donnée métier réelle (aucun Tool autorisé). Sa base de connaissances (`docs/user-guide/`, 6 guides) a été rédigée en croisant le vrai code Flutter (`Dash Master Toolkit/lib/`) et le vrai code serveur (routes/modèles), jamais devinée — une démarche qui a d'ailleurs révélé une vraie incohérence produit (documentée, pas corrigée : des valeurs proposées par l'écran pour l'étape du pipeline commercial ne font pas partie de l'ENUM accepté par le serveur). Remplace `SearchAgent` (générique, code conservé mais non câblé) pour l'intention `documentation_question`. Voir `orchestrator/CRM_ASSISTANT.md` pour la méthodologie complète.

### BusinessAnalystAgent — analyser les données du CRM, jamais en inventer une (`agents/businessAnalystAgent.js`)

Le 12e Agent : pour CHAQUE réponse, une structure à 4 volets — Résultat, Causes, Risques, Recommandations — sur 8 domaines (KPI, projets, ventes, pipeline, devis, activités, interventions, performance), calculée par `reasoning/businessAnalyzer.js` à partir de la sortie de 6 Tools MCP déjà existants (`get_dashboard_kpis`, `get_professional_dashboard`, `list_projects`, `get_commercial_contact_kpi`/`_analytics`, `get_maintenance_stats`) — jamais un nouveau Tool créé. Le domaine "Projets" réutilise intégralement `ProjectAttentionAnalyzer`/`dataCoherenceChecker` (Business Reasoning, ci-dessous) plutôt que de dupliquer la logique de scoring. Le domaine "Devis" n'a AUCUN Tool existant qui l'alimente (vérifié) — plutôt que d'inventer un chiffre, l'Agent le dit explicitement (`supported: false`), la garantie "ne jamais inventer une donnée" rendue concrète. Voir `orchestrator/BUSINESS_ANALYST.md` pour la correspondance exacte domaine → Tool → champs consommés.

### RecommendationAgent — le Copilot devient un conseiller (`agents/recommendationAgent.js`)

Le 13e Agent : contrairement à `BusinessAnalystAgent` (qui explique un domaine CHOISI par l'utilisateur), celui-ci CONSEILLE de façon proactive et SYSTÉMATIQUE — 7 catégories à chaque réponse (priorités, tâches importantes, clients à relancer, projets critiques, risques, anomalies, actions recommandées), jamais une sélection par mots-clés du message. Ne recalcule RIEN : `reasoning/recommendationEngine.js` reclasse les `factors`/`dataQuality` déjà produits par `ProjectAttentionAnalyzer`/`dataCoherenceChecker` (une catégorie = une règle de filtrage sur ces mêmes données), et les "actions recommandées" viennent directement de `SuggestionEngine` (Smart Suggestions, permission-filtrées, rien d'exécutable). "Clients à relancer" est un proxy assumé (relance de PROJET, faute d'un Tool exposant les relances par contact commercial) — documenté, pas découvert après coup. Voir `orchestrator/RECOMMENDATION_AGENT.md` pour la distinction complète avec `BusinessAnalystAgent` et la justification de chaque règle.

### DataQualityAgent — détecter, noter, proposer, jamais modifier (`agents/dataQualityAgent.js`)

Le 14e Agent : audite la FIABILITÉ des données (doublons, informations manquantes, emails/téléphones invalides, documents manquants, incohérences, erreurs de workflow, données orphelines), calcule un Score Qualité, et PROPOSE des corrections — texte descriptif uniquement, jamais appliqué. La garantie "ne jamais modifier automatiquement" est STRUCTURELLE, pas une promesse de prompt : `ALLOWED_TOOL_NAMES` ne contient qu'UN SEUL Tool, en lecture seule (`list_projects`) — aucun Tool d'écriture (`move_project_stage`, `assign_project_owner`) n'est même accessible à cet Agent, quoi que le modèle de langage puisse "décider". Les règles emails/téléphones réutilisent EXACTEMENT les mêmes expressions régulières que le serveur (`routes/projects.routes.js`) — jamais une validation qui pourrait diverger de ce qu'il accepte réellement ; "incohérences" réutilise intégralement `dataCoherenceChecker.js`. A nécessité d'exposer 4 champs déjà chargés mais jamais renvoyés par `list_projects` (`emailIngenieur`/`emailArchitecte`/`telephoneIngenieur`/`telephoneArchitecte`) — même précédent additif que `dateLimiteIngenieur`. Voir `orchestrator/DATA_QUALITY_AGENT.md` pour la règle exacte de chaque catégorie et la formule du Score Qualité.

### AdvancedSearchAgent — le "Search Agent" : recherches complexes, plusieurs AI Tools (`agents/advancedSearchAgent.js`)

Le 15e Agent : comprend des critères de recherche complexes en langage naturel — période ("créés en juin"), seuil de montant ("dépassent 50 000 €"), absence de correspondance ("n'ont jamais acheté") — et les vérifie en combinant **2 Tools de 2 modules différents** (`list_projects`/Projects, `get_commercial_contact_kpi`/Commercial-Contacts), jamais un Tool créé pour l'occasion. `reasoning/searchQueryParser.js` interprète chaque critère (mois français + année optionnelle → plage `dateFrom`/`dateTo` réelle ; montant en euros → seuil filtré sur des données déjà réelles, `list_projects` n'ayant aucun filtre serveur sur `montantMarche`). La garantie "ne jamais inventer" est poussée jusqu'à la distinction entre un Tool manquant et une DONNÉE manquante : aucun montant n'est stocké pour un devis dans ce CRM (`ProjectDevis` ne contient qu'un fichier) — l'Agent le dit explicitement puis propose, clairement étiquetée comme différente, la même recherche sur le montant du marché (une donnée contractuelle) ; "clients n'ayant jamais acheté" n'a, lui, aucune alternative honnête (aucun Tool ne liste les contacts commerciaux individuellement). "Commerciaux sans activité cette semaine" est un PROXY documenté (dernière mise à jour d'une fiche contact commercial, pas "toute activité"), disponible seulement pour un appelant admin-tier. Distinct de `searchAgent.js` (RAG documentaire générique, toujours présent mais non câblé, voir ci-dessus) : celui-ci interroge les DONNÉES du CRM, pas sa documentation. Voir `orchestrator/ADVANCED_SEARCH_AGENT.md` pour la correspondance exacte critère → Tool → champs consommés.

### Explainability Engine — pourquoi, quelles données, quels Tools, quelles règles métier (`orchestrator/explainabilityBuilder.js`)

`response.explainability` est TOUJOURS présent (jamais `null`, y compris `mode: "error"`/`"clarification"` — être transparent inclut d'expliquer un refus, pas seulement un succès), distinct de l'ancien `explanation` (conservé, plus étroit : juste "quel Agent/Tool"). Répond aux 4 questions demandées : `reasoning` (pourquoi), `dataUsed` (quelles données, un résumé structurel honnête par Tool réel — jamais un sens métier deviné), `toolsCalled` (quels AI Tools, dédupliqués), `businessRules` (quelles règles métier). La distinction clé vit dans `toolSteps` : une entrée marquée `synthetic: true` + une `description` française (déjà écrite par l'Agent qui connaît le sens de son propre calcul) représente une étape de RAISONNEMENT, pas un Tool MCP réel — `ProjectAgent`/`DataQualityAgent` le faisaient déjà (`analyze_project_attention`/`analyze_data_quality`) ; `KpiAgent`/`BusinessAnalystAgent`/`RecommendationAgent` ont été alignés sur ce même pattern (`analyze_kpi_trends`, `analyze_business_domain` — une par domaine analysé —, `generate_recommendations`) pour que les 5 Agents à raisonnement déterministe exposent leurs règles de façon uniforme, plutôt que 2 sur 15 seulement. Voir `orchestrator/EXPLAINABILITY_ENGINE.md` pour le détail complet, y compris ce qui a délibérément été laissé hors périmètre (pas de résumé du CONTENU métier d'un Tool, pas d'identifiant de règle au niveau `reasoning/*.js`).

### Business Reasoning — `ProjectAgent` raisonne, il ne fait pas que répondre (`reasoning/`)

« Quels projets nécessitent une attention ? » ne suit pas le chemin tool-calling-puis-LLM habituel : `ProjectAgent` redéfinit `_run()` pour détecter un marqueur d'attention/priorité/risque dans le message et, si présent, appelle `list_projects` (le même Tool MCP réel — jamais un accès direct à un service CRM, `test/ai.agents.policy.test.js` le vérifie mécaniquement) puis passe les projets renvoyés à `ProjectAttentionAnalyzer.analyzeProjectAttention()` (`reasoning/projectAttentionAnalyzer.js`) : un moteur de règles, entièrement hors-ligne, qui note chaque projet sur **6 dimensions réelles** — retard (relance dépassée), budget (montant marché non renseigné ou élevé avec avancement faible), activité (aucune mise à jour récente), échéances (date limite ingénieur), pipeline (sans étape, ou bloqué dans une étape ouverte), blocages (dernière action non terminée et en retard) — puis classe l'ensemble des projets par priorité (`critique`/`elevee`/`moyenne`/`faible`). `buildAttentionAnswer()` (`reasoning/attentionAnswerBuilder.js`) met ce classement en mots SANS second appel au modèle de langage : les raisons sont déjà des faits calculés, les reformuler via un LLM n'ajouterait qu'un risque de dérive, jamais d'information. Voir `reasoning/BUSINESS_REASONING.md` pour la règle exacte de chaque dimension, les seuils exportés (`DEFAULT_BUSINESS_RULES`), un exemple travaillé chiffré, et les limites assumées (notamment : `Project` ne porte aucun champ "budget consommé", seulement le montant contractuel).

### Smart Suggestions — proposer des actions sans jamais les exécuter (`orchestrator/suggestionEngine.js`)

Après avoir classé les projets par attention (voir ci-dessus), `ProjectAgent` peut aussi PROPOSER des actions concrètes (« Créer une activité », « Préparer un email », « Programmer une réunion », « Créer un rappel » pour un projet en retard) — sans jamais en exécuter aucune. `SuggestionEngine.suggestForFactors(factors, actingUser)` (`orchestrator/suggestionEngine.js`) prend l'union des `factors` des projets signalés, résout chaque action candidate du catalogue (`orchestrator/suggestionCatalog.js`) via `isAuthorized()` — pour une action adossée à un vrai Tool MCP (`create_calendar_event`, `send_notification_email`), la permission est résolue DYNAMIQUEMENT depuis ce Tool réel (`toolPermissionIndex`, construit une fois dans `pipeline.js` à partir du même manifeste `mcp/tools` que `ToolRouter`, jamais dupliquée) — et écarte silencieusement toute action refusée : jamais montrée, jamais "grisée". Le résultat est une liste purement descriptive (`{id, label, reason}`) : `SuggestionEngine` ne détient et n'appelle aucun Tool exécutable, il est donc structurellement impossible qu'une suggestion déclenche une action. Voir `orchestrator/SMART_SUGGESTIONS.md` pour le catalogue complet, le mapping dimension → actions, et les écarts assumés (deux des quatre actions de l'exemple — créer une activité, créer un rappel — n'ont encore aucun Tool MCP dédié ; leur permission reflète la règle réelle de la route CRM qu'elles représentent).

### Le Copilot comme collaborateur professionnel — vérifier la cohérence des données, poser une question si des informations manquent

Deux garanties supplémentaires, demandées explicitement pour que le Copilot "agisse comme un collaborateur expérimenté" et ne mentionne jamais rien qu'il ne peut vérifier — voir `orchestrator/WORKFLOW.md`, section "Le Copilot comme collaborateur professionnel", pour le mapping complet contre le workflow en 12 étapes :

- **Vérifier la cohérence des données** — `reasoning/dataCoherenceChecker.js::checkProjectsCoherence()` signale les fiches projet incomplètes (réutilise `completionRate`/`missingFields`, déjà calculés côté CRM mais jusqu'ici jamais consommés par le Copilot) et deux incohérences logiques (étape "gagnée" avec avancement < 100 %, budget renseigné sans aucun avancement suivi). Câblé dans `ProjectAgent`, exposé sous `dataQuality` dans la réponse. Voir `reasoning/BUSINESS_REASONING.md`.
- **Poser une question complémentaire si des informations manquent** — `orchestrator/missingInfoDetector.js` détecte, dans `toolSteps`, le motif d'échec de validation Joi `"<champ>" is required` (un appel de Tool refusé faute d'un champ requis) et construit une question de relance en français — câblé UNE FOIS, génériquement, dans `ResponseBuilder.build()` (champ `followUpQuestion`, `null` si rien ne manque) : s'applique à N'IMPORTE QUEL Agent/Workflow, pas seulement `ProjectAgent`. Un filet de sécurité déterministe et testable, complémentaire au principe déjà posé dans `RESPONSE_PROMPTS.md` ("dis-le explicitement" si une information manque) — celui-ci dépendait entièrement du modèle, celui-ci ne dépend d'aucun modèle.

### Pourquoi `users`, `hr` et `por_promesh` n'ont pas d'Agent dédié

Les 11 Agents demandés ne couvrent pas les 13 intentions du catalogue (`orchestrator/intentCatalog.js`) : `users`, `hr` et `por_promesh` n'en ont volontairement pas. `AgentRouter.select()` retourne `null` pour ces trois intentions, et `AIManager` retombe sur `WorkflowManager`/`ToolRouter` — le chemin générique Tool-calling/RAG qui existait déjà avant qu'aucun Agent ne soit construit (voir « Le AIManager » plus haut). Rien n'empêche d'ajouter un `UsersAgent`/`HRAgent`/`PorPromeshAgent` plus tard en suivant exactement le même patron (`BaseAgent` + config + entrée dans `agents/manifest.js`).

## La mémoire conversationnelle (`memory/`)

### Les 5 composants demandés, et ce qui les distingue

Chaque composant répond à une question différente — "combien de temps ça vit" et "à quoi c'est rattaché" — plutôt que d'être 5 variations sur le même stockage.

| Composant | Rattaché à | Durée de vie | Contenu |
|---|---|---|---|
| `ShortTermMemory` | une conversation | TTL glissant (30 min par défaut), plafonné (50 messages) | Le transcript brut (qui a dit quoi) — implémente le port `IConversationMemory` déjà existant |
| `SessionMemory` | une session utilisateur | TTL glissant (1h par défaut), rafraîchi à chaque `touchSession`/`updateSession` | L'enveloppe de session (depuis quand, dernière activité, quelle conversation) |
| `ContextMemory` | une conversation | TTL glissant (30 min par défaut) | Des slots nommés et **écrasables** représentant le focus courant (`{lastModule, lastEntityId}`) — pas un journal, un tableau blanc |
| `LongTermMemory` | un utilisateur | Aucun TTL par défaut (durable) | Des faits arbitraires que le Copilot déduit et retient (`remember`/`recall`) |
| `PreferenceMemory` | un utilisateur | Aucun TTL par défaut (durable) | Des préférences que l'utilisateur règle explicitement (langue, verbosité, ...) |

`ShortTermMemory` est un **remplacement direct** d'`InMemoryConversationMemory` : même port `IConversationMemory` (`append`/`getHistory`/`clear`), donc utilisable tel quel partout où ce port est déjà consommé (`ConversationManager`, `RagContextBuilder`, `BaseAgent`) sans changer un seul appelant — voir `test/ai.orchestrator.pipeline.test.js`, "accepts a Redis-backed ShortTermMemory as a drop-in 'memory'". Les 4 autres composants sont des capacités **nouvelles**, construites et testées de façon autonome (voir « Prochaines étapes » plus bas pour leur câblage futur dans `orchestrator/`/`agents/`).

### "Utiliser Redis" — un seul port, deux adaptateurs

Aucune des 5 classes ne parle au client `redis` directement : chacune dépend d'un unique port bas niveau, `IKeyValueStore` (`memory/keyValueStore.interface.js`) — get/set/delete/expire (chaînes), pushToList/getList (listes), hashGet/hashSet/hashGetAll/hashDelete (tables de hachage). Deux implémentations :

- **`RedisKeyValueStore`** (`memory/redis/`) — l'adaptateur demandé, par-dessus un client `redis` v4 (le client officiel, choisi pour son API promises-natives et sa compatibilité CommonJS — voir « Pourquoi `redis` v4 » plus bas). Ne sérialise jamais du JSON elle-même : une valeur est une chaîne, telle quelle, exactement le type natif d'une valeur Redis — c'est aux 5 classes de mémoire de sérialiser/désérialiser ce qu'elles y stockent.
- **`InMemoryKeyValueStore`** (`memory/inMemoryKeyValueStore.js`) — un fake pour les tests et le dev offline (mêmes garanties de TTL/plafond qu'une vraie instance Redis, sans jamais ouvrir de socket). **Les 40 tests unitaires des 5 classes de mémoire tournent contre ce fake** (`test/ai.memory.{shortTermMemory,sessionMemory,contextMemory,longTermMemory,preferenceMemory}.test.js`) — aucun ne nécessite un serveur Redis réel, même discipline que `test/ai.rag.retrievalService.test.js` (un `{embed, query}` factice au lieu d'une vraie base vectorielle).

`RedisKeyValueStore` elle-même est testée contre un **client `redis` factice** (`test/ai.memory.redisKeyValueStore.test.js`, 18 tests) — vérifie que chaque appel traduit exactement la bonne commande Redis (`rPush`+`lTrim`+`expire`, `hSet`+`expire`, `set` avec `{EX: ttlSeconds}`, ...), toujours sans serveur réel. Un dernier fichier, `test/ai.memory.redisIntegration.test.js`, tente une connexion à un **vrai** serveur Redis (`REDIS_URL`) et **s'auto-désactive** (chaque test devient un no-op documenté, avec un avertissement clair) si aucun serveur n'est joignable — la suite reste verte sur une machine sans Redis installé, tout en pouvant prouver l'intégration réelle sur une machine qui en a un.

### Pourquoi `redis` v4 (le client officiel)

Le client npm officiel `redis` (v4) a été retenu plutôt qu'une alternative comme `ioredis` : API 100% basée sur des Promises (cohérent avec tout le reste du kernel, entièrement `async`/`await`), CommonJS-compatible (`require`, comme tout ce dépôt), et déjà l'implémentation de référence utilisée par la documentation officielle de Redis. Aucune fonctionnalité avancée (cluster, sentinel, pub/sub) n'est utilisée ici — seulement les commandes string/liste/hash de base — donc aucune des différences entre clients ne pesait dans la décision.

### `hashMemoryBase.js` : un helper interne, pas un sixième port

`LongTermMemory`, `ContextMemory` et `PreferenceMemory` sont, en dessous, la même chose : "un sac de champs JSON nommés sous une clé de bucket, avec un TTL optionnel appliqué à tout le bucket" — seule la convention de construction de la clé (`ltm:user:{userId}` / `ctx:conv:{conversationId}` / `pref:user:{userId}`) et le TTL diffèrent. Cette logique commune est factorisée une seule fois dans `createHashBucket()` (composition, pas héritage — chacune des 3 classes garde son propre port nommé et ses propres noms de méthode) plutôt que réimplémentée trois fois — même raisonnement DRY que `utils/authorization.js` (déjà partagé entre `PermissionManager` et `BaseAgent`).

### Pourquoi certains TTL sont glissants et d'autres nuls

`ShortTermMemory`/`ContextMemory` (liées à une conversation) et `SessionMemory` (liée à une session) rafraîchissent leur TTL à chaque écriture — une conversation active ne doit jamais expirer en plein milieu, mais une conversation abandonnée doit disparaître d'elle-même. `LongTermMemory`/`PreferenceMemory` n'ont **aucun TTL par défaut** (`memory/config.js` : `MEMORY_LONG_TERM_TTL_SECONDS`/`MEMORY_PREFERENCE_TTL_SECONDS` valent `0`, explicitement traduit en `null`, jamais en "expire dans 0 seconde") — "long terme" perdrait tout son sens avec une expiration implicite. Un TTL peut y être configuré explicitement (ex. purge RGPD après N jours), mais ce n'est jamais le comportement par défaut.

### Ce que `createRedisMemoryPipeline()` ne fait pas tout seul

Construire le pipeline (`createRedisMemoryPipeline({env})`) ne fait aucune I/O — même discipline que `createRagPipeline()`/`createLangChainPipeline()`/`createAiOrchestrator()` : `createRedisClient()` ne fait que configurer un client `redis` (comme `new Sequelize(...)` dans `src/db.js`), il n'ouvre aucun socket. `pipeline.connect()`/`pipeline.disconnect()` sont les étapes explicites, idempotentes (`client.isOpen` évite un double `connect()`), qui ouvrent/ferment réellement la connexion — jamais déclenchées implicitement par la simple construction du pipeline.

## Les automatisations IA (`automations/`)

### Les 8 automatisations demandées, et où elles vivent

| Automatisation | Fichier | Rôle | Tools appelés |
|---|---|---|---|
| Création automatique | `autoCreationAutomation.js` | Crée par lot des fiches CRM en dispatchant vers le bon `create_*` Tool selon `recordType` | `create_maintenance_request`, `create_industrial_record`, `create_por_promesh`, `create_pipeline_stage`, `create_hr_request` |
| Rappels | `reminderAutomation.js` | Liste des éléments en attente, retient ceux qui sont dus, envoie un rappel pour chacun | Tools de liste configurés + `send_notification_email` |
| E-mails | `emailAutomation.js` | Envoie par lot des e-mails déjà entièrement spécifiés (digest, alerte) | `send_notification_email` |
| Notifications | `notificationHousekeepingAutomation.js` | Marque tout comme lu (optionnel) puis supprime les notifications obsolètes | `list_my_notifications`, `mark_all_notifications_read`, `delete_notification` |
| Google Calendar | `googleCalendarAutomation.js` | Vérifie la connexion puis crée un événement par lot sur le calendrier de l'`actingUser` | `get_calendar_status`, `create_calendar_event` |
| Analyses automatiques | `analysisAutomation.js` | Interroge plusieurs Tools de lecture/KPI pour produire un instantané périodique | `get_dashboard_kpis`, `get_maintenance_stats`, `get_commercial_contact_analytics`, `get_por_promesh_dashboard` (configurable) |
| Recommandations | `recommendationAutomation.js` | Applique des règles de lecture seule sur des éléments listés pour faire émerger un insight humain | Tools de liste configurés (aucune écriture) |
| Qualité des données | `dataQualityAutomation.js` | Détecte des problèmes (champ manquant, doublon) sur un ensemble complet d'éléments lus | Tools de liste configurés (aucune écriture) |

`agents/manifest.js`-style : `automations/manifest.js::defaultAutomationFactories` (8 entrées) + `createDefaultAutomations(deps)` forment le manifeste explicite, mais retournent une **Map nom → instance** plutôt qu'un registre `canHandle()`/`findHandler()` — contrairement aux Agents, une automatisation n'est jamais choisie à partir d'une intention détectée dans un message : elle est déclenchée explicitement, par nom, par un ordonnanceur ou une action admin.

### `BaseAutomation` : Tools autorisés + permissions, comme `BaseAgent`, mais une gestion des erreurs différente

Les 8 automatisations héritent de `BaseAutomation` (Tools autorisés en liste blanche, permissions rôle/e-mail via `utils/authorization.js` — même prédicat que `PermissionManager`/`BaseAgent`, jamais réimplémenté une troisième fois). La différence avec `BaseAgent` : une automatisation traite typiquement **plusieurs éléments par exécution** (plusieurs demandes en retard, plusieurs e-mails, plusieurs événements de calendrier), donc `run()` ne lève jamais pour un échec métier sur UN élément — il résout toujours vers `{success, automation, actions, errors, startedAt, finishedAt}`, l'échec d'un élément atterrissant dans `errors` sans empêcher les suivants d'être tentés. Seule une permission refusée reste une exception visible (`AutomationPermissionError`), levée AVANT que quoi que ce soit ne soit tenté — même choix que `AgentPermissionError` côté Agents.

### La contrainte centrale : "Toutes les automatisations doivent utiliser les AI Tools existants"

Chaque automatisation reçoit ses `tools` (les mêmes objets `DynamicStructuredTool` que les Agents et LangChain — voir `langchain/tools/mcpToolAdapter.js`) par injection, et `BaseAutomation._callTool()` refuse d'appeler un Tool hors de la liste blanche de l'automatisation (`UnknownAutomationToolError`). Trois niveaux garantissent la règle, comme pour chaque autre sous-système de ce kernel :

1. **Séparation architecturale** — aucun fichier sous `automations/` n'importe un modèle Sequelize, `sequelize`, un service métier, ni même le manifeste `mcp/tools/index.js` (une automatisation ne doit jamais chercher un Tool elle-même — seulement utiliser ceux qu'on lui a donnés).
2. **Un seul chemin d'appel** — `_callTool()` est le SEUL endroit sous `automations/` qui appelle `tool.invoke(...)` (vérifié mécaniquement, voir plus bas) : aucune automatisation ne contourne la liste blanche en appelant un Tool directement.
3. **Application mécanique** — `test/ai.automations.policy.test.js` lit le code source de chaque fichier et échoue si l'un d'eux référence un modèle, `sequelize`, un service métier, le manifeste `mcp/tools`, du SQL brut, un appel HTTP sortant, ou un `.invoke(...)` en dehors de `baseAutomation.js`. Symétrique de `test/ai.mcp.tools.policy.test.js` (qui impose l'inverse aux Tools : ils DOIVENT appeler un service) et de `test/ai.agents.policy.test.js` (même garantie côté Agents).

### Pourquoi un module Tool Google Calendar a dû être ajouté (décision produit)

`GoogleCalendarAutomation` a exposé une vraie tension : le service Google Calendar existait déjà dans le CRM, mais aucun Tool MCP ne l'enveloppait. Plutôt que de laisser cette automatisation contourner la contrainte (appeler le service directement) ou rester une coquille vide, 4 Tools ont été ajoutés au catalogue MCP (voir « Google Calendar : un module ajouté... » plus haut) — décision validée explicitement avant implémentation. Une automatisation qui aurait besoin d'une capacité CRM non encore exposée en Tool devrait suivre le même chemin : ajouter le Tool manquant (extraction fidèle d'un service déjà existant), jamais contourner la couche Tools.

### Pourquoi certaines automatisations sont en lecture seule et d'autres agissent

`AnalysisAutomation`/`RecommendationAutomation`/`DataQualityAutomation` ne font QUE lire (aucun Tool d'écriture dans leur liste blanche) — elles produisent un rapport ou un insight destiné à un humain, jamais une action CRM automatique. `AutoCreationAutomation`/`ReminderAutomation`/`EmailAutomation`/`GoogleCalendarAutomation` agissent réellement (créent une fiche, envoient un e-mail, créent un événement). Cette distinction est délibérée : une recommandation ("cette demande critique est en attente depuis longtemps") reste une suggestion qu'un humain décide de suivre ou non, alors qu'un rappel envoie réellement un e-mail — la frontière entre "informe" et "agit" est explicite dans le choix des Tools autorisés de chaque automatisation, pas une nuance de prompt.

### Ce que `createAutomationsPipeline()` ne fait pas

Comme `createLangChainPipeline()`/`createAiOrchestrator()`, ce pipeline exige un `mcpServer` et un `actingUser` réels — toute capacité qu'une automatisation peut atteindre est fixée à CETTE identité à la construction (`createMcpToolAdapters({mcpServer, actingUser})`, le même mécanisme que les Agents et LangChain, jamais un second système d'autorisation). L'`actingUser` passé à `automation.run({actingUser, ...})` ne fait que déterminer si CET appelant a le droit de déclencher l'automatisation (voir `BaseAutomation`) — il ne change jamais l'identité sous laquelle les Tools sous-jacents s'exécutent. Une automatisation censée agir pour le compte de plusieurs utilisateurs différents (ex. synchroniser le calendrier Google de chaque commercial) doit donc être invoquée une fois par utilisateur concerné, avec un pipeline construit pour cet utilisateur — jamais un mécanisme d'emprunt d'identité au sein d'une seule exécution.

## Le Dashboard IA (`dashboard/`)

### Les 7 domaines analysés, et les 6 catégories d'insights affichées

Une seule classe, `DomainAnalyzer` (`dashboard/domainAnalyzer.js`), configurée 7 fois — pas 7 sous-classes quasi identiques (même raisonnement que `BaseAgent`/`BaseAutomation` : ce qui change d'un domaine à l'autre est la DONNÉE — quels Tools lire, quelles règles appliquer — jamais du code).

| Domaine | Fichier | Tools de lecture utilisés | Catégories peuplées par défaut |
|---|---|---|---|
| Projets | `projectsAnalyzer.js` | `list_projects` | risks, dataQuality, recommendations, forecasts |
| Pipeline | `pipelineAnalyzer.js` | `list_pipeline_stages` | anomalies, dataQuality, recommendations |
| Ventes | `salesAnalyzer.js` | `get_commercial_contact_kpi`, `get_commercial_contact_analytics` | alerts, anomalies, recommendations |
| Maintenance | `maintenanceAnalyzer.js` | `list_all_maintenance_requests` | alerts, risks, recommendations, forecasts |
| RH | `hrAnalyzer.js` | `list_hr_requests` | alerts, dataQuality, recommendations |
| Industriel | `industrialAnalyzer.js` | `list_industrial_records` | dataQuality, anomalies, risks |
| KPI | `kpiAnalyzer.js` | `get_dashboard_kpis`, `get_por_promesh_dashboard` | alerts, forecasts, recommendations |

Chaque domaine ne peuple pas forcément les 6 catégories (un rapport de pipeline n'a par exemple pas de prévision par défaut) — mais les 6 catégories demandées (`alerts`, `recommendations`, `anomalies`, `forecasts`, `risks`, `dataQuality`, voir `CATEGORIES` dans `domainAnalyzer.js`) sont chacune peuplée par au moins deux domaines différents, et `DashboardService` les agrège toutes dans `summary` quel que soit le domaine d'origine.

### Comment `DomainAnalyzer` produit un insight

`analyze({actingUser})` : (1) vérifie la permission (`requiredRoles`/`allowedEmails`, même prédicat `utils/authorization.js` que `BaseAgent`/`BaseAutomation`) ; (2) appelle chaque `dataSource` déclarée (un Tool de lecture existant, jamais plus) et récupère ses données sous une clé nommée ; (3) exécute chaque `rule` (une fonction pure par insight potentiel, rangée dans l'une des 6 catégories) contre ces données. Une règle qui lève, ou un Tool qui échoue, est capturé dans `errors` — jamais fatal pour le reste de l'analyse (même discipline batch-résiliente que `BaseAutomation`).

### Deux méthodes réellement statistiques, pas seulement des seuils arbitraires

`statsUtils.js::detectNumericOutliers` implémente une vraie (quoique simple) détection d'anomalies par **z-score** : un point est signalé s'il s'écarte de plus de `zScoreThreshold` écarts-types de la moyenne de l'ensemble — offline, déterministe, aucun poids de modèle à charger (même philosophie que `HashingEmbeddingProvider` côté RAG). Utilisé par `industrialAnalyzer.js` (quantités aberrantes) et disponible pour tout futur domaine. Les "prévisions" (`forecasts`), elles, sont explicitement documentées comme des **heuristiques sur l'instantané actuel** (ex. `completion_rate_estimate`, `backlog_ratio_estimate`) — aucun Tool existant ne renvoie de série temporelle, donc aucune prévision ici ne prétend en être une : chaque objet de prévision porte un champ `basis` qui le dit explicitement.

### La contrainte "lecture seule", vérifiée mécaniquement

Le Dashboard IA n'écrit jamais rien : aucune liste blanche d'aucun des 7 domaines ne contient un Tool de mutation. `test/ai.dashboard.policy.test.js` vérifie mécaniquement qu'aucun nom de Tool commençant par `create_`/`update_`/`delete_`/`set_`/`mark_`/`send_`/`assign_`/`move_`/`accept_`/`reject_`/`start_`/`complete_` n'apparaît dans une `DEFAULT_DATA_SOURCES`, en plus des vérifications habituelles (aucun service métier, aucun modèle Sequelize, aucun SQL brut, aucun appel HTTP sortant, aucun `.invoke(...)` en dehors de `DomainAnalyzer._callTool`).

### `DashboardService` : un instantané par domaine, ET une vue transversale

`getSnapshot({actingUser, domains?})` exécute les analyseurs demandés **en parallèle** et renvoie `{generatedAt, domains, summary}` — `domains` pour un tableau de bord qui affiche par onglet/domaine, `summary` (les 6 catégories, chacune agrégeant tous les domaines) pour un tableau de bord qui affiche par catégorie ("toutes les alertes", peu importe le domaine). L'échec d'UN domaine (permission refusée, Tool en panne) est absorbé dans `domains[domaine].errors` — il n'empêche jamais les autres domaines de s'afficher. `getDomainSnapshot(domain, {actingUser})`, à l'inverse, laisse remonter une erreur de permission telle quelle : l'appelant a demandé explicitement CE domaine, un résultat vide serait trompeur.

### Les APIs HTTP (`modules/ai-dashboard/`) — la première capacité du kernel exposée à l'extérieur

Trois endpoints, tous derrière `authRequired` (`GET /ai-dashboard`, `GET /ai-dashboard/:domain`, `GET /ai-dashboard/insights/:category`) :

| Route | Rôle |
|---|---|
| `GET /ai-dashboard` | Instantané complet : tous les domaines + le résumé par catégorie |
| `GET /ai-dashboard/:domain` | Un seul domaine parmi les 7 (`400` si le nom est invalide) |
| `GET /ai-dashboard/insights/:category` | Une seule catégorie parmi les 6, agrégée sur tous les domaines (`alerts`/`recommendations`/`anomalies`/`forecasts`/`risks`/`data-quality` — kebab-case dans l'URL, mappé vers la clé camelCase du kernel) |

`modules/ai-dashboard/services/aiDashboardBridge.service.js` est le **seul** fichier de ce module HTTP qui touche `src/ai/` : il construit un `McpServer` **singleton** (`createServer()` réutilisé depuis `mcp/server/start.js`, appelé une seule fois pour la durée de vie du process — même pattern que `sequelize` dans `src/db.js`) puis, à CHAQUE requête, un `DashboardService` frais scopé à l'`actingUser` de l'appelant (`req.user` — `{sub, email, role}`, mappé vers `{id, role, email}`, jamais l'inverse : voir « req.user vs actingUser » ci-dessous). Construire un pipeline par requête est délibéré et sans coût : `createMcpToolAdapters`/`DomainAnalyzer` ne font aucune I/O à la construction — seule la première requête déclenche réellement `createServer()`.

### `req.user` (`{sub, email, role}`) vs `actingUser` (`{id, role, email}`) — un mapping, jamais un raccourci

Le middleware `authRequired` (`middleware/auth.middleware.js`) attache le payload JWT tel quel à `req.user` — **`sub`, pas `id`**. Tout le kernel IA (Tools MCP, Agents, Automations, ce Dashboard) attend `actingUser.id`. `aiDashboardBridge.service.js::toActingUser()` fait ce mapping en un seul endroit ; le contrôleur ne lit jamais `req.user.sub` lui-même. Un futur module `ai-copilot` conversationnel devra faire exactement le même mapping avant d'appeler `AIManager.handleMessage()`.

### Ce qui n'a délibérément pas été fait

`middleware/moduleAccessGuard.js` restreint le rôle `responsable_logistique_achat` à une liste fixe de préfixes de route (POR PROMESH, industriel, RH, maintenance, ...) qui n'inclut pas `/ai-dashboard` — ce rôle n'a donc pour l'instant PAS accès au Dashboard IA, alors même que `industrialAnalyzer`/`hrAnalyzer`/`maintenanceAnalyzer` l'autorisent chacun à leur niveau. Élargir cette liste est une décision de contrôle d'accès plus large que ce commit, volontairement laissée de côté plutôt que modifiée en passant (voir « Prochaines étapes » plus bas).

## Proactive AI (`proactive/`)

Le Copilot ne se limite plus à répondre à une question : `src/cron/proactiveAiMonitor.job.js` (désactivé par défaut, `AI_PROACTIVE_MONITORING_ENABLED=false`) surveille quotidiennement projets, ventes, **activités**, **échéances** (deux facettes du projet, pas des modules séparés — voir `ProjectAttentionAnalyzer`), interventions et KPI, et pousse une alerte réelle (e-mail + notification in-app + push temps réel via `socket.js`, événement dédié `"proactive-ai-alert"`) dès qu'un risque est détecté — avec le problème expliqué, une solution proposée, et des actions préparées, JAMAIS exécutées automatiquement (même garantie structurelle que `SuggestionEngine`/`DataQualityAgent`/`AutomationAgent`).

Un troisième sous-système, au même niveau que `dashboard/`/`automations/` (jamais imbriqué) : `ProactiveMonitor` (détection SEULE) réutilise `DashboardService` (Dashboard IA, déjà pull-only, jamais reconstruit ici) pour ventes/interventions/KPI, et `ProjectAttentionAnalyzer` (Business Reasoning) pour projets/activités/échéances — jamais une deuxième logique de scoring. `AlertDispatcher` (envoi SEUL) route par les 2 seuls canaux réels du kernel (`send_notification_email`, `socket.js::emitToUser`). L'audit préalable à cette passe a confirmé que `automations/` (8 automatisations déjà construites) n'était appelé nulle part en production — un sous-système dormant, pas concurrent de celui-ci. Voir `proactive/PROACTIVE_AI.md` pour le détail complet (pourquoi un nouveau sous-système, le cycle détecter→construire→envoyer, ce qui n'a délibérément pas été fait).

## Sécurité du module IA (`security/`)

Passe transversale sur l'ensemble du kernel (`mcp/`, `langchain/`, `orchestrator/`, `modules/ai-dashboard/`) répondant aux 8 piliers demandés : **contrôle des permissions**, **limitation des appels**, **validation des entrées**, **journalisation**, **audit**, **protection contre les injections de prompt**, **protection des secrets**, **gestion des erreurs**. Trois piliers réutilisent des mécanismes déjà existants plutôt que d'en dupliquer une deuxième version (DRY) ; les cinq autres sont un nouveau sous-dossier, `security/`, qui suit exactement le même patron ports/adaptateurs/pipeline que `rag/`, `langchain/`, `memory/` et `dashboard/`.

### Ce qui était déjà là (réutilisé, pas dupliqué)

- **Contrôle des permissions** : `mcp/permissionManager.js::PermissionManager.assertCanCall()`, lui-même bâti sur `utils/authorization.js::isAuthorized` (le même prédicat rôle-OU-e-mail que `BaseAgent`/`BaseAutomation`/`DomainAnalyzer`, voir plus haut). Vérifié avant même que l'input métier ne soit examiné, pour qu'un appelant non autorisé n'apprenne jamais rien du contrat d'un Tool.
- **Validation des entrées** : `mcp/validationManager.js::ValidationManager` — schéma Joi de l'enveloppe JSON-RPC, schéma Joi de `actingUser` (UUID v4 obligatoire), et le schéma Joi propre à chaque Tool (`tool.inputSchema`, `stripUnknown: true`).
- **Gestion des erreurs** : `mcp/errorHandler.js::ErrorHandler.toResponse()` — convertit toute exception (McpError, `RateLimitExceededError`, convention CRM `{status, message}`, ou n'importe quoi d'autre) en une réponse JSON-RPC 2.0 valide, sans jamais renvoyer de stack trace ni de détail interne au client (`ToolExecutionError` masque volontairement `cause.message`, journalisé côté serveur uniquement).

### `security/` — les 5 nouveaux mécanismes

| Fichier | Pilier | Rôle |
|---|---|---|
| `rateLimiter.js` (`IRateLimiter`) | Limitation des appels | Fenêtre fixe par clé `{actingUser.id}:{tool}` (`defaultRateLimitKey` — jamais l'e-mail, une PII), au-dessus du port `IKeyValueStore` déjà utilisé par `memory/` (`increment()`, TTL posé uniquement à l'ouverture de la fenêtre — voir `InMemoryKeyValueStore`/`RedisKeyValueStore`). |
| `auditLog.js` (`IAuditLog`) | Audit | Journal structurellement identique à `ShortTermMemory` (liste Redis capée + TTL) mais pour des événements de sécurité — `record({actor, action, resource, outcome, metadata})`, `outcome ∈ {allowed, denied, success, failure, flagged}`. `metadata` passe par `redact()` AVANT persistance. |
| `promptInjectionGuard.js` (`IPromptInjectionGuard`) | Injections de prompt | Heuristiques regex bilingues FR/EN, offline et déterministes (5 familles : instructions ignorées, changement de rôle, révélation du prompt système, faux marqueurs `system:`/`assistant:`, invocation d'outil non sollicitée). Trois modes : `"flag"`, `"sanitize"` (délimite le texte comme non fiable sans le supprimer), `"block"` (lève `PromptInjectionDetectedError`). |
| `../utils/secretRedaction.js` (+ `security/secretRedactor.js`, ré-export) | Protection des secrets | `redact()`/`redactString()` — motifs de VALEURS secrètes (Bearer, JWT, mot de passe de chaîne de connexion, `clé="valeur"` générique) et de NOMS de clés secrètes (récursif dans les objets). Câblé dans `utils/logger.js::withNamespace()` : **tout** logger namespacé du kernel est automatiquement filtré. |
| `config.js` / `pipeline.js` | (tous) | `loadSecurityConfig(env)` (Joi, `AI_SECURITY_*`) et `createSecurityPipeline({store?, env?})`, composition root qui câble `RateLimiter`+`AuditLog` sur UN `IKeyValueStore` partagé (par défaut `InMemoryKeyValueStore` — passer le même `RedisKeyValueStore` que `memory/pipeline.js` pour un déploiement multi-instance) + un `PromptInjectionGuard`. |

### Où c'est branché (collaborateurs optionnels, rétrocompatibles)

Même discipline que partout ailleurs dans ce kernel : chaque nouveau collaborateur est un paramètre de constructeur optionnel (`= null`), le comportement exact d'avant reste inchangé si on l'omet — vérifié en ré-exécutant toute la suite existante avant d'ajouter les nouveaux tests.

- **`McpServer`** (`mcp/server/mcpServer.js`) reçoit `rateLimiter`/`auditLog` optionnels. C'est le point d'intégration le plus rentable du kernel : **tout** `tools/call` (conversation, Agent, Automation, Dashboard) passe par `handleMessage()`, donc une seule intégration ici couvre tous les appelants. Ordre des vérifications dans `_handleToolsCall` : identité/permission → limitation d'appels → validation d'entrée → exécution — chaque refus (permission ou rate-limit) est audité `"denied"` avant d'être relancé ; le succès/échec de l'exécution est audité `"success"`/`"failure"`. Un échec d'écriture dans l'audit lui-même ne casse jamais l'appel réel (best-effort, journalisé en `warn`). **`mcp/server/start.js::createServer()`** — la seule fabrique qui construit un `McpServer` réel (utilisée par l'entrypoint stdio ET par le singleton HTTP de `modules/ai-dashboard/`) — câble désormais `rateLimiter`/`auditLog` **par défaut** via `security/pipeline.js::createSecurityPipeline()` ; passer `{ rateLimiter: null, auditLog: null }` explicitement pour désactiver (corrigé lors d'un audit sécurité ultérieur : avant cette correction, le seul `McpServer` réellement joignable depuis l'extérieur du process — via `GET /ai-dashboard`, `aiDashboardBridge.service.js` — n'avait ni limitation d'appels ni audit, malgré le mécanisme documenté juste au-dessus).
- **`RagContextBuilder`** (`langchain/context/ragContextBuilder.js`) reçoit un `promptInjectionGuard` optionnel — scanne le texte des documents RAG **retrouvés**, la principale surface d'injection *indirecte* du kernel (l'auteur d'un document ingéré n'est pas forcément digne de confiance).
- **`AIManager`** (`orchestrator/aiManager.js`) reçoit le même type de collaborateur — scanne le message BRUT de l'utilisateur, la surface d'injection *directe*. En mode `"block"`, l'exception est absorbée par le `try/catch` déjà existant de `handleMessage()` et ressort comme une réponse `mode: "error"` normale, jamais une exception qui remonte à l'appelant.
- **`ToolCallingChain`** (`langchain/chains/toolCallingChain.js`), **`WorkflowManager`** (`orchestrator/workflowManager.js`) et **`BaseAgent`** (`agents/baseAgent.js`, `reportingAgent.js` compris) reçoivent également `promptInjectionGuard` — corrigé lors d'un audit sécurité ultérieur : un Tool appelé au sein d'une boucle de tool-calling renvoie parfois un champ texte libre du CRM (description de demande de maintenance, commentaire RH, ...) qui était réinjecté tel quel comme message dans le tour suivant, **sans passer par le guard** — un vecteur d'injection indirecte tout aussi réel que le contenu RAG, simplement découvert plus tard. `BaseAgent._historyText` (historique de conversation réinjecté dans l'instruction) est guardé pour la même raison.
- **`orchestrator/pipeline.js::createAiOrchestrator`** propage UNE SEULE instance de `promptInjectionGuard` à TOUTES les surfaces ci-dessus (`AIManager`, `RagContextBuilder`, `WorkflowManager`, et chacun des 11 Agents via `loadDefaultAgents(deps)`) — une politique, appliquée de façon cohérente partout.
- **`modules/ai-dashboard/routes/aiDashboard.routes.js`** applique un `express-rate-limit` (même convention que `routes/auth.routes.js` : `skip` en `NODE_ENV=test`, `standardHeaders: true`) sur tout le routeur — 60 requêtes/IP/minute, une limite large pour un usage normal (rafraîchissement d'UI) mais bornée contre un abus.

### Tests

Chaque mécanisme a ses tests unitaires (`test/ai.security.rateLimiter.test.js`, `test/ai.security.auditLog.test.js`, `test/ai.security.promptInjectionGuard.test.js`, `test/ai.security.secretRedaction.test.js`, `test/ai.security.config.test.js`, `test/ai.security.pipeline.test.js`), une politique architecturale mécanique (`test/ai.security.policy.test.js` — même vérification que chaque autre sous-dossier : jamais de Sequelize/service métier/SQL brut/HTTP, et spécifiquement jamais de `require("redis")` ni de construction directe d'un `RedisKeyValueStore`), et un test de bout en bout (`test/ai.security.e2e.test.js`) qui câble le VRAI `createSecurityPipeline()` dans un VRAI `McpServer` et rejoue les 8 piliers comme un seul scénario cohérent — permissions refusées/accordées, entrée invalide, budget d'appels dépassé, trace d'audit dans l'ordre exact `denied → success → denied → failure`, secret jamais présent ni dans la réponse JSON-RPC ni dans l'entrée d'audit correspondante, et une batterie d'erreurs (Error classique, objet `{status,message}`, valeur brute lancée) confirmant qu'aucune ne fuite jamais de détail interne au client.

## Validation du Copilot — 500 conversations réalistes (`orchestrator/COPILOT_VALIDATION.md`)

Un corpus de 500 conversations réalistes (`test/fixtures/copilotValidationScenarios.js`), réparties sur les 18 intentions du catalogue et centrées sur les 4 personas explicitement demandées (Commercial, Chef de projet, RH, Direction — largement couvertes — plus Administration/Maintenance/Industriel/Qualité/Notifications/Documentation pour une couverture complète). Chaque scénario documente l'intention attendue, l'Agent attendu, les AI Tools attendus, la permission attendue (au niveau Agent ET Tool), le contexte attendu (`tools`/`rag`) et un indice de réponse attendue. Deux niveaux de tests automatisés vérifient le tout contre le VRAI code de production : **Tier 1** (`test/ai.validation.copilotScenarios.test.js`, les 500 scénarios — intention/Agent/permissions/Tools/contexte, jamais l'exécution d'un tour complet) et **Tier 2** (`test/ai.validation.copilotEndToEnd.test.js`, un échantillon représentatif par intention — un VRAI `AIManager` exécute le tour complet et produit une réponse bien formée). Voir `orchestrator/COPILOT_VALIDATION.md` pour la méthodologie complète, y compris pourquoi un échantillon suffit pour le Tier 2 et les limites assumées (aucun contenu de réponse en langage naturel n'est vérifié — aucun fournisseur LLM réel n'est câblé, décision Sprint 0).

## Clean Architecture & SOLID — comment c'est appliqué ici

- **Ports & adaptateurs** : chaque dossier expose un contrat (`*.interface.js`) indépendant de toute technologie concrète ; les adaptateurs (`InMemory*`, `ToolRegistry`, `WorkflowRunner`) implémentent ces contrats sans que le contrat n'ait jamais connaissance de l'adaptateur.
- **Dependency Inversion (DIP)** : `AiManager` ne fait `require()` d'aucune implémentation concrète dans son constructeur — il reçoit des instances déjà construites. `manager/index.js` (la seule "impure" du kernel) est le point unique où les adaptateurs par défaut sont choisis.
- **Interface Segregation (ISP)** : vingt-sept petites interfaces (`IEventBus`, `IConversationMemory`, `IPromptRepository`, `ITool`, `IWorkflowStep`, `IAgent`, `IMcpClient`, `IRetriever`, `IVectorStore`, `ILlmProvider`, `IGuardrails`, `IContextBuilder`, `ISourceLoader`, `IChunker`, `IEmbeddingProvider`, `IReranker`, `IChain`, `IPlanner`, `IRouter`, `IWorkflowEngine`, `IIntentDetector`, `IKeyValueStore`, `ISessionMemory`, `IContextMemory`, `ILongTermMemory`, `IPreferenceMemory`, `IAutomation`, `IDomainAnalyzer`) plutôt qu'une façade unique — un futur agent n'a besoin de connaître que `IAgent`, pas le reste du kernel.
- **Open/Closed (OCP)** : `ToolRegistry`/`AgentRegistry`/`LoaderRegistry` s'étendent par `register()`, sans jamais modifier le registre lui-même pour ajouter un outil/agent/format de document.
- **Liskov Substitution (LSP)** : tout code qui consomme `IEventBus` fonctionne indifféremment avec `InMemoryEventBus` ou un futur adaptateur Redis/queue, sans changement d'appel ; de même, `RagRetrievalService` fonctionnera sans modification derrière un futur `IVectorStore` persistant ou un `IEmbeddingProvider` branché sur un vrai modèle. `ShortTermMemory` en est la preuve la plus directe : un remplacement, à l'identique, d'`InMemoryConversationMemory` derrière `IConversationMemory`, vérifié par test (`test/ai.orchestrator.pipeline.test.js`).
- **Single Responsibility (SRP)** : un fichier = un contrat ou un adaptateur ; `AiManager` orchestre le câblage, il n'implémente aucune règle métier lui-même.
- **Même principe dans `mcp/`, `rag/`, `langchain/`, `orchestrator/`, `agents/`, `memory/`, `automations/` et `dashboard/`** : `McpServer` ne dépend que d'abstractions injectées au constructeur (`toolRegistry`, `permissionManager`, `validationManager`, `errorHandler`) — `test/ai.mcp.server.test.js` l'instancie avec des Tools fictifs et sans jamais toucher une vraie base de données. `RagIngestionService`/`RagRetrievalService` suivent le même principe (`test/ai.rag.retrievalService.test.js` les instancie avec de simples doublons `{embed, query}`). `AIManager` va jusqu'au bout de cette discipline : son constructeur refuse de construire (`ConfigurationError`) si l'un de ses six collaborateurs manque, et chacun d'eux (`ConversationManager`, `IntentDetector`, `ToolRouter`, `AgentRouter`, `WorkflowManager`, `ResponseBuilder`) est testé isolément avec de simples doublons (`test/ai.orchestrator.*.test.js`), jamais avec un vrai `McpServer`/`ILlmProvider`. Les 11 Agents spécialisés suivent le même patron : chaque factory (`agents/manifest.js`) reçoit ses collaborateurs déjà construits, et les tests (`test/ai.agents.*.test.js`) n'instancient jamais un vrai `McpServer` — un simple objet `{name, description, invoke}` suffit à tenir lieu de Tool LangChain. Les 5 classes de mémoire ne dépendent, elles, que du port `IKeyValueStore` — aucune ne construit ni ne reçoit un client `redis` directement (`RedisKeyValueStore` est la seule à le faire), ce qui les rend testables contre `InMemoryKeyValueStore` sans jamais toucher un serveur Redis réel (`test/ai.memory.{shortTermMemory,sessionMemory,contextMemory,longTermMemory,preferenceMemory}.test.js`). Les 8 automatisations suivent exactement le même patron que les Agents : un simple objet `{name, invoke}` en guise de Tool suffit dans `test/ai.automations.*.test.js`, jamais un vrai `McpServer`. Les 7 `DomainAnalyzer` du Dashboard IA suivent le même patron dans `test/ai.dashboard.*.test.js` ; même la couche HTTP (`modules/ai-dashboard/`) reste testable sans jamais démarrer le vrai `app.js`/une vraie base : `test/aiDashboard.routes.test.js` monte SEULEMENT le routeur sur une app Express minimale avec le bridge et `authRequired` remplacés par des doublons, et `test/aiDashboardBridge.service.test.js` fait de même en remplaçant `createServer()`/`createDashboardPipeline()`. `PermissionManager`/`ValidationManager`/`ErrorHandler`/`ToolLoader`/`DocumentRegistry`/`CitationBuilder`/`ConversationManager`/`ToolRouter`/`AgentRouter`/`WorkflowManager`/`ResponseBuilder`/`BaseAgent`/`SessionMemory`/`ContextMemory`/`LongTermMemory`/`PreferenceMemory`/`BaseAutomation`/`DomainAnalyzer`/`DashboardService` sont volontairement des classes concrètes plutôt que des ports+adaptateurs : YAGNI — aucune deuxième implémentation n'est envisagée à ce stade, et l'injection par constructeur suffit déjà à les rendre substituables en test.
- **DRY entre `mcp/`, `agents/` et `automations/`** : la vérification "ce rôle ou cet e-mail a-t-il le droit ?" n'a qu'une seule implémentation, `utils/authorization.js::isAuthorized` — extraite de `mcp/permissionManager.js` (comportement inchangé, `test/ai.mcp.permissionManager.test.js` continue de passer à l'identique) puis réutilisée par `BaseAgent`, `BaseAutomation` ET `DomainAnalyzer`. Le modèle hybride rôle-OU-e-mail du CRM (voir « allowedEmails » plus haut) reste donc défini à un seul endroit, jamais recopié une quatrième fois. Même discipline dans `memory/` : `LongTermMemory`/`ContextMemory`/`PreferenceMemory` partagent une seule implémentation du "bucket de hachage Redis avec TTL" (`hashMemoryBase.js::createHashBucket`) plutôt que trois copies quasi identiques ; et dans `dashboard/` : `industrialAnalyzer.js`/`kpiAnalyzer.js` partagent `statsUtils.js::detectNumericOutliers` plutôt que réimplémenter un calcul de z-score chacun de son côté.

## Prochaines étapes (hors périmètre de ce commit)

Voir `AI-Business-Copilot/00_PLAN_DEVELOPPEMENT.md` §8 (roadmap par phases) : choix du fournisseur LLM (Sprint 0), premier adaptateur `ILlmProvider` + `IGuardrails` + `IContextBuilder` réel, tables `ai_*` avec FK physiques (Phase 1), module de livraison `modules/ai-copilot/` monté dans `app.js` (Phase 2).

Pour le serveur MCP spécifiquement : un transport HTTP/SSE derrière `IServerTransport` (le stdio actuel suppose un lancement en process local) ; le CRUD complet Commercial-Contacts et le reste des capacités Projects (fiche par id, timeline, archivage) si une extraction de service équivalente à `user.service.js`/`notification.service.js` est un jour approuvée pour ces deux modules ; un mécanisme de proposition/validation humaine (`ai_suggestions`, cf. plan Phase 3) pour les Tools en écriture les plus sensibles, aujourd'hui protégés uniquement par `PermissionManager` (mêmes règles que l'API HTTP, pas de garde-fou supplémentaire côté IA) ; et le branchement d'un vrai `IMcpClient` côté orchestrateur pour que le futur Copilot consomme ce serveur (ou un serveur MCP tiers) de façon symétrique.

Pour le RAG spécifiquement : un `IVectorStore` persistant (le `InMemoryVectorStore` actuel ne survit pas à un redémarrage — pgvector ou un store managé sont des candidats naturels vu que PostgreSQL est déjà la base du CRM) ; un `IEmbeddingProvider` branché sur un vrai modèle une fois le fournisseur choisi (Sprint 0) ; un Tool MCP `search_documentation` exposant `RagRetrievalService` (délibérément non fait dans cette passe — un Tool RAG n'est ni "un service métier existant" au sens de `ai.mcp.tools.policy.test.js`, ni un accès aux données métier au sens de `ai.rag.policy.test.js` : la politique d'autorisation d'un tel Tool mérite d'être tranchée consciemment, pas déduite par défaut) ; et le déclenchement de l'ingestion au démarrage d'un process long-vivant plutôt qu'à la demande via `reindex.js`.

Pour LangChain spécifiquement : le premier `ILlmProvider` réel une fois le fournisseur choisi (Sprint 0) — tout le reste de `langchain/` en dépend déjà sans changement de code, seul `manager/index.js` (ou un futur module de livraison) aurait à appeler `createLangChainPipeline({ llmProvider, ... })` ; et un Tool MCP ou une route qui expose `ToolCallingChain`/`LlmPlanner` à un utilisateur final.

Pour l'`AIManager` (orchestrateur) spécifiquement : un contrôleur HTTP (`modules/ai-copilot/`, Phase 2 du plan) qui appelle `createAiOrchestrator({...})` une fois au démarrage puis `aiManager.handleMessage(...)` par requête ; un `LlmIntentRouter` (déjà livré côté LangChain) injecté à la place du `LexicalIntentRouter` par défaut d'`IntentDetector`, une fois un `ILlmProvider` choisi, pour une classification d'intention plus flexible que le recouvrement de mots-clés ; et le remplacement du `memory` par défaut (`InMemoryConversationMemory`) par `createRedisMemoryPipeline().shortTermMemory` une fois un serveur Redis disponible en production — un changement d'une ligne, `ShortTermMemory` implémentant le même port.

Pour les Agents spécialisés spécifiquement : un `UsersAgent`/`HRAgent`/`PorPromeshAgent` si le besoin apparaît (les 15 Agents actuels ne couvrent pas ces trois modules — voir « Les Agents spécialisés » plus haut) ; un `LlmIntentRouter` pour `IntentDetector` bénéficierait directement à `AgentRouter.select()` aussi, puisque les deux dépendent du même `Intent` détecté ; ~~une politique de proposition/validation humaine avant qu'un Agent à fort impact (`AutomationAgent` en particulier) n'exécute réellement une étape d'écriture~~ — **fait** (`PendingActionStore`, voir `AUTOMATION_WORKFLOWS.md`) ; et l'usage de `ContextMemory`/`LongTermMemory` (aujourd'hui construites et testées mais pas encore consommées par `BaseAgent`) pour la résolution de pronoms ("assigne-**la** à un technicien") et la personnalisation entre deux conversations d'un même utilisateur.

Pour la mémoire conversationnelle spécifiquement : le câblage effectif de `SessionMemory`/`ContextMemory`/`LongTermMemory`/`PreferenceMemory` dans `orchestrator/`/`agents/` (aujourd'hui construites, testées et prêtes à l'emploi, mais seule `ShortTermMemory` a un point de consommation réel — voir plus haut) ; un serveur Redis réellement provisionné (`REDIS_URL`) en dev/staging/prod, avec `pipeline.connect()` appelé une fois au démarrage du process (comme `src/db.js` pour Postgres) ; et, si le volume le justifie, une politique d'éviction/purge explicite pour `LongTermMemory`/`PreferenceMemory` (aujourd'hui durables par défaut) plutôt que de compter sur la politique de mémoire globale du serveur Redis (`maxmemory-policy`).

Pour les automatisations IA spécifiquement : un ordonnanceur réel (`node-cron`, déjà présent dans `package.json` et déjà utilisé ailleurs dans ce backend — voir `src/cron/`) qui appelle `createAutomationsPipeline({...})` puis `automations.get(name).run({actingUser, ...})` sur une planification (quotidienne pour `AnalysisAutomation`/`RecommendationAutomation`/`DataQualityAutomation`, horaire pour `ReminderAutomation`, ...) — aujourd'hui chaque automatisation s'exécute à la demande, aucune n'est encore branchée sur une planification ; la vérification (non faite ici) que la forme réelle des éléments renvoyés par `list_all_maintenance_requests`/`list_hr_requests`/`list_my_notifications`/`list_users` correspond bien aux hypothèses "meilleur effort" documentées dans `DEFAULT_SOURCES`/`DEFAULT_RULES`/`DEFAULT_CHECKS`/`defaultShouldDelete` (chaque fichier avertit explicitement de cette limite) ; `update_calendar_event`/`delete_calendar_event` (déjà livrés comme Tools MCP dans cette même passe) ne sont pas encore consommés par `GoogleCalendarAutomation`, qui ne fait aujourd'hui que créer des événements ; et l'usage de `ContextMemory`/`LongTermMemory` par `RecommendationAutomation` pour éviter de re-signaler la même recommandation à chaque exécution.

Pour le Dashboard IA spécifiquement : la vérification (non faite ici, même limite "meilleur effort" que pour les automatisations) que la forme réelle des données renvoyées par `list_projects`/`list_pipeline_stages`/`get_commercial_contact_kpi`/`get_dashboard_kpis`/`get_por_promesh_dashboard` correspond aux hypothèses documentées dans chaque `buildDefaultRules()` — chaque analyseur avertit explicitement de cette limite et expose ses seuils/extracteurs en paramètres pour les ajuster sans toucher au moteur ; l'ajout de `responsable_logistique_achat` aux préfixes autorisés de `middleware/moduleAccessGuard.js` si ce rôle doit un jour voir le Dashboard IA (délibérément non fait — voir « Ce qui n'a délibérément pas été fait » plus haut) ; une mise en cache courte du snapshot complet (`getSnapshot()` interroge les 7 domaines à chaque requête, potentiellement coûteux si le dashboard est rafraîchi très fréquemment par un front) ; et un front-end qui consomme réellement les 3 endpoints (`GET /ai-dashboard`, `/ai-dashboard/:domain`, `/ai-dashboard/insights/:category`) — aucune interface n'est livrée ici, seulement l'API.
