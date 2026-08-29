"use strict";

const crypto = require("crypto");
const { BaseAgent } = require("./baseAgent");
const { AgentError, ConfigurationError } = require("./errors");
const { tokenize } = require("../utils/tokenize");
const { extractCommercialActionSlots, isCommercialActionRequest } = require("./commercialActionSlotExtractor");
// Réutilise EXACTEMENT la même classification confirmer/annuler/ambigu que
// MeetingAgent (mots "confirme"/"oui"/... vs "non"/"annule"/...) — jamais
// une deuxième définition de ce qui compte comme une confirmation dans ce
// Copilot. `meetingAgent.js` n'est pas modifié par cette réutilisation (une
// simple lecture d'une fonction pure déjà exportée).
const { classifyConfirmation } = require("./meetingAgent");
const {
  buildRelanceProposalAnswer,
  buildRelanceCancelledAnswer,
  buildRelanceAmbiguousAnswer,
  buildRelanceExpiredAnswer,
  buildMissingDateAnswer,
  buildContactNotFoundAnswer,
  buildContactAmbiguousAnswer,
  buildCommercialNotFoundAnswer,
  buildRelanceExecutedAnswer,
} = require("../reasoning/commercialActionAnswerBuilder");

// Les 6 Tools du module Commercial-Contacts (voir mcp/tools/commercialContacts/).
// `get_my_commercial_contacts` renvoie des ENREGISTREMENTS individuels (et
// sert aussi, avec `search`, à résoudre un nom de contact — mission
// "CORRIGER LES ACTIONS COMMERCIALES DEPUIS LA LISTE DES CONTACTS").
// `list_commercial_candidates` (module Users, même Tool déjà réutilisé par
// ProjectAgent pour résoudre un nom de propriétaire) résout un email de
// commercial vers un id réel. `schedule_commercial_contact_relance` est la
// SEULE écriture — jamais appelée directement, uniquement via le cycle
// PendingAction ci-dessous (propose -> confirmation explicite -> exécution).
const ALLOWED_TOOL_NAMES = [
  "get_commercial_contact_analytics",
  "get_commercial_contact_kpi",
  "get_commercial_personal_kpi_summary",
  "get_my_commercial_contacts",
  "list_commercial_candidates",
  "schedule_commercial_contact_relance",
];

// Identique au requiredRoles déclaré par les Tools d'écriture/lecture propres
// à ce module (voir mcp/tools/commercialContacts/*.js) : contrairement à
// Projects/Pipeline/Maintenance (accès mixte, laissés ouverts au niveau
// Agent), aucun Tool de ce module n'est ouvert à tout authentifié — le gate
// de l'Agent peut donc refléter fidèlement celui des Tools, sans être ni
// plus large ni plus restrictif.
const REQUIRED_ROLES = ["commercial", "admin", "superadmin", "superadmin2"];

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "CORRIGER
// LE COPILOT POUR LE RÔLE COMMERCIAL". Signal lexical scopé à CET Agent
// (pas un mot-clé de routage global — voir intentCatalog.js, même
// discipline que ProjectAgent::ATTENTION_MARKERS) : ne se déclenche QUE
// quand CommercialAgent a déjà été sélectionné pour l'intention
// "commercial_contacts", donc jamais de faux positif sur un message sans
// rapport. "relance"/"relancer"/"relances" sont AUSSI des mots-clés réels
// du catalogue (voir intentCatalog.js) — chevauchement volontaire et sûr,
// même précédent que "critique"/"retard" pour ProjectAgent.
const RELANCE_MARKERS = ["relance", "relancer", "relances", "rappeler"];

// Mission "CORRIGER LE COPILOT POUR LES DEMANDES COMMERCIALES ADMIN" —
// reproduit en direct : pour "quelle sont total des contacts ?", le modèle
// répond parfois qu'il n'a "pas accès aux données globales" (alors que
// get_commercial_contact_kpi les fournit réellement), et pour "Combien ai-je
// de contacts ?" il a une fois répondu "12" SANS appeler aucun Tool — un
// chiffre entièrement fabriqué (le compte réel, vérifié en base, était très
// différent). Même discipline que RELANCE_MARKERS : mot-clé LOCAL à CET
// Agent (jamais un mot-clé du catalogue d'intentions global), qui ne
// déclenche donc jamais hors de l'intention commercial_contacts déjà
// sélectionnée. Vérifié en premier dans _run() APRÈS RELANCE_MARKERS —
// "combien de clients dois-je relancer" continue de suivre le chemin de
// relance déjà établi, jamais reclassé ici.
const KPI_QUERY_MARKERS = ["total", "totaux", "combien"];

