"use strict";

const { OrchestratorError, ConfigurationError, OrchestratorPermissionError } = require("./errors");
const { createOrchestratorLogger } = require("./logger");
const { isAuthorized } = require("../utils/authorization");
const { DEFAULT_INTENT_CATALOG } = require("./intentCatalog");
const { classifyDecision, TASK_PLAN_PENDING_TYPE } = require("../planning/confirmationManager");
const { isFicheCreationFollowUp, INDUSTRIAL_CREATION_TYPE, PROMESH_CREATION_TYPE } = require("../reasoning/industrialRequest");
const { buildAnalyticsErrorAnswer } = require("../reasoning/analyticsAnswerBuilder");
const { UNROUTED_INTENTS } = require("../routing/queryRouter");

const REQUIRED_COLLABORATORS = ["conversationManager", "intentDetector", "agentRouter", "toolRouter", "workflowManager", "responseBuilder"];

// AI-Business-Copilot/26_MEETING_AGENT_CONTINUITY.md — les 3 Tools
// d'ÉCRITURE réels du module googleCalendar (voir meetingAgent.js) ; jamais
// get_calendar_status (lecture seule) — seul un appel à l'un de ces 3
// signifie qu'un workflow meeting_agent est réellement arrivé à son terme.
const CALENDAR_WRITE_TOOLS = new Set(["create_calendar_event", "update_calendar_event", "delete_calendar_event"]);

// AI-Business-Copilot/27_MEETING_AGENT_SLOT_ACCUMULATION.md — reproduit en
// direct (Ollama réel, TEST 2) : le modèle a tenté `create_calendar_event`
// AVANT que toutes les informations ne soient réunies (champs manquants,
// jamais une confirmation explicite de l'utilisateur) ; `ValidationManager`
// (mcp/server) a rejeté l'appel (`startDateTime`/`endDateTime` requis) —
// aucune écriture réelle n'a eu lieu — mais l'ancienne garde ne regardait
// QUE le NOM du Tool dans `toolSteps`, jamais si l'appel avait RÉUSSI :
// cette tentative RATÉE effaçait quand même le sujet actif, cassant la
// continuité du tour suivant. `ToolCallingChain` (toolCallingChain.js)
// transforme systématiquement une erreur de Tool en `output` textuel
// commençant par "Error: " (jamais lancée telle quelle) — et
// `googleCalendar.service.js` ne lève jamais non plus, renvoyant
// `{success:false, ...}` pour un échec côté service (ex. compte non
// connecté) — les deux cas doivent être exclus, seule une écriture
// RÉELLEMENT réussie efface le sujet actif.
function wasSuccessfulCalendarWrite(step) {
  if (!CALENDAR_WRITE_TOOLS.has(step.tool)) return false;
  const output = String(step.output == null ? "" : step.output);
  if (output.startsWith("Error:")) return false;
  try {
    const parsed = JSON.parse(output);
    if (parsed && parsed.success === false) return false;
  } catch (_err) {
    // Sortie non-JSON : ni un "Error: " ni un {success:false} explicite —
    // traité comme une réussite (comportement d'origine, préservé).
  }
  return true;
}

// AI-Business-Copilot/31_PENDING_MEETING_CONFIRMATION_ROUTING.md — reproduit
// en direct : une réponse de confirmation ("confirme"/"annule") à un
// PendingAction proposé par meeting_agent se faisait reclasser par
// IntentDetector vers l'intention "automation" — "confirme"/"confirmer"/
// "annule"/"annuler" sont des mots-clés GLOBAUX du catalogue, réservés au
// cycle propre à AutomationAgent (voir intentCatalog.js, entrée
// "automation") — puis routée vers automation_agent, refusée par son RBAC
// (rôle admin-tier). Seul "create_meeting" (meeting_agent) est concerné ici
// — AutomationAgent n'a pas ce problème : ses propres marqueurs de
// confirmation SONT déjà les mots-clés qui le font retrouver par
// IntentDetector, jamais un conflit avec une autre intention.
const PENDING_ACTION_TYPE_TO_INTENT_KEY = {
  create_meeting: "meetings",
  [TASK_PLAN_PENDING_TYPE]: "multi_step_task",
  [INDUSTRIAL_CREATION_TYPE]: "industrial",
  [PROMESH_CREATION_TYPE]: "por_promesh",
};
const FICHE_CREATION_TYPES = new Set([INDUSTRIAL_CREATION_TYPE, PROMESH_CREATION_TYPE]);

// Reconstruit un Intent EXACTEMENT comme IntentDetector.detect() le ferait
// pour cette clé — jamais un objet inventé, toujours une entrée réelle du
// catalogue (même discipline que ConversationContinuityResolver). confidence:1
// (correspondance déterministe, pas une heuristique lexicale) ; ambiguous:false/
// alternateIntent:null pour ne jamais redéclencher le contrôle d'ambiguïté.
function buildIntentFromCatalogEntry(entry) {
  return {
    name: entry.key,
    moduleKey: entry.moduleKey,
    requiresRag: entry.requiresRag,
    requiresTools: entry.requiresTools,
    conversational: Boolean(entry.conversational),
    description: entry.description,
    requiredRoles: entry.requiredRoles || [],
    allowedEmails: entry.allowedEmails || [],
    relatedModules: entry.relatedModules || [],
    confidence: 1,
    entities: [],
    ambiguous: false,
    alternateIntent: null,
  };
}

