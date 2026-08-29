"use strict";

const { OrchestratorError, ConfigurationError, OrchestratorPermissionError } = require("./errors");
const { createOrchestratorLogger } = require("./logger");
const { isAuthorized } = require("../utils/authorization");
const { DEFAULT_INTENT_CATALOG } = require("./intentCatalog");

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
const PENDING_ACTION_TYPE_TO_INTENT_KEY = { create_meeting: "meetings" };

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
  _resolvePendingAgentIntent(conversationId, user) {
    if (!this.pendingActionStore) return null;
    const pending = this.pendingActionStore.peek(conversationId);
    if (!pending) return null;
    if (!user || pending.actingUserId !== user.id) return null;
    const catalogKey = PENDING_ACTION_TYPE_TO_INTENT_KEY[pending.type];
    if (!catalogKey) return null;
    const entry = this._intentCatalogByKey.get(catalogKey);
    if (!entry) return null;
    return buildIntentFromCatalogEntry(entry);
  }

  async handleMessage({ message, user, conversationId = null }) {
    let intent = null;
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
      intent = this._resolvePendingAgentIntent(conversationId, user);
      const viaPendingActionBypass = Boolean(intent);

      if (intent) {
        this.logger.info(`PendingAction actif ("${intent.name}") pour cette conversation : routage direct, IntentDetector/ContextResolver non appelés pour ce tour.`);
        await this.conversationManager.recordUserMessage(conversationId, effectiveMessage);
      } else {
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

          if (resolution.ambiguous) {
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

        // Étape 11 (AI-Business-Copilot/10_INTENT_ROUTING_FIX.md) : "si la
        // confiance est faible, ne pas choisir arbitrairement un Agent —
        // poser une question de clarification". `intent.ambiguous` est un
        // signal délibérément étroit (voir intentConfidence.js) — vérifié par
        // simulation à ne JAMAIS se déclencher sur les 536 scénarios déjà
        // validés du corpus, donc aucune régression de routage existant.
        // Toujours construite à partir de DEUX intentions réelles du
        // catalogue (`intent`/`intent.alternateIntent`), jamais inventée.
        if (intent.ambiguous && intent.alternateIntent) {
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

      const agent = this.agentRouter.select(intent, user);

      let outcome;
      if (agent) {
        const agentResult = await agent.execute({ intent, message: detectionMessage, user, conversationId });
        outcome = {
          mode: "agent",
          agentName: agent.name,
          answer: agentResult && agentResult.answer,
          citations: (agentResult && agentResult.citations) || [],
          toolSteps: (agentResult && agentResult.toolSteps) || [],
          suggestions: (agentResult && agentResult.suggestions) || [],
          dataQuality: (agentResult && agentResult.dataQuality) || [],
          pendingAction: (agentResult && agentResult.pendingAction) || null,
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
          tools: [...new Set((outcome.toolSteps || []).map((s) => s.tool).filter(Boolean))],
          executionTimeMs: Date.now() - turnStartedAt,
        },
      });
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