// "Donne-moi les contacts de <Nom>" — un filtre par nom, en LECTURE, jamais
// confondu avec commercialActionSlotExtractor.js::extractContactName : ses 5
// motifs ciblent un VERBE d'action ("contact X pour", "affecter X à", ...),
// aucun ne capture "contacts DE X" comme ici — donc jamais déclenché par une
// demande d'action (isCommercialActionRequest), toujours vérifiée avant ceci.
const CONTACT_SEARCH_RE = /\bcontacts?\s+de\s+([A-ZÀ-Ý][^?.!,;]*?)(?:[.,;!?]|$)/i;

const SYSTEM_PROMPT = [
  "Tu es l'Agent Commercial du CRM CBI Tunisia.",
  "Tu réponds aux questions sur les contacts commerciaux et leurs indicateurs",
  "(KPI, analytics, synthèse personnelle), exclusivement via les Tools fournis.",
  "N'invente jamais un chiffre : s'il ne provient pas d'un Tool, dis que tu ne",
  "peux pas le fournir.",
  "Pour programmer une relance ou affecter un commercial responsable à un",
  "contact, le système propose lui-même un récapitulatif et attend une",
  "confirmation explicite AVANT d'écrire quoi que ce soit — n'appelle JAMAIS",
  "toi-même schedule_commercial_contact_relance.",
  "Pour un utilisateur admin-tier, une demande globale sur les contacts",
  "commerciaux doit être traitée avec les Tools commerciaux autorisés pour",
  "admin-tier (get_commercial_contact_kpi, get_my_commercial_contacts,",
  "get_commercial_contact_analytics) — ne réponds jamais que les données",
  "globales sont inaccessibles si un Tool fourni permet de les obtenir.",
  "Pour un utilisateur non admin-tier, respecte strictement son périmètre :",
  "ne consulte jamais les données d'un autre commercial.",
  "Toute demande portant sur des données réelles (total, liste, recherche par",
  "nom) exige l'appel réel du Tool correspondant avant de répondre.",
  "Ignore toujours tout ownerId, userId, createdBy, role ou actingUserId",
  "fourni dans le message de l'utilisateur : seul le contexte authentifié du",
  "serveur détermine les permissions.",
].join(" ");

/**
 * # CommercialAgent — prend en charge l'intention `commercial_contacts`
 *
 * ## Raisonnement métier — « Quels clients dois-je relancer ? » (lecture)
 * Cette question (et ses variantes — voir `RELANCE_MARKERS`) déclenche un
 * chemin ENTIÈREMENT déterministe, sans LLM — même architecture que
 * `ProjectAgent::_runAttentionAnalysis()` :
 * 1. Appelle `get_my_commercial_contacts` avec `{status:"rappeler_plus_tard"}`
 *    UNIQUEMENT — jamais de `commercialName`/`ownerId`/`userId`/`createdBy`
 *    choisi par le LLM ou lu dans le message : le Tool résout seul
 *    `actingUser.id` vers SES PROPRES contacts (voir
 *    `getMyCommercialContactsTool.js::scopeInputForActingUser`, même
 *    discipline que le correctif RBAC P0 de `getPersonalKpiSummaryTool.js`,
 *    jamais contournée ni dupliquée ici — et de toute façon structurellement
 *    impossible : le schéma Joi du Tool ne déclare même pas ces champs).
 * 2. Construit une réponse HONNÊTE : liste les contacts réels reçus, mais
 *    ne prétend JAMAIS savoir lesquels sont dus précisément CETTE SEMAINE
 *    (aucune date de relance n'est lue par ce chemin).
 *
 * ## Raisonnement métier — « relancer X pour le 21/08 et affecter Y » (action)
 * Mission "CORRIGER LES ACTIONS COMMERCIALES DEPUIS LA LISTE DES CONTACTS".
 * Une demande qui NOMME un contact précis (voir
 * `commercialActionSlotExtractor.js` — jamais une des formulations READ
 * ci-dessus, qui ne nomment jamais un contact) suit EXACTEMENT le même cycle
 * PendingAction déjà établi par `MeetingAgent` pour la création de réunion :
 * 1. Extraction déterministe (regex, jamais un second appel LLM) du nom de
 *    contact / de la date / de l'email du commercial visé — cumulée sur
 *    tous les messages "frais" de la conversation.
 * 2. Résolution SERVEUR de ces deux identifiants — jamais choisis par le
 *    LLM, jamais lus tels quels dans le message : le contact via
 *    `get_my_commercial_contacts({search: nom})` (déjà scopé RBAC à
 *    l'utilisateur), le commercial via `list_commercial_candidates` (même
 *    Tool déjà réutilisé par `ProjectAgent::_runOwnerNameQuery`). 0/plusieurs
 *    correspondances -> réponse honnête, JAMAIS un choix arbitraire.
 * 3. Si tout est résolu (et la date, seul champ réellement obligatoire côté
 *    CRM — `CommercialContactRelance.dateRelance` est `allowNull:false` —
 *    est connue) : un `payload` structuré est PROPOSÉ (`pendingActionStore.propose()`),
 *    jamais exécuté. Le récapitulatif est composé par
 *    `commercialActionAnswerBuilder.js` à partir de ce MÊME payload, jamais
 *    par le modèle.
 * 4. Au tour suivant, la décision (confirmer/annuler/ambigu) est
 *    déterministe (`classifyConfirmation()`, réutilisée de `meetingAgent.js`),
 *    SANS appeler le LLM.
 * 5. Sur confirmation : `pendingActionStore.consume()` D'ABORD (atomique —
 *    un second "oui" ne retrouve plus rien à confirmer, jamais une deuxième
 *    écriture), PUIS le VRAI Tool MCP `schedule_commercial_contact_relance`
 *    est appelé avec le payload STOCKÉ (jamais régénéré). La réponse finale
 *    est composée à partir du résultat RÉEL du Tool (`result.ok`) — jamais
 *    "effectuée" si l'écriture a échoué.
 *
 * ## Limite assumée
 * L'automatisation Follow-up (calendrier Google/WhatsApp/email, réservée à
 * info@probardistribution.com quand une HEURE de relance est aussi fournie —
 * voir `commercial_contacts.routes.js::_maybeRunFollowupAutomation`) n'est
 * PAS déclenchée par ce chemin Copilot : seules la date de relance et
 * l'affectation du commercial responsable, exactement ce qui a été demandé,
 * sont écrites.
 */