/**
 * # AIManager — le cerveau d'un tour de conversation du Copilot
 *
 * ## Rôle
 * Point d'entrée unique demandé par cette passe : `handleMessage()`
 * comprend l'intention (`IntentDetector`), sélectionne le bon Agent
 * (`AgentRouter`) puis, à défaut, les bons Tools (`ToolRouter`), appelle
 * LangChain et utilise le RAG lorsque nécessaire (`WorkflowManager`), et
 * met en forme la réponse (`ResponseBuilder`) — en faisant le lien avec
 * l'historique de conversation (`ConversationManager`) avant et après.
 * Ne construit jamais lui-même ses collaborateurs (DIP pur, comme
 * `manager/aiManager.js::AiManager` et `langchain/pipeline.js`) : voir
 * `orchestrator/pipeline.js::createAiOrchestrator()` pour le câblage par
 * défaut.
 *
 * ### Distinct de `manager/aiManager.js::AiManager`
 * Le kernel possède déjà un `AiManager` (dossier `manager/`) : une racine de
 * composition légère qui expose `isEnabled()`/`isRoleAllowed(role)`/
 * `getStatus()` et ne dépend que d'abstractions génériques (bus
 * d'événements, mémoire, etc.) — construit sans jamais nécessiter de
 * fournisseur LLM. `AIManager` (ce fichier, dossier `orchestrator/`) est
 * volontairement un objet distinct, plus "lourd" : il EXIGE un pipeline
 * LangChain pleinement configuré (donc un `ILlmProvider` réel) pour
 * fonctionner. Les deux coexistent à des niveaux différents plutôt que
 * d'être fusionnés, pour ne pas alourdir le contrôle `isEnabled()`/
 * `isRoleAllowed()` (probablement appelé à chaque requête) avec des
 * dépendances qui n'ont de sens qu'une fois un tour de conversation
 * réellement engagé.
 *
 * ## Entrée
 * `handleMessage({ message: string, user: object, conversationId?: string })`
 *
 * ## Sortie
 * Voir `ResponseBuilder.build()` — jamais une exception : toute erreur est
 * capturée et transformée en `ResponseBuilder.buildErrorResponse()`, pour
 * qu'un appelant (futur contrôleur HTTP) n'ait jamais à distinguer
 * "réponse" de "exception" dans son propre code.
 *
 * ## Sécurité
 * `promptInjectionGuard` (security/promptInjectionGuard.js), optionnel :
 * scanne le message BRUT de l'utilisateur avant qu'il n'atteigne
 * `IntentDetector`/l'Agent/`WorkflowManager` — défense complémentaire à
 * celle de `RagContextBuilder` (qui protège contre le contenu RAG, la
 * surface la plus dangereuse) ; ici il s'agit d'une tentative directe par
 * l'utilisateur lui-même. En mode `"block"`, `scan()` lève
 * `PromptInjectionDetectedError` — absorbée par le même `catch` que toute
 * autre erreur, donc renvoyée comme une réponse `mode: "error"` normale,
 * jamais une exception qui remonte à l'appelant. Sans lui (défaut),
 * comportement strictement inchangé.
 *
 * `auditLog` (security/auditLog.js), optionnel : journalise CHAQUE tour de
 * conversation (`action: "conversation_turn"`, `outcome: "denied" |
 * "success" | "failure" | "flagged"`) — pas seulement les appels de Tool
 * individuels déjà couverts par `McpServer`/`AuditLog`. Best-effort, comme
 * partout ailleurs dans le kernel : un échec d'écriture de l'audit ne casse
 * jamais le tour de conversation réel. Sans lui (défaut), comportement
 * inchangé.
 *
 * ### Observabilité (AI-Business-Copilot/11_MEETING_AGENT_FIX.md, étape 17)
 * Chaque évènement `_audit()` porte déjà, dans le vocabulaire EXISTANT de ce
 * fichier (aucun second canal de logs, jamais un champ dupliqué) :
 * `actor` (= userId, `{id, role}`), `resource` (= intent), `outcome` (=
 * status), `conversationId` (= correlationId — le même identifiant traverse
 * déjà tout un tour, HTTP/WebSocket/`ConversationManager`), et dans
 * `metadata` : `entities`, `confidence`, `agent`, `tools` (noms réels,
 * dédupliqués, tirés de `outcome.toolSteps`), `executionTimeMs`. Jamais le
 * contenu du message, jamais un secret — uniquement des métadonnées de
 * routage.
 *
 * ## Le workflow en 12 étapes (voir aussi `orchestrator/WORKFLOW.md`)
 * 1. **Recevoir la question** — `handleMessage({message, user, conversationId})`.
 * 2. **Détecter l'intention** — `intentDetector.detect()`.
 * 3. **Identifier le module métier** — `intent.moduleKey`, résolu par le
 *    catalogue en même temps que l'intention (étape 2 et 3 sont une seule
 *    résolution, `IntentDetector` connaît déjà les deux).
 * 4. **Vérifier les permissions** — `isAuthorized({requiredRoles:
 *    intent.requiredRoles, allowedEmails: intent.allowedEmails}, user)` —
 *    AVANT toute construction de contexte ou sélection de Tool (échec
 *    rapide). Lève `OrchestratorPermissionError` si refusé ; absorbée par le
 *    `catch` de `handleMessage()` comme toute autre erreur.
 * 5. **Construire le contexte métier** — l'historique de conversation
 *    (`conversationManager`) et, pour le chemin RAG, `RagContextBuilder`
 *    (dans `WorkflowManager`/l'Agent sélectionné).
 * 6. **Décider si un Tool est nécessaire** — `intent.requiresTools` +
 *    `toolRouter.select()` (filtre par module puis par recouvrement lexical).
 * 7. **Décider si le RAG est nécessaire** — `intent.requiresRag`, consultée
 *    par `WorkflowManager`/`qaChain` ; repli RAG délibéré si aucun Tool
 *    pertinent n'a été trouvé (dégradation gracieuse plutôt qu'un échec sec).
 * 8. **Exécuter les Tools** — `ToolCallingChain` (via `WorkflowManager` ou
 *    l'Agent sélectionné), qui appelle `McpServer.handleMessage()` pour
 *    chaque Tool (permissions/validation/limitation d'appels déjà appliquées
 *    à ce niveau, voir `mcp/server/mcpServer.js`).
 * 9. **Fusionner les résultats** — `WorkflowManager`/l'Agent renvoient
 *    `{answer, citations, toolSteps}`, assemblés par `ResponseBuilder`.
 * 10. **Générer une réponse naturelle** — le modèle de langage (via
 *     `ToolCallingChain`/`qaChain`) produit `answer`.
 * 11. **Ajouter des explications si nécessaire** — `explanationBuilder.js`,
 *     câblé dans `ResponseBuilder` (champ `explanation`, `null` si rien
 *     d'utile à dire).
 * 12. **Journaliser la conversation** — `conversationManager` (historique,
 *     pour le contexte des tours suivants) ET `auditLog` (traçabilité de
 *     sécurité, si fourni) — deux journaux à deux fins différentes, jamais
 *     confondus (voir plus haut).
 *
 * ## Confirmation d'un PendingAction actif — priorité absolue sur le routage normal (AI-Business-Copilot/31_PENDING_MEETING_CONFIRMATION_ROUTING.md)
 * `pendingActionStore` (optionnel, `orchestrator/pendingActionStore.js`) :
 * TOUT AU DÉBUT de `handleMessage()`, avant `contextResolver`/`intentDetector`
 * — un PendingAction actif pour CET utilisateur authentifié (`user.id`,
 * jamais depuis le texte du message — voir `_resolvePendingAgentIntent()`)
 * fait sauter la détection lexicale entièrement : reproduit en direct, une
 * confirmation ("confirme"/"annule") destinée à `meeting_agent` se faisait
 * classer par `IntentDetector` vers l'intention "automation" (mots-clés
 * globaux partagés avec le cycle propre à `AutomationAgent`) puis refuser
 * par son RBAC admin-tier ; et un "oui" isolé, passé par `contextResolver`,
 * se faisait enrichir en "oui (à propos de reunion)", faisant échouer
 * `MeetingAgent.classifyConfirmation()` (message trop long pour son
 * marqueur faible). Le bypass choisit UNIQUEMENT l'intent (reconstruit
 * depuis le catalogue réel — jamais inventé, voir `buildIntentFromCatalogEntry()`)
 * — l'exécution réelle (confirmer/annuler/ambigu, `consume()`,
 * `createCopilotMeeting()`) reste entièrement dans `MeetingAgent`, inchangée.
 * Sans PendingAction actif pour cet utilisateur (défaut, ou aucun
 * `pendingActionStore` fourni), comportement strictement inchangé.
 *
 * ## Mémoriser le contexte — références et reformulations
 * `contextResolver` (optionnel, `orchestrator/conversationContextResolver.js`
 * — voir `CONVERSATION_CONTEXT.md`) : entre les étapes 1 et 2, relit
 * l'historique (`conversationManager.getHistory()`) et détecte si le
 * message fait référence à un sujet déjà traité ("lesquels", une
 * reformulation courte, ...). Si oui, enrichit le message utilisé pour la
 * détection d'intention/sélection de Tools (jamais celui enregistré dans
 * l'historique, qui reste fidèle à ce que l'utilisateur a réellement
 * écrit). Si le message porte un marqueur de référence mais qu'aucun sujet
 * antérieur n'est connu (ambiguïté réelle), `handleMessage()` répond
 * directement par `ResponseBuilder.buildClarificationResponse()` — jamais
 * une intention/un Tool choisi au hasard. Sans lui (défaut), comportement
 * strictement inchangé.
 *
 * ## Continuité conversationnelle — un workflow multi-tours actif (AI-Business-Copilot/26_MEETING_AGENT_CONTINUITY.md)
 * `continuityResolver` (optionnel, `orchestrator/conversationContinuityResolver.js`) :
 * juste après la détection d'intention (avant le contrôle d'ambiguïté),
 * vérifie si un Agent "conversationnel" (`intent.conversational`, voir
 * intentCatalog.js — aujourd'hui : `meetings`/`reminders`) est déjà actif
 * pour cette conversation (`conversationManager.getCurrentTopic()`) et si
 * le nouveau message ressemble à une réponse à ses informations demandées
 * (email/date/heure) plutôt qu'à un changement de sujet explicite — voir
 * la doc du resolver pour les deux signaux combinés, jamais un simple
 * mot-clé. Le sujet actif est effacé (`clearCurrentTopic()`) dès qu'une
 * écriture calendrier réelle a lieu — jamais bloqué indéfiniment. Sans lui
 * (défaut), comportement strictement inchangé.
 *
 * ## Smart Suggestions — proposer sans jamais exécuter
 * `AIManager` ne calcule lui-même AUCUNE suggestion : il se contente de
 * relayer `agentResult.suggestions` (déjà calculé, déjà filtré par
 * permission par l'Agent via `SuggestionEngine` — voir
 * `suggestionEngine.js`/`SMART_SUGGESTIONS.md`) vers `ResponseBuilder.build()`,
 * `[]` si l'Agent n'en a fourni aucune (comportement par défaut, chemin
 * `WorkflowManager` non-Agent inclus).
 *
 * ## Vérifier la cohérence des données (étape 8)
 * Même relais, pour `agentResult.dataQuality` (déjà calculé par l'Agent —
 * `ProjectAgent` via `reasoning/dataCoherenceChecker.js` à ce jour, voir
 * `BUSINESS_REASONING.md`) vers `ResponseBuilder.build()`.
 *
 * ## Poser une question complémentaire si des informations manquent (étape 11)
 * Contrairement aux deux mécanismes ci-dessus, `followUpQuestion` n'est PAS
 * relayé depuis l'Agent : `ResponseBuilder.build()` le calcule lui-même,
 * directement depuis `outcome.toolSteps` (via `missingInfoDetector.js`) —
 * un filet de sécurité générique à TOUT Agent/Workflow, pas seulement ceux
 * qui y pensent explicitement. Rien à faire ici pour en bénéficier.
 */
