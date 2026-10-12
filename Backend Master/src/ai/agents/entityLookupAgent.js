"use strict";

const { BaseAgent } = require("./baseAgent");
const { QueryRouter, extractTarget, looksLikeName } = require("../routing/queryRouter");
const { detectLanguage } = require("../language/languageDetector");
const { EntityNormalizer } = require("../routing/entityNormalizer");

const entityNormalizer = new EntityNormalizer();
const { isGrounded } = require("../web/webSearchService");
const { withTimeout, StepTimeoutError, PERMISSION_DENIED_CODE } = require("../planning/planExecutor");
const {
  buildEntityAnswer,
  buildPromoterAnswer,
  buildPromoterListAnswer,
  buildPromoterProjectsAnswer,
  promotersNextLabel,
  buildCompanyListAnswer,
  buildCompanyCountAnswer,
  buildMachineListAnswer,
  listNextLabel,
  buildErrorAnswer,
  buildClarificationAnswer,
} = require("../reasoning/entityLookupAnswerBuilder");

// Requis par BaseAgent ; cet Agent n'appelle JAMAIS le modèle de langage :
// les faits viennent des Tools, le texte d'un gabarit FR/EN/RU.
const SYSTEM_PROMPT =
  "Agent de recherche d'une personne, d'une société ou d'un promoteur précis pour PROBAR ASSISTANT : " +
  "données internes via les Tools du CRM, informations publiques via la recherche Web, jamais mélangées ni inventées.";

const CRM_TOOL = "find_crm_entity";
const WEB_TOOL = "web_search";
const PROMOTERS_TOOL = "list_promoters";
const PROMOTER_PAGE_SIZE = 20;
const COMPANIES_TOOL = "list_companies";
const MACHINES_TOOL = "list_machines";
const ALLOWED_TOOL_NAMES = [CRM_TOOL, WEB_TOOL, PROMOTERS_TOOL, COMPANIES_TOOL, MACHINES_TOOL];
const DEFAULT_TIMEOUT_MS = 15000;
const ADMIN_ROLES = new Set(["admin", "superadmin", "superadmin2"]);

/**
 * # EntityLookupAgent — « Qui est Zakariah Derbel ? » (intention entity_lookup)
 *
 * Exécute la route décidée par le QueryRouter (`intent.query`) :
 *
 *   CRM  → find_crm_entity (rapprochement exact → normalisé → mots → approché ;
 *          périmètre et rôle appliqués PAR LE SERVEUR MCP, jamais ici)
 *   Web  → web_search, uniquement si la route le demande et que le CRM n'a
 *          pas renvoyé plusieurs homonymes (on ne cherche pas le Web pour une
 *          personne qui n'est pas encore identifiée)
 *
 * Seuls le NOM public de l'entité (ou du projet) part vers le moteur Web —
 * aucune autre donnée du CRM. Le résultat CRM et le résultat Web restent deux
 * blocs distincts jusque dans la réponse (reasoning/entityLookupAnswerBuilder.js).
 */
class EntityLookupAgent extends BaseAgent {
  constructor({ router = null, timeoutMs = DEFAULT_TIMEOUT_MS, synthesisEnabled = null, synthesisTimeoutMs = 45000, ...rest }) {
    super(rest);
    this.router = router || new QueryRouter();
    this.timeoutMs = timeoutMs;
    // Synthèse des sources Web : active par défaut ; AI_WEB_SEARCH_SYNTHESIS=false
    // la désactive (la réponse cite alors les extraits tels quels).
    this.synthesisEnabled = synthesisEnabled === null ? String(process.env.AI_WEB_SEARCH_SYNTHESIS || "").trim().toLowerCase() !== "false" : Boolean(synthesisEnabled);
    this.synthesisTimeoutMs = synthesisTimeoutMs;
  }

  async _call(toolName, input, toolSteps) {
    const tool = this._allowedTools().find((t) => t.name === toolName);
    if (!tool) {
      toolSteps.push({ tool: toolName, input, output: null });
      return { error: "denied" };
    }
    try {
      const raw = await withTimeout(Promise.resolve().then(() => tool.invoke(input)), this.timeoutMs);
      const output = typeof raw === "string" ? JSON.parse(raw) : raw;
      toolSteps.push({ tool: toolName, input, output });
      return { output };
    } catch (err) {
      const denied = err && (err.code === PERMISSION_DENIED_CODE || /is not allowed to call tool/i.test(err.message || ""));
      this.logger.warn(`${toolName} -> ${denied ? "denied" : err instanceof StepTimeoutError ? "timeout" : "failure"}`);
      toolSteps.push({ tool: toolName, input, output: null });
      return { error: denied ? "denied" : "failure" };
    }
  }