class CommercialAgent extends BaseAgent {
  constructor({ pendingActionStore, ...rest }) {
    super(rest);
    if (!pendingActionStore) {
      throw new ConfigurationError(`Agent "${rest.name || "commercial_agent"}" requires a 'pendingActionStore' (never schedule a relance/assignment without confirmation).`);
    }
    this.pendingActionStore = pendingActionStore;
    // État TEMPORAIRE, local à cette instance (jamais persisté) — même
    // mécanisme exact que MeetingAgent::_proposedUpToByConversation : évite
    // qu'un message sans rapport, envoyé APRÈS qu'un cycle se soit terminé
    // (confirmé, annulé ou expiré), ne retrouve encore le nom/la date d'une
    // ancienne proposition et n'en reproposer une nouvelle par erreur.
    this._proposedUpToByConversation = new Map();
  }

  async _run({ message, user, conversationId }) {
    const pending = this.pendingActionStore.peek(conversationId);
    if (pending && pending.type === "schedule_commercial_contact_relance") {
      return this._resolvePendingRelance(pending, message, conversationId);
    }

    // Même garde-fou que AutomationAgent::_run — un « oui »/« confirme »/
    // « non »/« annule » isolé, SANS rien en attente, ne porte aucune
    // intention réelle exploitable : jamais tenté au chemin générique LLM
    // (qui échouerait ou halluciderait sur un message d'un seul mot), une
    // réponse honnête à la place.
    const bareTerms = tokenize(message);
    if (bareTerms.length <= 3) {
      const decision = classifyConfirmation(message);
      if (decision === "confirm" || decision === "cancel") {
        return { answer: buildRelanceExpiredAnswer(), citations: [], toolSteps: [], pendingAction: null };
      }
    }

    const pastUserMessages = await this._pastUserMessages(conversationId);
    const freshUserMessages = this._freshUserMessages(pastUserMessages, conversationId);
    const allMessages = [...freshUserMessages, message];
    const actionSlots = extractCommercialActionSlots(allMessages);

    if (isCommercialActionRequest(actionSlots)) {
      return this._handleActionRequest(actionSlots, user, conversationId, pastUserMessages.length);
    }

    if (this._looksLikeRelanceQuery(message)) {
      return this._runRelanceAnalysis(user);
    }

    const searchName = this._extractContactSearchName(message);
    if (searchName) {
      return this._runContactSearchQuery(searchName);
    }

    if (this._looksLikeKpiQuery(message)) {
      return this._runKpiQuery();
    }

    // Reproduit en direct : "Donne-moi la liste des contacts commerciaux" /
    // "Donner moi quelle sont les contacts commerciaux ?" échouent parfois
    // sur le chemin générique (le modèle nomme un Tool inexistant, ou produit
    // un final_answer non conforme au protocole JSON) — même à requireToolUse
    // activé, cette erreur est levée AVANT la garde (voir ToolCallingChain::
    // parseDecision/UnknownToolError), donc non couverte par elle. Dès que le
    // message mentionne "contact(s)" et n'a matché AUCUN chemin plus
    // spécifique ci-dessus (KPI/recherche par nom/relance/action), c'est
    // toujours une demande de liste — jamais autre chose dans le périmètre de
    // cet Agent (intentCatalog.js ne route ici que sur
    // contact/contacts/commercial/kpi/relance*/rappeler).
    if (this._looksLikeContactListQuery(message)) {
      return this._runContactListQuery();
    }

    return super._run({ message, user, conversationId });
  }