class AIManager {
  constructor({
    conversationManager,
    intentDetector,
    agentRouter,
    toolRouter,
    workflowManager,
    responseBuilder,
    promptInjectionGuard = null,
    auditLog = null,
    contextResolver = null,
    continuityResolver = null,
    pendingActionStore = null,
    intentCatalog = DEFAULT_INTENT_CATALOG,
    // Phase 1 — compréhension naturelle (voir entityExtractor.js,
    // contextManager.js, semanticIntentResolver.js). Tous optionnels : sans
    // eux, comportement strictement inchangé (tests existants inclus).
    entityExtractor = null,
    contextManager = null,
    semanticResolver = null,
    // Phase 3 — détection des demandes composées (planning/taskPlanner.js).
    // Optionnel : sans lui, comportement strictement inchangé.
    taskPlanner = null,
    // Analytique CRM (analytics/analyticsQueryParser.js). Optionnel : sans
    // lui, comportement strictement inchangé.
    analyticsParser = null,
    // Personne / société / promoteur précis (routing/queryRouter.js).
    // Optionnels : sans eux, comportement strictement inchangé.
    queryRouter = null,
    engineerProbe = null,
    entityProbe = null,
    logger = createOrchestratorLogger("manager"),
  } = {}) {
    const collaborators = { conversationManager, intentDetector, agentRouter, toolRouter, workflowManager, responseBuilder };
    for (const name of REQUIRED_COLLABORATORS) {
      if (!collaborators[name]) {
        throw new ConfigurationError(`AIManager requires a "${name}" collaborator.`);
      }
    }

    this.conversationManager = conversationManager;
    this.intentDetector = intentDetector;
    this.agentRouter = agentRouter;
    this.toolRouter = toolRouter;
    this.workflowManager = workflowManager;
    this.responseBuilder = responseBuilder;
    this.promptInjectionGuard = promptInjectionGuard;
    this.auditLog = auditLog;
    this.contextResolver = contextResolver;
    this.continuityResolver = continuityResolver;
    this.pendingActionStore = pendingActionStore;
    this.entityExtractor = entityExtractor;
    this.contextManager = contextManager;
    this.semanticResolver = semanticResolver;
    this.taskPlanner = taskPlanner;
    this.analyticsParser = analyticsParser;
    this.queryRouter = queryRouter;
    this.engineerProbe = engineerProbe;
    this.entityProbe = entityProbe;
    this._intentCatalogByKey = new Map(intentCatalog.map((entry) => [entry.key, entry]));
    this.logger = logger;
  }

  // AI-Business-Copilot/31_PENDING_MEETING_CONFIRMATION_ROUTING.md — vérifié
  // avec le contexte de l'utilisateur AUTHENTIFIÉ (`user.id`, jamais depuis
  // le texte du message) : un PendingAction ne revient JAMAIS à un autre
  // utilisateur que celui qui l'a proposé (`pending.actingUserId`, déjà posé
  // par MeetingAgent au moment de propose() — jamais recalculé ici). `null`
  // si aucun PendingAction pertinent n'est actif pour CET utilisateur sur
  // CETTE conversation — le flux normal (IntentDetector/ContextResolver)
  // reprend alors la main sans aucune intervention.
  _resolvePendingAgentIntent(conversationId, user, message = "") {
    if (!this.pendingActionStore) return null;
    const pending = this.pendingActionStore.peek(conversationId);
    if (!pending) return null;
    if (!user || pending.actingUserId !== user.id) return null;
    // Phase 3 — un plan en attente ne capte QUE la réponse « confirme » /
    // « annule » ; toute autre question suit le routage normal (le plan
    // reste confirmable jusqu'à son expiration).
    if (pending.type === TASK_PLAN_PENDING_TYPE && !classifyDecision(message)) return null;
    // Création de fiche en cours : seuls « confirme », « annule » ou un champ
    // attendu (machine, poste) y reviennent ; toute autre demande suit le
    // routage normal.
    if (FICHE_CREATION_TYPES.has(pending.type) && !isFicheCreationFollowUp(message)) return null;
    const catalogKey = PENDING_ACTION_TYPE_TO_INTENT_KEY[pending.type];
    if (!catalogKey) return null;
    const entry = this._intentCatalogByKey.get(catalogKey);
    if (!entry) return null;
    return buildIntentFromCatalogEntry(entry);
  }