  // `company` : société de la personne telle que le CRM la connaît — un nom
  // d'organisation, public — pour préciser la requête et vérifier qu'un
  // résultat parle bien d'elle. Jamais de téléphone, d'e-mail ni d'autre champ.
  async _web(route, { target, entity, company = null, profession = null }, toolSteps) {
    if (!route.webSearch || !target) return { status: "skipped", results: [], entity };
    const input = { target: String(target).slice(0, 120), entity, language: route.language, limit: 5 };
    // Contexte public d'un architecte : le mot « architecte » dans la langue de la demande.
    if (profession === "architect" && !company) input.company = { fr: "architecte", en: "architect", ru: "архитектор" }[route.language] || "architecte";
    if (company && (entity === "engineer" || entity === "person")) input.company = String(company).split(",")[0].trim().slice(0, 120);
    const { output, error } = await this._call(WEB_TOOL, input, toolSteps);
    if (error || !output || !Array.isArray(output.results)) return { status: "failed", results: [], entity };
    if (output.configured === false) return { status: "not_configured", results: [], entity };
    if (output.failed) return { status: "failed", reason: output.reason || "unavailable", provider: output.provider || null, results: [], entity };
    // Une source sans adresse vérifiable n'est jamais citée.
    const results = output.results.filter((r) => r && typeof r.url === "string" && /^https?:\/\//i.test(r.url) && typeof r.title === "string");
    const web = {
      status: "ok",
      provider: output.provider || null,
      results,
      entity,
      identity: results.length ? results[0].identity || null : null,
      confidence: results.length && typeof results[0].confidence === "number" ? results[0].confidence : null,
    };
    web.summary = await this._synthesize(route, target, web);
    return web;
  }

  // Synthèse rédigée par le modèle de langage à partir des SEULS extraits
  // renvoyés par le moteur — activée par AI_WEB_SEARCH_SYNTHESIS=true. Tout
  // échec, délai ou sortie douteuse (lien, texte trop long) → null : la
  // réponse cite alors les extraits tels quels. Jamais demandée quand
  // l'identité n'est pas établie (on ne résume pas un possible homonyme).
  async _synthesize(route, target, web) {
    if (!this.synthesisEnabled || !this.chatModel || typeof this.chatModel.invoke !== "function") return null;
    if (!web.results.length || web.identity === "unconfirmed") return null;
    const language = { fr: "français", en: "English", ru: "русский" }[route.language] || "français";
    const sources = web.results.map((r, i) => `[${i + 1}] ${r.title} (${r.source}) : ${r.snippet}`).join("\n");
    const system =
      `Tu rédiges une synthèse factuelle en ${language}, 4 phrases au maximum, à partir UNIQUEMENT des extraits numérotés fournis. ` +
      "Chaque affirmation se termine par le numéro de son extrait entre crochets, par exemple [1]. " +
      "N'ajoute aucune information absente des extraits, aucun lien, aucune coordonnée personnelle. " +
      "Si les extraits ne permettent pas de répondre, écris exactement : AUCUNE_SYNTHESE.";
    try {
      const reply = await withTimeout(Promise.resolve().then(() => this.chatModel.invoke([{ role: "system", content: system }, { role: "user", content: `Sujet : ${target}\n\nExtraits :\n${sources}` }])), this.synthesisTimeoutMs);
      const text = String((reply && reply.content) || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      if (!text || /AUCUNE_SYNTHESE/.test(text) || text.length > 1200 || /https?:\/\/|www\./i.test(text) || !/\[\d\]/.test(text)) return null;
      // Aucun renvoi vers une source qui n'existe pas.
      const cited = [...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
      if (!cited.every((n) => n >= 1 && n <= web.results.length)) return null;
      // Aucun nom propre ni nombre absent des extraits.
      if (!isGrounded(text, web.results, target)) {
        this.logger.warn("synthèse Web rejetée : contenu absent des sources");
        return null;
      }
      return text;
    } catch (err) {
      this.logger.warn(`synthèse Web indisponible : ${err instanceof StepTimeoutError ? "délai dépassé" : "échec du modèle"}`);
      return null;
    }
  }

  _result(answer, toolSteps, web, extra = {}) {
    const results = web && web.status === "ok" ? web.results : [];
    return {
      answer,
      toolSteps,
      citations: results.map((r, i) => ({ index: i + 1, title: r.title, sourceType: "web", path: r.url, excerpt: r.snippet || "", score: null })),
      ...extra,
    };
  }

  // « Liste des sociétés » : table companies, 20 par page. CRM seul.
  async _companyList(route, toolSteps) {
    const offset = Number.isInteger(route.offset) && route.offset > 0 ? route.offset : 0;
    // Vue et filtre décidés par le routeur (« avec leurs projets », « sans projet »).
    const options = { ...(route.view === "projects" ? { view: "projects" } : {}), ...(route.filter ? { filter: route.filter } : {}) };
    const counting = route.operation === "count";
    const { output, error } = await this._call(COMPANIES_TOOL, counting ? { limit: 1, offset: 0, ...(route.filter ? { filter: route.filter } : {}) } : { limit: PROMOTER_PAGE_SIZE, offset, ...options }, toolSteps);
    if (error || !output || !Array.isArray(output.items) || !Number.isInteger(output.total)) return this._result(buildErrorAnswer(error || "failure", route.language), toolSteps, null);
    this._debug(`[CRM_SEARCH] matched=${output.total > 0} count=${output.total} entity=company`);
    if (counting) return this._result(buildCompanyCountAnswer({ route, result: output }), toolSteps, null);
    return this._result(buildCompanyListAnswer({ route, result: output }), toolSteps, null, {
      ...(output.truncated
        ? {
            listCursor: { entity: "company", nextOffset: (output.offset || 0) + output.items.length, total: output.total, language: route.language, ...(Object.keys(options).length ? { options } : {}) },
            suggestions: [{ id: "companies_next_page", label: listNextLabel("company", route.language), reason: null }],
          }
        : {}),
    });
  }

  // « Liste des machines » : référentiel de production (court, sans pagination).
  async _machineList(route, toolSteps) {
    const { output, error } = await this._call(MACHINES_TOOL, {}, toolSteps);
    if (error || !output || !Array.isArray(output.items)) return this._result(buildErrorAnswer(error || "failure", route.language), toolSteps, null);
    this._debug(`[CRM_SEARCH] matched=${output.items.length > 0} count=${output.items.length} entity=machine`);
    return this._result(buildMachineListAnswer({ route, result: output }), toolSteps, null);
  }

  // « Liste des promoteurs » : valeurs distinctes du champ promoteur des
  // projets visibles par l'utilisateur, 20 par page. CRM seul.
  async _promoterList(route, toolSteps) {
    const offset = Number.isInteger(route.offset) && route.offset > 0 ? route.offset : 0;
    const { output, error } = await this._call(PROMOTERS_TOOL, { operation: "list", limit: PROMOTER_PAGE_SIZE, offset }, toolSteps);
    if (error || !output || !Array.isArray(output.items) || !Number.isInteger(output.total)) return this._result(buildErrorAnswer(error || "failure", route.language), toolSteps, null);
    this._debug(`[CRM_SEARCH] matched=${output.total > 0} count=${output.total} entity=promoter`);
    return this._result(buildPromoterListAnswer({ route, result: output }), toolSteps, null, {
      ...(output.truncated
        ? {
            listCursor: { entity: "promoter", nextOffset: (output.offset || 0) + output.items.length, total: output.total, language: route.language },
            suggestions: [{ id: "promoters_next_page", label: promotersNextLabel(route.language), reason: null }],
          }
        : {}),
    });
  }

  async _promoterProjects(route, toolSteps) {
    const { output, error } = await this._call(PROMOTERS_TOOL, { operation: "projects", name: route.target }, toolSteps);
    if (error || !output || !Array.isArray(output.matches)) return this._result(buildErrorAnswer(error || "failure", route.language), toolSteps, null);
    this._debug(`[CRM_SEARCH] matched=${output.matches.length > 0} count=${output.matches.length} entity=promoter`);
    return this._result(buildPromoterProjectsAnswer({ route, result: output }), toolSteps, null);
  }

  async _promoter(route, toolSteps) {
    const project = route.project || {};
    const input = { entityType: "project_promoter", ...(project.id ? { projectId: project.id } : { projectName: project.name }) };
    const { output, error } = await this._call(CRM_TOOL, input, toolSteps);
    if (error || !output || !Array.isArray(output.matches)) return this._result(buildErrorAnswer(error || "failure", route.language), toolSteps, null);

    let web = { status: "skipped", results: [] };
    if (output.matches.length === 1) {
      const [match] = output.matches;
      // Promoteur connu du CRM : informations publiques sur CETTE société.
      // Sinon : sources publiques mentionnant le projet par son nom.
      web = match.promoter
        ? await this._web(route, { target: match.promoter, entity: "company" }, toolSteps)
        : await this._web(route, { target: match.projectName, entity: "promoter" }, toolSteps);
    }
    const [single] = output.matches.length === 1 ? output.matches : [];
    return this._result(buildPromoterAnswer({ route, crm: output, web, projectLabel: project.name || null }), toolSteps, web, {
      focusEntity: single && single.promoter ? { type: "company", id: null, name: single.promoter } : null,
    });
  }

  // Intention entity_lookup choisie par le repli sémantique pour une
  // formulation que le routeur ne couvre pas : on cherche quand même le nom
  // présent dans le message — jamais « de qui parlez-vous ? » si un nom est là.
  _fallbackRoute(message) {
    const { language } = detectLanguage(message);
    const words = String(message || "").trim().replace(/[?.!,;:]+$/, "").split(/\s+/).filter(Boolean);
    // Un message sans nom propre n'est une cible que s'il ne contient aucun
    // mot générique (« ingénieurs », « les contacts » ne sont pas des noms).
    const target = extractTarget(String(message || "")) || (words.length >= 1 && words.length <= 4 && looksLikeName(words) ? words.join(" ") : null);
    // Aucun nom, mais le message désigne les sociétés (ou les promoteurs, les
    // machines) : c'est leur liste qui est demandée, pas une précision.
    if (!target) {
      const entity = entityNormalizer.entityOf(message);
      if (["company", "promoter", "machine"].includes(entity)) {
        this.logger.info(`repli : aucun nom dans la demande, liste "${entity}" servie`);
        return { language, source: "crm", entity, operation: "list", target: null, fields: [], fromContext: false, crmSearch: true, webSearch: false };
      }
      return { language, source: "clarification", clarification: "whichPerson" };
    }
    return { language, source: "crm", entity: "unknown", operation: "details", target, targetId: null, fields: [], fromContext: false, crmSearch: true, webSearch: false };
  }

  // Traces internes (journal du serveur uniquement, AI_DEBUG_TRACE=true) :
  // jamais dans la réponse envoyée à l'utilisateur.
  _debug(line) {
    if (process.env.AI_DEBUG_TRACE === "true") this.logger.info(line);
  }

  async _run({ message, intent, context, user }) {
    const route =
      (intent && intent.query) ||
      this.router.route(message, { focus: (context && context.focusEntity) || null, currentProject: (context && context.currentProject) || null }) ||
      this._fallbackRoute(message);
    if (route.source === "clarification") return { answer: buildClarificationAnswer(route.clarification, route.language), citations: [], toolSteps: [] };

    const toolSteps = [];
    if (route.entity === "company" && (route.operation === "list" || route.operation === "count")) return this._companyList(route, toolSteps);
    if (route.entity === "machine" && route.operation === "list") return this._machineList(route, toolSteps);
    if (route.entity === "promoter" && route.operation === "list") return this._promoterList(route, toolSteps);
    if (route.entity === "promoter" && route.operation === "projects") return this._promoterProjects(route, toolSteps);
    if (route.entity === "promoter") return this._promoter(route, toolSteps);

    let crm = null;
    if (route.crmSearch) {
      const typed = ["engineer", "architect", "company", "contact"].includes(route.entity);
      // Fiche déjà identifiée dans la conversation : relue par son identifiant
      // (jamais un homonyme), toujours à travers le Tool scopé.
      const byId = route.fromContext && route.targetId && typed;
      const input = { entityType: typed ? route.entity : "auto", name: byId ? route.targetId : route.target, includeDetails: true };
      const { output, error } = await this._call(CRM_TOOL, input, toolSteps);
      if (error || !output || !Array.isArray(output.matches)) return this._result(buildErrorAnswer(error || "failure", route.language), toolSteps, null);
      crm = output;
    }

    const matches = crm ? crm.matches : [];
    const match = matches.length === 1 ? matches[0] : null;
    const entityType = match ? match.entityType : route.entity === "unknown" ? "person" : route.entity;
    let web = { status: "skipped", results: [] };
    // Le Web complète une FICHE (jamais une question sur un champ du CRM), et
    // jamais pour un contact commercial : c'est un particulier ou un prospect,
    // dont seules les données internes sont pertinentes.
    if (matches.length <= 1 && (route.operation === "details" || route.operation === "search") && entityType !== "contact") {
      // Le nom tel qu'il figure dans le CRM quand il est connu, sinon celui saisi.
      web = await this._web(
        route,
        {
          target: match ? match.name : route.target,
          // Nom inconnu du CRM et de type indéterminé (personne ? société ?) :
          // recherche neutre sur le nom, sans présumer qu'il s'agit d'une personne.
          entity: entityType === "topic" || (!match && route.entity === "unknown") ? "topic" : entityType === "company" ? "company" : entityType === "engineer" ? "engineer" : "person",
          // Architecte : son métier précise la recherche d'une personne.
          ...(entityType === "architect" ? { profession: "architect" } : {}),
          company: match && match.fields ? match.fields.company : null,
        },
        toolSteps
      );
    }

    // Identifiant technique : administrateur ET mode diagnostic uniquement.
    const showId = process.env.AI_DEBUG_TRACE === "true" && ADMIN_ROLES.has(user && user.role);
    const answer = buildEntityAnswer({ route, crm, web, showId });
    if (crm) this._debug(`[CRM_SEARCH] matched=${matches.length > 0} count=${matches.length} entity=${match ? match.entityType : "n/a"}`);
    this._debug(`[WEB_SEARCH] provider=${web.provider || "n/a"} executed=${web.status === "ok"} status=${web.status} results=${web.results.length}`);
    this._debug(`[IDENTITY_MATCH] confidence=${typeof web.confidence === "number" ? web.confidence.toFixed(2) : "n/a"} level=${web.identity || "n/a"}`);
    this._debug(`[RESPONSE_BUILDER] crm=${Boolean(match)} web=${web.status === "ok" && web.results.length > 0} sources=${web.results.length} synthesis=${Boolean(web.summary)}`);
    this.logger.info(`recherche "${route.entity}/${route.operation}" (${route.language}) source=${route.source} crm=${matches.length} web=${web.status}:${web.results.length}`);
    this.logger.info(`[AI CRM RESPONSE] entity=${entityType} operation=${route.operation} fields=${JSON.stringify(route.fields || [])} found=${matches.length} chars=${answer.length}`);
    return this._result(answer, toolSteps, web, {
      // Sujet de la conversation pour « Quel est son téléphone ? » — uniquement
      // une fiche identifiée sans ambiguïté ; une recherche infructueuse ne
      // remplace pas le sujet en cours.
      focusEntity: match ? { type: match.entityType, id: match.id, name: match.name } : matches.length === 0 && !crm ? { type: entityType, id: null, name: route.target } : null,
    });
  }
}

function createEntityLookupAgent({ chatModel, tools = [], workflowEngine, memory = null, maxHistoryMessages, promptInjectionGuard = null, queryRouter = null, entityLookupTimeoutMs, webSynthesis = null }) {
  return new EntityLookupAgent({
    name: "entity_lookup_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["entity_lookup"],
    requiredRoles: [],
    allowedEmails: [],
    chatModel,
    tools,
    allowedToolNames: ALLOWED_TOOL_NAMES,
    workflowEngine,
    memory,
    maxHistoryMessages,
    promptInjectionGuard,
    router: queryRouter,
    synthesisEnabled: webSynthesis,
    ...(entityLookupTimeoutMs ? { timeoutMs: entityLookupTimeoutMs } : {}),
  });
}

module.exports = { EntityLookupAgent, createEntityLookupAgent, ALLOWED_TOOL_NAMES, SYSTEM_PROMPT };