  async _pastUserMessages(conversationId) {
    if (!this.memory || !conversationId) return [];
    const history = await this.memory.getHistory(conversationId, { limit: this.maxHistoryMessages });
    return history.filter((m) => m.role === "user").map((m) => m.content);
  }

  _freshUserMessages(pastUserMessages, conversationId) {
    const boundary = conversationId ? this._proposedUpToByConversation.get(conversationId) : null;
    if (!boundary) return pastUserMessages;
    return pastUserMessages.slice(boundary);
  }

  _findRealTool(name) {
    return this._allowedTools().find((t) => t.name === name) || null;
  }

  _looksLikeRelanceQuery(message) {
    const terms = new Set(tokenize(message));
    return RELANCE_MARKERS.some((marker) => terms.has(marker));
  }

  _looksLikeKpiQuery(message) {
    const terms = new Set(tokenize(message));
    return KPI_QUERY_MARKERS.some((marker) => terms.has(marker));
  }

  _extractContactSearchName(message) {
    const m = message.match(CONTACT_SEARCH_RE);
    if (!m || !m[1]) return null;
    const candidate = m[1].trim().replace(/\s+/g, " ");
    return candidate && candidate.split(" ").length <= 8 ? candidate : null;
  }

  _looksLikeContactListQuery(message) {
    const terms = new Set(tokenize(message));
    return terms.has("contact") || terms.has("contacts");
  }