  // `pageContext` (Phase 1) : écran Flutter courant ({screen, entity?, recordId?, label?}).
  // Jamais concaténé au texte classé (voir AI-Business-Copilot/33_PAGE_CONTEXT_INTENT_CONTAMINATION.md) :
  // stocké dans le ContextManager et utilisé UNIQUEMENT pour résoudre une
  // référence (« celui-ci ») — jamais comme autorisation.
  // `documents` (Phase 2) : documents joints à CE message ({documentId, filename}),
  // déjà vérifiés comme appartenant à `user` par le bridge.
  async handleMessage({ message, user, conversationId = null, pageContext = null, documents = [] }) {
    let intent = null;
    let entities = null;
    let turnContext = null;
    let lookupRoute = null;
    // Étape 17 (AI-Business-Copilot/11_MEETING_AGENT_FIX.md) —
    // observabilité : chaque tour, réussi ou non, journalise sa durée via
    // le MÊME auditLog déjà en place (jamais un second canal de logs) —
    // voir les 3 appels _audit() ci-dessous. Ne journalise jamais le
    // contenu du message ni aucun secret, uniquement des métadonnées de
    // routage (intent/entities/confidence/agent/tools).
    const turnStartedAt = Date.now();
    try {
      if (!message || !message.trim()) {
        throw new OrchestratorError("AIManager.handleMessage requires a non-empty 'message'.");
      }

      let effectiveMessage = message;
      if (this.promptInjectionGuard) {
        const scanResult = this.promptInjectionGuard.scan(message);
        if (scanResult.flagged) {
          this.logger.warn(`prompt injection pattern(s) detected in user message: ${scanResult.matches.join(", ")}`);
        }
        effectiveMessage = scanResult.sanitizedText;
      }

      let detectionMessage = effectiveMessage;

      // AI-Business-Copilot/31_PENDING_MEETING_CONFIRMATION_ROUTING.md —
      // vérifié AVANT tout le reste (ContextResolver ET IntentDetector) :
      // un PendingAction actif pour CET utilisateur authentifié est un
      // signal plus fort que n'importe quelle détection lexicale. Message
      // BRUT, jamais enrichi (ContextResolver ne s'exécute pas dans cette
      // branche) — un "oui" enrichi en "oui (à propos de reunion)" ferait
      // échouer MeetingAgent.classifyConfirmation() (message trop long pour
      // son marqueur faible).
      intent = this._resolvePendingAgentIntent(conversationId, user, effectiveMessage);
      const viaPendingActionBypass = Boolean(intent);

      if (intent) {
        this.logger.info(`PendingAction actif ("${intent.name}") pour cette conversation : routage direct, IntentDetector/ContextResolver non appelés pour ce tour.`);
        await this.conversationManager.recordUserMessage(conversationId, effectiveMessage);
      } else {
        const userId = user && user.id;
        if (this.contextManager && pageContext) {
          this.contextManager.setPageContext(conversationId, userId, pageContext);
        }
        entities = this.entityExtractor ? this.entityExtractor(effectiveMessage) : null;
        const attachedThisTurn = Array.isArray(documents) && documents.length > 0;
        if (this.contextManager && attachedThisTurn) {
          this.contextManager.setActiveDocuments(conversationId, userId, documents);
        }

        // Personne / société / promoteur PRÉCIS (« Zakariah Derbel donne-moi
        // plus de détails sur cet ingénieur », « Et ses projets ? ») : route
        // calculée avant tout, à partir du message BRUT et du sujet de la
        // conversation — un nom précis n'est jamais une demande de liste.
        if (this.queryRouter && this._intentCatalogByKey.has("entity_lookup")) {
          const preview = this.contextManager ? this.contextManager.buildTurnContext({ conversationId, userId, entities }) : null;
          lookupRoute = this.queryRouter.route(effectiveMessage, {
            focus: this.contextManager ? this.contextManager.getFocusEntity(conversationId, userId) : null,
            currentProject: preview ? preview.currentProject : null,
          });
        }

        // Mémoriser le contexte — références et reformulations (voir
        // CONVERSATION_CONTEXT.md). Lu AVANT recordUserMessage ci-dessous,
        // pour que l'historique reflète les tours PRÉCÉDENTS uniquement, pas
        // le message en cours de traitement.
        if (this.contextResolver) {
          const history = await this.conversationManager.getHistory(conversationId);
          // `getCurrentTopic` survit au-delà de la fenêtre d'historique
          // (conversations longues, voir conversationManager.js) — prioritaire
          // sur la relecture de `history` à l'intérieur du resolver lui-même.
          const currentTopic = this.conversationManager.getCurrentTopic(conversationId);
          const resolution = this.contextResolver.resolve({ message: effectiveMessage, history, currentTopic });

          const structuredPreview =
            resolution.ambiguous && this.contextManager
              ? this.contextManager.buildTurnContext({ conversationId, userId, entities })
              : null;
          // Un document actif lève aussi l'ambiguïté (« ceux mentionnés dans ce
          // document ») : la question porte sur le document joint.
          const resolvedByStructuredContext = Boolean(
            structuredPreview &&
              ((structuredPreview.inferredIntent && !structuredPreview.clarification) || (structuredPreview.documents && structuredPreview.documents.length))
          );

          if (resolution.ambiguous && !resolvedByStructuredContext && !lookupRoute) {
            this.logger.info("message ambigu : référence détectée sans sujet antérieur connu, demande de clarification");
            await this.conversationManager.recordUserMessage(conversationId, effectiveMessage);
            await this._audit({ actor: user, action: "conversation_turn", resource: null, outcome: "flagged", conversationId, metadata: { reason: "ambiguous_reference", executionTimeMs: Date.now() - turnStartedAt } });
            return this.responseBuilder.buildClarificationResponse({
              conversationId,
              message: "Je ne suis pas sûr de ce à quoi vous faites référence — pouvez-vous préciser votre demande ?",
            });
          }

          if (resolution.isReference) {
            this.logger.info(`référence résolue vers le sujet "${resolution.resolvedTopic}"`);
            detectionMessage = resolution.enrichedMessage;
          }
        }

        await this.conversationManager.recordUserMessage(conversationId, effectiveMessage);

        intent = await this.intentDetector.detect(detectionMessage, { user, conversationId });
        this.logger.info(`intent detected: "${intent.name}"`);

        // AI-Business-Copilot/26_MEETING_AGENT_CONTINUITY.md — un workflow
        // conversationnel actif (ex. meeting_agent en cours de collecte)
        // peut faire l'objet d'une reclassification erronée d'un tour à
        // l'autre (voir ConversationContinuityResolver, sa propre doc pour
        // les deux signaux combinés). Avant même le contrôle d'ambiguïté
        // ci-dessous, pour que le sujet actif soit rétabli AVANT toute
        // décision fondée sur `intent`. Sans `continuityResolver` (défaut),
        // comportement strictement inchangé.
        if (this.continuityResolver) {
          const activeTopic = this.conversationManager.getCurrentTopic(conversationId);
          const continuedIntent = this.continuityResolver.resolve({ message: detectionMessage, freshIntent: intent, activeTopic });
          if (continuedIntent.name !== intent.name) {
            this.logger.info(`continuité conversationnelle : "${intent.name}" (confiance ${intent.confidence}) remplacée par le sujet actif "${continuedIntent.name}"`);
          }
          intent = continuedIntent;
        }

        // Phase 3 — demande composée (lecture + action pour chacun) : décidée
        // de façon déterministe par TaskPlanner.detect(), avant tout le reste.
        let taskFocused = false;
        if (this.taskPlanner && this._intentCatalogByKey.has("multi_step_task") && this.taskPlanner.detect(effectiveMessage, entities)) {
          this.logger.info(`demande composée : "${intent.name}" -> "multi_step_task"`);
          intent = { ...buildIntentFromCatalogEntry(this._intentCatalogByKey.get("multi_step_task")), resolvedBy: "task_planner" };
          taskFocused = true;
        }

        // Personne / société / promoteur précis : prioritaire sur la liste des
        // ingénieurs et sur l'analytique (voir QueryRouter). « Les projets de
        // X » sans le mot « ingénieur » n'est retenu que si X est un ingénieur
        // du CRM — sinon le routage existant (projets d'un commercial) s'applique.
        // Liste simple d'une entité qui a déjà son Agent (projets, contacts,
        // demandes RH / maintenance) : si la détection lexicale n'a rien
        // reconnu de précis (formulation anglaise ou russe), la demande lui est
        // confiée — jamais une clarification pour « liste des X ».
        if (!taskFocused && lookupRoute && lookupRoute.delegateIntent) {
          const delegate = this._intentCatalogByKey.get(lookupRoute.delegateIntent);
          // Délégation aussi quand le routeur indique explicitement quelle
          // intention lexicale il corrige (« projets dont le client est refusé »
          // est une question sur les contacts refusés).
          const unrouted = UNROUTED_INTENTS.has(intent.name) || (Array.isArray(lookupRoute.overrideIntents) && lookupRoute.overrideIntents.includes(intent.name));
          this._routerTrace(lookupRoute, { lexicalIntent: intent.name, accepted: Boolean(delegate) && (unrouted || intent.name === lookupRoute.delegateIntent) });
          if (delegate && unrouted) {
            this.logger.info(`liste "${lookupRoute.entity}" : "${intent.name}" -> "${delegate.key}"`);
            intent = { ...buildIntentFromCatalogEntry(delegate), resolvedBy: "entity_list" };
          }
        }
        if (!taskFocused && lookupRoute && !lookupRoute.delegateIntent) {
          let accepted = this.queryRouter.accepts(lookupRoute, intent.name);
          if (accepted && lookupRoute.requiresEngineerMatch) {
            accepted = Boolean(this.engineerProbe) && (await this.engineerProbe(lookupRoute.target));
            // « Les projets de 2M Batiment » : pas un ingénieur, mais une société du CRM.
            if (!accepted && this.entityProbe) {
              const known = await this.entityProbe(lookupRoute.target);
              if (known && known.company && !known.person) {
                lookupRoute = { ...lookupRoute, entity: "company", requiresEngineerMatch: false };
                accepted = true;
              }
            }
          }
          // « Quels projets sont associés à X ? » : retenu seulement si X est une
          // personne ou une société connue du CRM — sinon le routage existant
          // (projets d'un commercial nommé) s'applique.
          if (accepted === "known") {
            const known = this.entityProbe ? await this.entityProbe(lookupRoute.target) : null;
            accepted = Boolean(known && (known.person || known.company));
          }
          // « Informations de X » classé « projets » (ou contacts) : X est-il une
          // personne du CRM ? Une personne connue l'emporte ; un nom inconnu
          // partout (ni personne ni projet) reçoit « introuvable dans le CRM »
          // plutôt qu'une réponse tirée de la documentation.
          if (accepted === "probe") {
            const known = this.entityProbe ? await this.entityProbe(lookupRoute.target) : null;
            accepted = Boolean(known) && (known.person || (intent.name === "projects" && !known.project));
          }
          this._routerTrace(lookupRoute, { lexicalIntent: intent.name, accepted });
          if (accepted) {
            this.logger.info(`entité précise : "${intent.name}" -> "entity_lookup" (${lookupRoute.entity}/${lookupRoute.operation}, source ${lookupRoute.source})`);
            intent = { ...buildIntentFromCatalogEntry(this._intentCatalogByKey.get("entity_lookup")), resolvedBy: "query_router", query: lookupRoute };
            taskFocused = true;
          }
        }

        // Analytique CRM — comptage / classement / répartition sur les données
        // du CRM (« Quel ingénieur a le plus de projets ? », FR/EN/RU) : un Tool
        // statistique, jamais la documentation. Déterministe, avant le reste.
        // Même parseur pour les ingénieurs (intention `engineers` : liste,
        // ingénieur d'un projet précis).
        // « Afficher les suivants » : page suivante de la liste des ingénieurs
        // en cours — uniquement si une liste vient d'être affichée.
        const listCursor = !taskFocused && this.analyticsParser && this.contextManager && this.analyticsParser.isNextPage(effectiveMessage) ? this.contextManager.getListCursor(conversationId, userId) : null;
        if (listCursor && listCursor.entity === "engineer" && this._intentCatalogByKey.has("engineers")) {
          this.logger.info(`page suivante de la liste des ingénieurs (à partir de ${listCursor.nextOffset})`);
          intent = { ...buildIntentFromCatalogEntry(this._intentCatalogByKey.get("engineers")), resolvedBy: "list_cursor", listCursor };
          taskFocused = true;
        }
        if (listCursor && listCursor.entity === "project" && this._intentCatalogByKey.has("projects")) {
          this.logger.info(`page suivante de la liste des projets (à partir de ${listCursor.nextOffset})`);
          intent = { ...buildIntentFromCatalogEntry(this._intentCatalogByKey.get("projects")), resolvedBy: "list_cursor", listCursor };
          taskFocused = true;
        }
        if (listCursor && ["promoter", "company"].includes(listCursor.entity) && this._intentCatalogByKey.has("entity_lookup")) {
          this.logger.info(`page suivante de la liste (${listCursor.entity}, à partir de ${listCursor.nextOffset})`);
          const language = listCursor.language || "fr";
          const query = { language, source: "crm", mode: "CRM_ONLY", entity: listCursor.entity, operation: "list", target: null, offset: listCursor.nextOffset, fields: [], fromContext: true, crmSearch: true, webSearch: false, ...(listCursor.options || {}) };
          intent = { ...buildIntentFromCatalogEntry(this._intentCatalogByKey.get("entity_lookup")), resolvedBy: "list_cursor", query };
          taskFocused = true;
        }
        const crmQuery = !taskFocused && this.analyticsParser ? this.analyticsParser.parse(effectiveMessage) : null;
        const crmIntentKey = crmQuery && crmQuery.domain === "engineer" ? "engineers" : "crm_analytics";
        this._debugTrace({
          stage: "intent",
          message: effectiveMessage,
          language: crmQuery ? crmQuery.language : undefined,
          intent: intent.name,
          confidence: intent.confidence,
          entities: entities ? { entityType: entities.entityType, ownership: entities.ownership } : null,
          crmQuery: crmQuery ? `${crmQuery.domain}/${crmQuery.groupBy || "-"}/${crmQuery.operation}` : null,
        });
        if (crmQuery && this._intentCatalogByKey.has(crmIntentKey) && this.analyticsParser.shouldRoute(crmQuery, intent.name)) {
          this.logger.info(`question de données CRM : "${intent.name}" -> "${crmIntentKey}"`);
          // Liste des ingénieurs / ingénieur d'un projet : nouvelle demande,
          // sans cible — le sujet précédent (une personne) n'est pas repris.
          if (crmQuery.domain === "engineer") {
            this._routerTrace(
              { language: crmQuery.language, entity: "engineer", operation: crmQuery.operation, target: crmQuery.projectName || null, source: "crm", crmSearch: true, webSearch: false, fromContext: false },
              { lexicalIntent: intent.name, accepted: true }
            );
          }
          intent = { ...buildIntentFromCatalogEntry(this._intentCatalogByKey.get(crmIntentKey)), resolvedBy: "analytics" };
          taskFocused = true;
        }

        // Phase 2 — question sur un document joint : décidée AVANT le contrôle
        // d'ambiguïté et la résolution sémantique (voir
        // SemanticIntentResolver.resolveDocumentFocus pour les règles). Sans
        // document actif dans la conversation, rien ne change.
        let documentFocused = false;
        if (!taskFocused && this.semanticResolver && this.contextManager) {
          const docPreview = this.contextManager.buildTurnContext({ conversationId, userId, entities, intentName: intent.name });
          const documentIntent = this.semanticResolver.resolveDocumentFocus({ intent, message: effectiveMessage, entities, turnContext: docPreview, attachedThisTurn });
          if (documentIntent) {
            this.logger.info(`question documentaire : "${intent.name}" -> "${documentIntent.name}"`);
            intent = documentIntent;
            documentFocused = true;
          }
        }

        // Étape 11 (AI-Business-Copilot/10_INTENT_ROUTING_FIX.md) : "si la
        // confiance est faible, ne pas choisir arbitrairement un Agent —
        // poser une question de clarification". `intent.ambiguous` est un
        // signal délibérément étroit (voir intentConfidence.js) — vérifié par
        // simulation à ne JAMAIS se déclencher sur les 536 scénarios déjà
        // validés du corpus, donc aucune régression de routage existant.
        // Toujours construite à partir de DEUX intentions réelles du
        // catalogue (`intent`/`intent.alternateIntent`), jamais inventée.
        if (!documentFocused && !taskFocused && intent.ambiguous && intent.alternateIntent) {
          this.logger.info(`intention ambiguë : "${intent.name}" vs "${intent.alternateIntent.name}", demande de clarification`);
          await this._audit({
            actor: user,
            action: "conversation_turn",
            resource: intent.name,
            outcome: "flagged",
            conversationId,
            metadata: { reason: "ambiguous_intent", alternate: intent.alternateIntent.name, confidence: intent.confidence, executionTimeMs: Date.now() - turnStartedAt },
          });
          return this.responseBuilder.buildClarificationResponse({
            conversationId,
            message: `Votre question peut correspondre à deux besoins différents : ${intent.description} ou ${intent.alternateIntent.description} Pouvez-vous préciser votre demande ?`,
          });
        }

        // Phase 1 — compréhension au-delà des mots-clés : UNIQUEMENT quand la
        // détection lexicale n'a rien trouvé de précis (general_chat), voir
        // semanticIntentResolver.js. Une intention lexicale précise n'est
        // jamais remplacée.
        if (this.semanticResolver && !documentFocused && !taskFocused) {
          const preview = this.contextManager ? this.contextManager.buildTurnContext({ conversationId, userId, entities, intentName: intent.name }) : null;
          const semantic = await this.semanticResolver.resolve({ intent, message: effectiveMessage, entities, turnContext: preview, user });
          if (semantic.clarification) {
            this._debugTrace({ stage: "clarification", intent: intent.name, confidence: intent.confidence, fallback: "semantic_clarification", reason: semantic.intent.resolvedBy, entities: entities ? { entityType: entities.entityType } : null });
            await this._audit({ actor: user, action: "conversation_turn", resource: intent.name, outcome: "flagged", conversationId, metadata: { reason: semantic.intent.resolvedBy, confidence: intent.confidence, executionTimeMs: Date.now() - turnStartedAt } });
            const clarificationResponse = this.responseBuilder.buildClarificationResponse({ conversationId, message: semantic.clarification.message, options: semantic.clarification.options });
            await this.conversationManager.recordAssistantMessage(conversationId, clarificationResponse.answer, { intent: null, mode: "clarification" });
            return clarificationResponse;
          }
          if (semantic.intent.name !== intent.name) {
            this.logger.info(`intention affinée : "${intent.name}" -> "${semantic.intent.name}" (${semantic.intent.resolvedBy}, confiance ${semantic.intent.confidence})`);
          }
          intent = semantic.intent;
        }

        // Une question de DONNÉES CRM (comptage, classement…) que l'analytique
        // ne couvre pas encore ne part jamais vers la documentation : réponse
        // honnête sur ce qui peut être analysé, au lieu de « je ne trouve pas
        // cette information dans la documentation ».
        if (intent.name === "general_chat" && this.analyticsParser && this.analyticsParser.looksLikeCrmDataQuestion(effectiveMessage)) {
          await this._audit({ actor: user, action: "conversation_turn", resource: intent.name, outcome: "flagged", conversationId, metadata: { reason: "crm_data_question_unsupported", executionTimeMs: Date.now() - turnStartedAt } });
          const clarificationResponse = this.responseBuilder.buildClarificationResponse({
            conversationId,
            message: buildAnalyticsErrorAnswer("notUnderstood", this.analyticsParser.languageOf(effectiveMessage)),
          });
          await this.conversationManager.recordAssistantMessage(conversationId, clarificationResponse.answer, { intent: null, mode: "clarification" });
          return clarificationResponse;
        }
      }

      // Étape 4 du workflow — "vérifier les permissions" — avant toute
      // construction de contexte ou sélection de Tool (échec rapide). Même
      // prédicat que PermissionManager (Tools)/BaseAgent (Agents) — voir
      // utils/authorization.js. N'appelle isAuthorized() QUE si l'intention
      // déclare une restriction réelle : isAuthorized() exige un
      // `actingUser.role` même pour un contrôle "ouvert à tous" (voir sa
      // propre garde `!actingUser.role`), ce qui pénaliserait à tort tout
      // appelant dont l'objet `user` n'a pas de rôle alors qu'AUCUNE
      // intention par défaut ne déclare de restriction (voir
      // intentCatalog.js) — comportement strictement inchangé tant qu'aucune
      // restriction n'est configurée.
      const requiredRoles = intent.requiredRoles || [];
      const allowedEmails = intent.allowedEmails || [];
      const hasIntentRestriction = requiredRoles.length > 0 || allowedEmails.length > 0;
      if (hasIntentRestriction && !isAuthorized({ requiredRoles, allowedEmails }, user)) {
        this.logger.warn(`denied intent "${intent.name}" for role "${user && user.role}"`);
        await this._audit({
          actor: user,
          action: "conversation_turn",
          resource: intent.name,
          outcome: "denied",
          conversationId,
          metadata: { reason: "permission_denied", entities: intent.entities || [], confidence: intent.confidence, executionTimeMs: Date.now() - turnStartedAt },
        });
        throw new OrchestratorPermissionError(intent.name, user && user.role);
      }

      // Phase 1 — contexte structuré du tour (filtres hérités, référence
      // résolue, écran courant), transmis à l'Agent. Une référence qui ne
      // peut pas être résolue (« le deuxième » sans liste, « celui-ci » sans
      // fiche) donne une question de clarification, jamais une supposition.
      if (this.contextManager && !viaPendingActionBypass) {
        turnContext = this.contextManager.buildTurnContext({ conversationId, userId: user && user.id, entities, intentName: intent.name });
        if (turnContext.clarification && turnContext.entityType && turnContext.inferredIntent === intent.name) {
          await this._audit({ actor: user, action: "conversation_turn", resource: intent.name, outcome: "flagged", conversationId, metadata: { reason: "unresolved_reference", executionTimeMs: Date.now() - turnStartedAt } });
          const clarificationResponse = this.responseBuilder.buildClarificationResponse({ conversationId, message: turnContext.clarification });
          await this.conversationManager.recordAssistantMessage(conversationId, clarificationResponse.answer, { intent: intent.name, mode: "clarification" });
          return clarificationResponse;
        }
      }

      const agent = this.agentRouter.select(intent, user);

      let outcome;
      if (agent) {
        // `context` n'est transmis que si la Phase 1 est active : sans
        // ContextManager, l'appel reste strictement identique à l'existant.
        const executeArgs = { intent, message: detectionMessage, user, conversationId };
        if (this.contextManager) executeArgs.context = turnContext;
        const agentResult = await agent.execute(executeArgs);
        outcome = {
          mode: "agent",
          agentName: agent.name,
          answer: agentResult && agentResult.answer,
          citations: (agentResult && agentResult.citations) || [],
          toolSteps: (agentResult && agentResult.toolSteps) || [],
          suggestions: (agentResult && agentResult.suggestions) || [],
          dataQuality: (agentResult && agentResult.dataQuality) || [],
          pendingAction: (agentResult && agentResult.pendingAction) || null,
          resultSet: (agentResult && agentResult.resultSet) || null,
          selectedRecord: (agentResult && agentResult.selectedRecord) || null,
          focusEntity: (agentResult && agentResult.focusEntity) || null,
          listCursor: (agentResult && agentResult.listCursor) || null,
        };
      } else {
        const tools = this.toolRouter.select(intent, detectionMessage);
        outcome = await this.workflowManager.run({ intent, message: detectionMessage, user, conversationId, tools });
      }

      const response = this.responseBuilder.build({ conversationId, intent, ...outcome });

      // AI-Business-Copilot/32_MEETING_CONTEXT_AFTER_EXECUTION.md — reproduit
      // en direct : après une réunion CONFIRMÉE et créée, "Créer une
      // activité"/"Créer un rappel"/"Préparer un email" ressortaient encore
      // le récapitulatif de l'ANCIENNE réunion. Deux signaux de terminaison
      // d'un workflow conversationnel, jamais un seul :
      // 1. `wasSuccessfulCalendarWrite` (INCHANGÉ, AI-Business-Copilot/
      //    26_MEETING_AGENT_CONTINUITY.md) — une écriture calendrier RÉELLE
      //    (create/update/delete_calendar_event), pour le flux LLM
      //    modification/annulation existant.
      // 2. `pendingActionJustResolved` — un PendingAction actif au DÉBUT de
      //    CE tour (`viaPendingActionBypass`, voir
      //    31_PENDING_MEETING_CONFIRMATION_ROUTING.md) qui ne l'est PLUS à
      //    la fin (`!outcome.pendingAction`) : couvre la CRÉATION confirmée
      //    (`_resolvePendingMeeting` renvoie `pendingAction: null`) ET
      //    l'ANNULATION (idem, aucune écriture calendrier associée — sans ce
      //    second signal, "annule" ne fermait jamais le sujet). Une décision
      //    AMBIGUË (`pendingAction` toujours `{id, payload}`, jamais `null`)
      //    ne ferme rien — la proposition reste active, comportement voulu.
      const calendarWriteJustHappened = (outcome.toolSteps || []).some(wasSuccessfulCalendarWrite);
      const pendingActionJustResolved = viaPendingActionBypass && !outcome.pendingAction;
      const conversationalTopicClosed = calendarWriteJustHappened || pendingActionJustResolved;

      // `topicClosed` : marque CE tour, dans l'historique lui-même (jamais
      // effacé/réécrit ensuite — voir ConversationContextResolver.md), comme
      // la fin d'un sujet conversationnel. `ConversationContextResolver`
      // (repli `_lastKnownTopic`, utilisé quand `currentTopic` est `null`)
      // s'arrête désormais sur ce marqueur au lieu de remonter plus loin
      // dans l'historique et de ressusciter un sujet déjà clos — sans lui,
      // `clearCurrentTopic()` ci-dessous n'empêchait QUE la continuité
      // rapide (`ConversationContinuityResolver`), jamais ce repli
      // historique séparé.
      const assistantMeta = { intent: intent.name, mode: outcome.mode };
      if (conversationalTopicClosed) assistantMeta.topicClosed = true;
      await this.conversationManager.recordAssistantMessage(conversationId, response.answer, assistantMeta);

      // APRÈS recordAssistantMessage() : celui-ci réenregistrerait sinon
      // `intent.name` (encore "meetings" pour CE tour) comme sujet courant
      // et annulerait l'effacement au tour même où il doit avoir lieu.
      // Jamais gardé derrière `this.continuityResolver` seul (comme avant
      // cette passe) : `ConversationContextResolver` lit lui aussi
      // `_currentTopic` (voir `currentTopic` passé à `resolve()`) — sans
      // `continuityResolver` configuré, `_currentTopic` n'était donc jamais
      // effacé non plus, un angle mort séparé de la même famille de bug.
      if (conversationalTopicClosed) {
        this.conversationManager.clearCurrentTopic(conversationId);
      }
      // Sujet de la conversation (« Et ses projets ? ») : mis à jour seulement
      // quand une entité a été identifiée sans ambiguïté.
      // Liste paginée : la position est mémorisée tant qu'il reste des pages,
      // et oubliée dès que la conversation passe à autre chose.
      if (this.contextManager && !viaPendingActionBypass) {
        this.contextManager.setListCursor(conversationId, user && user.id, outcome.listCursor || null);
      }
      if (this.contextManager && outcome.focusEntity) {
        this.contextManager.setFocusEntity(conversationId, user && user.id, outcome.focusEntity);
      }
      if (this.contextManager && !viaPendingActionBypass) {
        this.contextManager.recordTurn({
          conversationId,
          userId: user && user.id,
          intentName: intent.name,
          turnContext,
          resultSet: outcome.resultSet || null,
          selectedRecord: outcome.selectedRecord || null,
          toolSteps: outcome.toolSteps || [],
        });
      }
      await this._audit({
        actor: user,
        action: "conversation_turn",
        resource: intent.name,
        outcome: "success",
        conversationId,
        metadata: {
          mode: outcome.mode,
          agent: outcome.agentName || null,
          entities: intent.entities || [],
          confidence: intent.confidence,
          // Phase 1 — comment l'intention a été comprise (clés seulement, jamais
          // les valeurs extraites) ; absent sans les collaborateurs Phase 1.
          ...(this.semanticResolver || this.contextManager
            ? {
                resolvedBy: intent.resolvedBy || "lexical",
                filters: turnContext ? Object.keys(turnContext.filters) : [],
                reference: turnContext && turnContext.reference ? turnContext.reference.kind : null,
              }
            : {}),
          tools: [...new Set((outcome.toolSteps || []).map((s) => s.tool).filter(Boolean))],
          executionTimeMs: Date.now() - turnStartedAt,
        },
      });
      if (process.env.AI_DEBUG_TRACE === "true") {
        const steps = outcome.toolSteps || [];
        const out = steps.length ? steps[steps.length - 1].output : null;
        const parsed = typeof out === "string" ? (() => { try { return JSON.parse(out); } catch { return null; } })() : out;
        const rows = parsed && (parsed.items || parsed.groups || parsed.matches || parsed.data || parsed.contacts);
        // Tool réellement appelé et volume renvoyé — journal du serveur uniquement.
        this.logger.info(`[PROBAR_TOOL] tool=${steps.map((x) => x.tool).filter(Boolean).join(",") || "none"}`);
        this.logger.info(`[PROBAR_RESULT] count=${parsed && Number.isInteger(parsed.total) ? parsed.total : Array.isArray(rows) ? rows.length : "n/a"}`);
        this._debugTrace({
          stage: "response",
          entity: entities ? entities.entityType : null,
          operation: this.analyticsParser && (intent.name === "engineers" || intent.name === "crm_analytics") ? (this.analyticsParser.parse(effectiveMessage) || {}).operation : undefined,
          intent: intent.name,
          resolvedBy: intent.resolvedBy || "lexical",
          agent: outcome.agentName || null,
          tool: steps.map((s) => s.tool).filter(Boolean).join(",") || null,
          toolSuccess: steps.length ? steps.every((s) => s.output !== null && s.output !== undefined && !/^Error:/.test(String(s.output))) : null,
          resultCount: Array.isArray(rows) ? rows.length : parsed && Number.isInteger(parsed.total) ? parsed.total : null,
          mode: outcome.mode,
          ms: Date.now() - turnStartedAt,
        });
      }
      return response;
    } catch (err) {
      this.logger.warn(`handleMessage failed: ${err.message}`);
      if (!(err instanceof OrchestratorPermissionError)) {
        // The "denied" case is already audited right where it's thrown,
        // above — auditing it again here would double-count it as
        // "failure" too.
        await this._audit({
          actor: user,
          action: "conversation_turn",
          resource: intent ? intent.name : null,
          outcome: "failure",
          conversationId,
          metadata: { reason: err.message, executionTimeMs: Date.now() - turnStartedAt },
        });
      }
      return this.responseBuilder.buildErrorResponse(err, { conversationId, intent });
    }
  }