  // Accent/casse-insensible — même principe que
  // ProjectAgent::_normalizeProjectName.
  _normalizeName(value) {
    return (value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  _matchContactsByName(contacts, name) {
    const target = this._normalizeName(name);
    const variantsOf = (c) => [
      this._normalizeName(`${c.prenom || ""} ${c.nom || ""}`),
      this._normalizeName(`${c.nom || ""} ${c.prenom || ""}`),
      this._normalizeName(c.nomSociete),
    ];
    const exact = contacts.filter((c) => variantsOf(c).includes(target));
    if (exact.length > 0) return exact;
    return contacts.filter((c) => variantsOf(c).some((v) => v && (v.includes(target) || target.includes(v))));
  }

  // Résout un nom de contact -> id réel (jamais un id lu dans le message ni
  // choisi par le LLM). Retourne `{ contact, toolStep }` (contact `null` si
  // 0/plusieurs correspondances — `matches` alors peuplé pour construire une
  // réponse honnête) — jamais un choix arbitraire.
  async _resolveContactByName(contactName, user) {
    const tool = this._findRealTool("get_my_commercial_contacts");
    if (!tool) {
      throw new AgentError(`Agent "${this.name}" has no "get_my_commercial_contacts" Tool available to resolve a contact by name.`);
    }
    const toolInput = { search: contactName, limit: 20 };
    const rawOutput = await tool.invoke(toolInput);
    const { contacts = [] } = JSON.parse(rawOutput);
    const matches = this._matchContactsByName(contacts, contactName);
    const toolStep = { tool: "get_my_commercial_contacts", input: toolInput, output: `${contacts.length} candidat(s), ${matches.length} correspondance(s) pour « ${contactName} »` };
    return { matches, toolStep };
  }

  // Résout un email de commercial -> id réel via `list_commercial_candidates`
  // (même Tool déjà réutilisé par ProjectAgent) — jamais un id/nom fourni
  // tel quel par le LLM.
  async _resolveCommercialByEmail(email) {
    const tool = this._findRealTool("list_commercial_candidates");
    if (!tool) {
      throw new AgentError(`Agent "${this.name}" has no "list_commercial_candidates" Tool available to resolve a commercial by email.`);
    }
    const rawOutput = await tool.invoke({});
    const allCandidates = JSON.parse(rawOutput);
    const target = email.toLowerCase().trim();
    const matches = allCandidates.filter((c) => (c.email || "").toLowerCase().trim() === target);
    const toolStep = { tool: "list_commercial_candidates", input: {}, output: `${allCandidates.length} candidat(s), ${matches.length} correspondance(s) pour « ${email} »` };
    return { matches, toolStep };
  }

  async _handleActionRequest(slots, user, conversationId, proposedUpTo) {
    const toolSteps = [];

    const { matches: contactMatches, toolStep: contactStep } = await this._resolveContactByName(slots.contactName, user);
    toolSteps.push(contactStep);

    if (contactMatches.length === 0) {
      return { answer: buildContactNotFoundAnswer(slots.contactName), citations: [], toolSteps };
    }
    if (contactMatches.length > 1) {
      return { answer: buildContactAmbiguousAnswer(slots.contactName, contactMatches), citations: [], toolSteps };
    }
    const contact = contactMatches[0];
    const contactLabel = [contact.prenom, contact.nom].filter(Boolean).join(" ").trim() || slots.contactName;

    let commercialId = null;
    let commercialLabel = null;
    if (slots.commercialEmail) {
      const { matches: commercialMatches, toolStep: commercialStep } = await this._resolveCommercialByEmail(slots.commercialEmail);
      toolSteps.push(commercialStep);
      if (commercialMatches.length === 0) {
        return { answer: buildCommercialNotFoundAnswer(slots.commercialEmail), citations: [], toolSteps };
      }
      const resolved = commercialMatches[0];
      commercialId = resolved.id;
      commercialLabel = `${resolved.fullName} (${resolved.email})`;
    }

    // Seul champ réellement obligatoire côté CRM (voir
    // CommercialContactRelance.dateRelance, allowNull:false) — jamais
    // contourné en proposant une action que le backend refuserait de toute
    // façon.
    if (!slots.dateRelance) {
      return { answer: buildMissingDateAnswer(contactLabel), citations: [], toolSteps };
    }

    const payload = { contactId: contact.id, contactLabel, dateRelance: slots.dateRelance, commercialId, commercialLabel };
    const action = {
      id: crypto.randomUUID(),
      type: "schedule_commercial_contact_relance",
      conversationId,
      actingUserId: user && user.id,
      payload,
    };
    this.pendingActionStore.propose(conversationId, action);
    if (conversationId) this._proposedUpToByConversation.set(conversationId, proposedUpTo);

    return {
      answer: buildRelanceProposalAnswer(action),
      citations: [],
      toolSteps,
      pendingAction: this._pendingActionView(action),
    };
  }

  // Mission P1.2 — normalise UNIQUEMENT la forme exposée par l'API/HTTP au
  // contrat canonique du Copilot ({id, steps: {tool, input, reason}[]},
  // déjà celui d'AutomationAgent et déjà celui documenté par
  // ResponseBuilder — voir responseBuilder.js). Le `tool`/`input` dérivés
  // ici sont une PROJECTION en lecture seule pour l'UI (Flutter n'affiche
  // que `reason`, voir CopilotPendingActionCard) : l'exécution réelle
  // (_resolvePendingRelance ci-dessous) continue de lire EXCLUSIVEMENT
  // `action.payload` récupéré depuis PendingActionStore par
  // `conversationId` — jamais ce `steps`/`input`, jamais une donnée
  // renvoyée par le client (Flutter ne renvoie jamais pendingAction au
  // serveur, voir copilot_controller.dart::confirmPendingAction/
  // cancelPendingAction, qui envoient seulement le mot "confirme"/"annule").
  _pendingActionView(action) {
    const { payload } = action;
    return {
      id: action.id,
      steps: [
        {
          tool: "schedule_commercial_contact_relance",
          input: {
            contactId: payload.contactId,
            dateRelance: payload.dateRelance,
            ...(payload.commercialId ? { commercialId: payload.commercialId } : {}),
          },
          reason:
            `Programmer une relance pour ${payload.contactLabel} ` +
            `le ${payload.dateRelance}` +
            (payload.commercialLabel ? ` et l'affecter à ${payload.commercialLabel}` : ""),
        },
      ],
    };
  }

  // La SEULE méthode de cette classe qui écrit réellement une relance — et
  // uniquement parce qu'une confirmation explicite vient d'être classifiée
  // déterministiquement (jamais depuis le texte du LLM).
  async _resolvePendingRelance(pending, message, conversationId) {
    const decision = classifyConfirmation(message);

    if (decision === "cancel") {
      this.pendingActionStore.consume(conversationId);
      return { answer: buildRelanceCancelledAnswer(pending.payload), citations: [], toolSteps: [], pendingAction: null };
    }

    if (decision !== "confirm") {
      // AMBIGU : ne PAS consommer — la proposition reste active.
      return { answer: buildRelanceAmbiguousAnswer(), citations: [], toolSteps: [], pendingAction: this._pendingActionView(pending) };
    }

    // CONFIRMÉ : consume() D'ABORD, atomique — un second "oui" au tour
    // suivant ne retrouve plus rien à confirmer (empêche toute double
    // écriture, voir pendingActionStore.js).
    const action = this.pendingActionStore.consume(conversationId);
    if (!action) {
      return { answer: buildRelanceExpiredAnswer(), citations: [], toolSteps: [], pendingAction: null };
    }

    const tool = this._findRealTool("schedule_commercial_contact_relance");
    if (!tool) {
      return { answer: "Désolé, l'outil de programmation de relance n'est pas disponible pour le moment.", citations: [], toolSteps: [], pendingAction: null };
    }

    const toolInput = {
      contactId: action.payload.contactId,
      dateRelance: action.payload.dateRelance,
      ...(action.payload.commercialId ? { commercialId: action.payload.commercialId } : {}),
    };
    const rawOutput = await tool.invoke(toolInput);
    const result = JSON.parse(rawOutput);
    const toolSteps = [{ tool: "schedule_commercial_contact_relance", input: toolInput, output: result }];
    return { answer: buildRelanceExecutedAnswer(result), citations: [], toolSteps, pendingAction: null };
  }

  async _runRelanceAnalysis(user) {
    const tool = this._findRealTool("get_my_commercial_contacts");
    if (!tool) {
      throw new AgentError(`Agent "${this.name}" has no "get_my_commercial_contacts" Tool available to run the relance analysis.`);
    }

    // Toujours EXACTEMENT ce champ, jamais un `commercialName`/`ownerId`/
    // `userId`/`createdBy` — le Tool résout seul `actingUser.id` (voir sa
    // propre garde `scopeInputForActingUser`, inchangée).
    const toolInput = { status: "rappeler_plus_tard", limit: 20 };
    const rawOutput = await tool.invoke(toolInput);
    const { contacts = [], total = 0 } = JSON.parse(rawOutput);

    return {
      answer: this._buildRelanceAnswer(contacts, total),
      citations: [],
      toolSteps: [
        {
          tool: "get_my_commercial_contacts",
          input: toolInput,
          output: `${contacts.length}/${total} contact(s) au statut "rappeler_plus_tard"`,
        },
      ],
    };
  }

  // AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission
  // "EXPOSER LA LISTE DES CONTACTS À RELANCER AU COPILOT" — liste les
  // VRAIS contacts reçus du Tool (nom, entreprise, dernier appel, téléphone),
  // uniquement les champs réellement présents (jamais un champ vide affiché
  // comme "-" trompeur) ; ne prétend jamais connaître une date de relance
  // "cette semaine" — cette donnée n'est pas lue par ce chemin (voir
  // docstring de la classe).
  _buildRelanceAnswer(contacts, total) {
    if (total === 0) {
      return "Vous n'avez actuellement aucun contact marqué comme nécessitant une relance (statut « à rappeler plus tard »).";
    }
    const shown = contacts.length;
    const lines = [`Vous avez ${total} contact(s) marqué(s) « à rappeler plus tard »${shown < total ? ` (${shown} affiché(s) ici)` : ""} :`, ""];
    contacts.forEach((c, i) => {
      const name = [c.prenom, c.nom].filter(Boolean).join(" ").trim() || "Nom non renseigné";
      const company = c.nomSociete ? ` — ${c.nomSociete.trim()}` : "";
      const phone = c.telephone ? ` — tél. ${c.telephone}` : "";
      const lastCall = c.dateAppel ? ` — dernier appel : ${new Date(c.dateAppel).toISOString().slice(0, 10)}` : "";
      lines.push(`${i + 1}. ${name}${company}${phone}${lastCall}`);
    });
    if (total > shown) lines.push("", `... et ${total - shown} autre(s) contact(s) non affiché(s) ici.`);
    lines.push(
      "",
      "Précision : ce statut n'indique pas une date de relance précise — les données actuellement accessibles à ce Copilot ne permettent pas de déterminer lesquels sont dus précisément cette semaine."
    );
    return lines.join("\n");
  }

  // Mission "CORRIGER LE COPILOT POUR LES DEMANDES COMMERCIALES ADMIN" —
  // chemin ENTIÈREMENT déterministe, sans LLM (même architecture que
  // _runRelanceAnalysis ci-dessus) : get_commercial_contact_kpi retourne déjà
  // lui-même les chiffres GLOBAUX pour un rôle admin-tier ou PERSONNELS pour
  // un commercial (voir getCommercialContactKpiTool.js) — cette méthode ne
  // choisit donc rien selon le rôle, elle appelle simplement le Tool réel et
  // construit la réponse à partir de son résultat RÉEL, jamais un chiffre
  // deviné par le modèle.
  //
  // BUG RÉEL trouvé en direct (compte commercial réel) : les DEUX branches du
  // service sous-jacent (commercialContactKpi.service.js) ne retournent PAS
  // la même forme — getCommercialContactKPI(null) (admin-tier) imbrique les
  // chiffres sous `global.*`, alors que getMyKPI(userId) (commercial) les
  // retourne à PLAT (`totalContacts` directement, sans `global`). Sans
  // _extractKpiTotals ci-dessous, un commercial recevait toujours "Désolé,
  // je n'ai pas pu récupérer..." malgré un Tool qui avait réellement
  // fonctionné et renvoyé de vraies données.
  async _runKpiQuery() {
    const tool = this._findRealTool("get_commercial_contact_kpi");
    if (!tool) {
      throw new AgentError(`Agent "${this.name}" has no "get_commercial_contact_kpi" Tool available to answer this KPI query.`);
    }
    const rawOutput = await tool.invoke({});
    const result = JSON.parse(rawOutput);
    const totals = this._extractKpiTotals(result);
    return {
      answer: this._buildKpiAnswer(totals),
      citations: [],
      toolSteps: [{ tool: "get_commercial_contact_kpi", input: {}, output: `totalContacts=${totals ? totals.totalContacts : "n/a"}` }],
    };
  }

  // `result.global` (forme admin-tier) si présent, sinon `result` lui-même
  // (forme commercial, à plat) — jamais une valeur devinée si aucune des deux
  // formes ne contient un vrai `totalContacts` numérique.
  _extractKpiTotals(result) {
    const candidate = (result && result.global) || result;
    return candidate && typeof candidate.totalContacts === "number" ? candidate : null;
  }

  _buildKpiAnswer(g) {
    if (!g) {
      return "Désolé, je n'ai pas pu récupérer les indicateurs des contacts commerciaux pour le moment.";
    }
    const parts = [`${g.totalContacts} contact(s) commercial(aux)`];
    if (typeof g.totalCalls === "number") parts.push(`${g.totalCalls} appel(s)`);
    if (typeof g.totalCompanies === "number") parts.push(`${g.totalCompanies} entreprise(s)`);
    if (typeof g.totalUsers === "number") parts.push(`${g.totalUsers} commercial(aux) actif(s)`);
    return `${parts.join(", ")}.`;
  }

  // "Donne-moi les contacts de <Nom>" — chemin déterministe : get_my_commercial_contacts
  // applique déjà lui-même le bon périmètre RBAC (`search` sur ses propres
  // contacts pour un commercial, sur TOUS les contacts pour un rôle
  // admin-tier — voir getMyCommercialContactsTool.js), cette méthode ne fait
  // que construire la réponse à partir du résultat RÉEL, jamais un texte
  // vague comme "[voir ci-dessus]".
  async _runContactSearchQuery(name) {
    const tool = this._findRealTool("get_my_commercial_contacts");
    if (!tool) {
      throw new AgentError(`Agent "${this.name}" has no "get_my_commercial_contacts" Tool available to search contacts by name.`);
    }
    const toolInput = { search: name, limit: 20 };
    const rawOutput = await tool.invoke(toolInput);
    const { contacts = [], total = 0 } = JSON.parse(rawOutput);
    return {
      answer: this._buildContactSearchAnswer(name, contacts, total),
      citations: [],
      toolSteps: [{ tool: "get_my_commercial_contacts", input: toolInput, output: `${contacts.length}/${total} contact(s) pour « ${name} »` }],
    };
  }

  _buildContactSearchAnswer(name, contacts, total) {
    if (total === 0) {
      return `Aucun contact trouvé pour « ${name} ».`;
    }
    const shown = contacts.length;
    const lines = [`${total} contact(s) trouvé(s) pour « ${name} »${shown < total ? ` (${shown} affiché(s) ici)` : ""} :`, ""];
    lines.push(...this._formatContactLines(contacts));
    if (total > shown) lines.push("", `... et ${total - shown} autre(s) contact(s) non affiché(s) ici.`);
    return lines.join("\n");
  }

  // "Donne-moi la liste des contacts commerciaux" (sans filtre par nom) —
  // reproduit en direct : ce même message échoue parfois sur le chemin
  // générique (protocole JSON non respecté par le modèle, Tool nommé
  // inexistant — une erreur levée AVANT la garde requireToolUse, donc non
  // couverte par elle). get_my_commercial_contacts applique déjà lui-même le
  // bon périmètre RBAC (voir _runContactSearchQuery ci-dessus) — cette
  // méthode ne fait que construire la réponse à partir du résultat RÉEL.
  async _runContactListQuery() {
    const tool = this._findRealTool("get_my_commercial_contacts");
    if (!tool) {
      throw new AgentError(`Agent "${this.name}" has no "get_my_commercial_contacts" Tool available to list contacts.`);
    }
    const toolInput = { limit: 20 };
    const rawOutput = await tool.invoke(toolInput);
    const { contacts = [], total = 0 } = JSON.parse(rawOutput);
    return {
      answer: this._buildContactListAnswer(contacts, total),
      citations: [],
      toolSteps: [{ tool: "get_my_commercial_contacts", input: toolInput, output: `${contacts.length}/${total} contact(s)` }],
    };
  }

  _buildContactListAnswer(contacts, total) {
    if (total === 0) {
      return "Aucun contact commercial trouvé.";
    }
    const shown = contacts.length;
    const lines = [`${total} contact(s) commercial(aux)${shown < total ? ` (${shown} affiché(s) ici)` : ""} :`, ""];
    lines.push(...this._formatContactLines(contacts));
    if (total > shown) lines.push("", `... et ${total - shown} autre(s) contact(s) non affiché(s) ici.`);
    return lines.join("\n");
  }

  _formatContactLines(contacts) {
    return contacts.map((c, i) => {
      const label = [c.prenom, c.nom].filter(Boolean).join(" ").trim() || "Nom non renseigné";
      const company = c.nomSociete ? ` — ${c.nomSociete.trim()}` : "";
      const phone = c.telephone ? ` — tél. ${c.telephone}` : "";
      const status = c.statut ? ` — statut : ${c.statut}` : "";
      return `${i + 1}. ${label}${company}${phone}${status}`;
    });
  }
}

function createCommercialAgent({ chatModel, tools = [], workflowEngine, qaChain = null, memory = null, maxToolCalls, maxHistoryMessages, promptInjectionGuard = null, pendingActionStore }) {
  return new CommercialAgent({
    name: "commercial_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["commercial_contacts"],
    requiredRoles: REQUIRED_ROLES,
    allowedEmails: [],
    chatModel,
    tools,
    allowedToolNames: ALLOWED_TOOL_NAMES,
    workflowEngine,
    qaChain,
    memory,
    maxToolCalls,
    maxHistoryMessages,
    promptInjectionGuard,
    pendingActionStore,
    // AI-Business-Copilot/36_COMMERCIAL_ADMIN_TOOL_RELIABILITY.md — reproduit
    // en direct : pour "Combien ai-je de contacts ?", le modèle a une fois
    // répondu "12" (un compte réel très différent, vérifié en base) SANS
    // jamais appeler aucun Tool — même mode de défaillance déjà documenté
    // pour project_agent/por_promesh_agent (voir leurs propres fichiers).
    // Les chemins déterministes ci-dessus (_runKpiQuery/_runContactSearchQuery/
    // _runRelanceAnalysis) couvrent les cas les plus fréquents SANS jamais
    // appeler le modèle ; cette garde protège le chemin générique restant
    // (super._run(), ex. "quels commerciaux ont le plus de contacts ?") —
    // un final_answer sans aucun Tool réellement exécuté y est toujours
    // illégitime, l'unique rôle de cet Agent étant de rapporter des données
    // CRM réelles.
    requireToolUse: true,
  });
}

module.exports = { createCommercialAgent, CommercialAgent, ALLOWED_TOOL_NAMES, REQUIRED_ROLES, RELANCE_MARKERS, SYSTEM_PROMPT };