  // Étape 12 du workflow — "journaliser la conversation" (volet audit de
  // sécurité, distinct de conversationManager qui journalise pour le
  // CONTEXTE des tours suivants). Best-effort, comme
  // McpServer._audit()/mcpServer.js : un échec d'écriture de l'audit
  // n'interrompt jamais le tour de conversation réel, et ne fait rien du
  // tout si aucun auditLog n'a été fourni (rétrocompatible par défaut).
  // Trace de diagnostic `[PROBAR_DEBUG]` — UNIQUEMENT si AI_DEBUG_TRACE=true
  // (désactivée par défaut). Message tronqué à 200 caractères ; jamais de
  // JWT, mot de passe, secret ni jeton (aucun de ces champs n'est transmis ici).
  // Trace `[PROBAR_ROUTER]` — même garde que `[PROBAR_DEBUG]`
  // (AI_DEBUG_TRACE=true) : pourquoi une question a (ou n'a pas) été traitée
  // comme la recherche d'une entité précise. Le nom recherché est celui que
  // l'utilisateur a saisi, tronqué ; jamais de donnée du CRM.
  _routerTrace(route, { lexicalIntent, accepted }) {
    if (process.env.AI_DEBUG_TRACE !== "true") return;
    this.logger.info(`[PROBAR_INTENT] language=${route.language} entity=${route.entity} operation=${route.operation} target=${route.target ? JSON.stringify(String(route.target).slice(0, 80)) : "null"} source=${route.source}`);
    this.logger.info(
      `[PROBAR_ROUTER] language=${route.language} entity=${route.entity} operation=${route.operation} target=${route.target ? JSON.stringify(String(route.target).slice(0, 80)) : "null"} ` +
        `source=${route.source} crmSearch=${route.crmSearch} webSearch=${route.webSearch} fromContext=${route.fromContext} lexicalIntent=${lexicalIntent} accepted=${accepted}`
    );
  }

  _debugTrace(fields) {
    if (process.env.AI_DEBUG_TRACE !== "true") return;
    const parts = Object.entries(fields)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${k === "message" ? JSON.stringify(String(v).slice(0, 200)) : typeof v === "object" && v !== null ? JSON.stringify(v) : v}`);
    this.logger.info(`[PROBAR_DEBUG] ${parts.join(" ")}`);
  }

  async _audit(event) {
    if (!this.auditLog) return;
    try {
      await this.auditLog.record(event);
    } catch (err) {
      this.logger.warn(`audit log recording failed: ${err.message}`);
    }
  }
}

module.exports = { AIManager };
