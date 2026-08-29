"use strict";

const { BaseAgent } = require("./baseAgent");
const { AgentError } = require("./errors");
const { tokenize } = require("../utils/tokenize");
const { analyzeProjectAttention } = require("../reasoning/projectAttentionAnalyzer");
const { buildAttentionAnswer } = require("../reasoning/attentionAnswerBuilder");
const { checkProjectsCoherence } = require("../reasoning/dataCoherenceChecker");

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "CORRIGER
// PROJECT AGENT POUR LES PROJETS CRITIQUES ADMIN". Identique au triplet
// ADMIN_TIER_ROLES déjà répété PAR CONVENTION ailleurs dans ce noyau
// (listProjectsTool.js, getPersonalKpiSummaryTool.js, dashboard.service.js,
// commercialContactKpi.service.js, capabilityMatrixService.js) — aucun
// module partagé n'existe pour ce triplet aujourd'hui, donc la même
// constante est répétée ici, jamais une nouvelle matrice RBAC. Ne peut pas
// être importée depuis listProjectsTool.js : un Agent ne peut jamais
// require() mcp/tools/* directement (test/ai.agents.policy.test.js).
const ADMIN_TIER_ROLES = new Set(["admin", "superadmin", "superadmin2"]);

// Les 3 Tools réellement exposés par le module Projects (voir
// mcp/tools/projects/ et Backend Master/src/ai/README.md, "Projects : périmètre
// réduit") — liste blanche explicite plutôt qu'une dérivation dynamique du
// module, pour rester auditable dans un diff. `list_commercial_candidates`
// (module Users) ajouté pour la mission "IMPLÉMENTER PROJETS D'UN
// UTILISATEUR NOMMÉ" — voir _runOwnerNameQuery() ci-dessous : c'est le SEUL
// Tool déjà existant qui renvoie un nom d'affichage réel (`fullName`, via
// `resolveFullName()`, utils/userDisplay.js — même utilitaire déjà réutilisé
// par hrRequest.service.js) aux côtés d'un `id` — `list_users`
// (admin-tier seul) ne renvoie que id/email/role/isActive, AUCUN nom.
// `list_commercial_candidates` est `requiredRoles: []` au niveau Tool, mais
// cet Agent ne l'utilise QUE pour un actingUser déjà admin-tier (vérifié
// AVANT tout appel, voir _runOwnerNameQuery) — jamais élargi au-delà.
const ALLOWED_TOOL_NAMES = ["list_projects", "move_project_stage", "assign_project_owner", "list_commercial_candidates"];

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission
// "IMPLÉMENTER PROJETS D'UN UTILISATEUR NOMMÉ". Détection déterministe
// (jamais une extraction LLM fragile, jamais un UUID lu dans le message —
// voir sa propre garantie structurelle : le nom capturé n'est JAMAIS un
// UUID, seulement un texte libre, résolu plus loin via
// `list_commercial_candidates`).
//
// Déclencheurs FORTS — spécifiques, capturent le nom quelle que soit sa
// casse : vérifiés SANS collision contre les 536 scénarios du corpus de
// validation (aucun ne contient "appartenant"/"associé(s) à" — voir
// test/ai.agents.projectAgent.ownerNameQuery.test.js).
const STRONG_OWNER_TRIGGER = /\bprojets?\b[\s\S]*?\b(?:appartenant\s+à|associ[ée]s?\s+à|de\s+l['’]utilisateur)\s+([^?.!,;]+)/i;
// Déclencheur FAIBLE ("... de X") — "de" est un mot bien trop générique
// pour servir de signal fiable seul : le corpus contient plusieurs
// scénarios `projects` légitimes avec "de" après "projet(s)" sans qu'il
// s'agisse d'un nom ("...niveau de risque", "...bloqués... de deux
// semaines", "...risques de ce projet"...). Exige que X commence par une
// majuscule (heuristique de nom propre — limite connue : "hadil" tout en
// minuscules ne déclenche pas cette voie, documenté dans le rapport final).
const WEAK_OWNER_TRIGGER = /\bprojets?\b[\s\S]*?\bde\s+([A-ZÀ-Ý][^?.!,;]*)/;

// Références génériques à un tiers non nommé — jamais un nom réel, donc
// jamais transmises à la résolution (évite de coûteusement chercher "un
// autre utilisateur" comme si c'était un nom de personne, et préserve le
// comportement déjà établi de projectOwnershipOverride.js pour ces mêmes
// formulations).
const GENERIC_OWNER_REFERENCES = new Set([
  "moi", "mes", "vous", "nous", "eux", "elle", "lui",
  "un utilisateur", "un autre utilisateur", "cet utilisateur", "cette personne",
  "quelqu'un", "quelqu’un", "l'utilisateur", "l’utilisateur", "un autre", "autre utilisateur",
  "cet autre utilisateur",
]);

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission
// "CORRIGER LA RECHERCHE/DESCRIPTION D'UN PROJET PAR SON NOM". Détection
// déterministe d'un NOM DE PROJET dans le message — jamais un projectId lu
// dans le texte (voir _runProjectDescribeQuery ci-dessous : le seul id
// jamais transmis à un Tool vient de la résolution serveur).
//
// "décrire (le) projet X"/"parle-moi du projet X"/"informations|détails
// (sur le|du) projet X" — un simple "projet X" isolé est INSUFFISANT et
// dangereux : le corpus contient 14 scénarios `projects` légitimes avec
// "(du/le) projet <Nom propre>" qui ne sont PAS des demandes de
// description ("Quelle est l'étape actuelle du projet Sfax ?", "Qui est le
// propriétaire du projet Tunis Nord ?", "Déplace le projet Sousse vers
// l'étape suivante.", "Pourquoi le projet Depot SBF est critique ?"...) —
// un verbe/nom de description explicite est donc exigé AVANT "projet X",
// jamais "projet X" seul (vérifié SANS collision contre les 65 scénarios
// `projects` du corpus — voir test/ai.agents.projectAgent.describeQuery.test.js).
const PROJECT_NAME_WITH_KEYWORD =
  /\b(?:d[ée]cri(?:s|re)\s+(?:le\s+)?projet|parle[- ]moi\s+du\s+projet|(?:informations?|d[ée]tails?)\s+(?:sur\s+le\s+projet|du\s+projet))\s+([A-ZÀ-Ý][^?.!,;]*)/;
// "détails de X"/"informations de X" (sans le mot "projet") — même
// déclencheur, en miroir, que projectDescribeOverride.js (routage) :
// nécessaire ici aussi, car ProjectAgent ne sait pas PAR QUEL chemin il a
// été atteint (mot-clé direct ou repli general_chat).
const PROJECT_NAME_WITHOUT_KEYWORD = /\b(?:[Dd][ée]tails?|[Ii]nformations?)\s+(?:du\s+[Pp]rojet\s+|sur\s+le\s+[Pp]rojet\s+|de\s+)([A-ZÀ-Ý][^?.!,;]*)/;

// Mission "CORRIGER LE FILTRAGE DES PROJETS PAR STATUT" — reproduit en
// direct : "donner moi les projet dont son statut est Négociation"
// atteignait le chemin générique ToolCallingChain, où le LLM devait
// lui-même choisir la clé/valeur à envoyer à list_projects — mais
// project.repository.js::buildBaseWhere() n'a JAMAIS eu de branche pour
// filtrer sur `statut` (seul `stageId`/pipelineStageId, un concept
// différent, était reconnu), donc AUCUNE valeur envoyée n'avait jamais
// d'effet. Corrigé côté data-access (voir project.repository.js/
// project.service.js/listProjectsTool.js), et — même discipline que
// _extractOwnerName/_extractProjectName ci-dessus — l'extraction/
// normalisation de la valeur de statut est rendue déterministe ici plutôt
// que confiée au LLM (qui produirait une casse/accentuation imprévisible,
// voir AI-Business-Copilot/21_TOOL_CALLING_RELIABILITY.md pour la même
// classe de problème déjà rencontrée).
//
// Les 11 valeurs RÉELLES et STABLES de Project.statut (vérifiées en
// direct : décompte par valeur de la colonne statut, table projects — la
// même agrégation que "Breakdown by Status" du dashboard, voir
// dashboard.service.js) — jamais devinées, jamais dérivées d'un Tool
// "valeurs distinctes" (aucun n'existe).
const KNOWN_STATUS_VALUES = [
  "Identification",
  "Préparation",
  "Proposition technique",
  "Proposition commerciale",
  "Négociation",
  "En cours",
  "Livraison",
  "Fidélisation",
  "Terminé",
  "Plan technique",
  "Prospect",
];

// Insensible aux accents ET à la casse — même algorithme (NFD + strip des
// diacritiques) que _normalizeProjectName ci-dessous, factorisé ici pour
// pouvoir construire STATUS_LOOKUP une seule fois au chargement du module.
function normalizeAccents(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

// Table normalisée -> valeur RÉELLEMENT stockée en base (jamais l'inverse :
// la valeur envoyée au Tool doit toujours être celle que Postgres connaît
// déjà, jamais une variante devinée). Chaque valeur est indexée sous sa
// forme normalisée ET, si elle ne commence pas déjà par "en ", sous la
// forme "en <normalisée>" — pour reconnaître "les projets en Négociation"
// (préposition "en" + statut) SANS jamais confondre avec "En cours" (le
// statut réel qui, lui, commence légitimement par "en").
const STATUS_LOOKUP = new Map();
for (const value of KNOWN_STATUS_VALUES) {
  const normalized = normalizeAccents(value);
  STATUS_LOOKUP.set(normalized, value);
  if (!normalized.startsWith("en ")) {
    STATUS_LOOKUP.set(`en ${normalized}`, value);
  }
}

// "... statut est Négociation" / "... au statut Négociation" / "... statut
// négociation" — priorité 1 (mention explicite du mot "statut").
const STATUS_WITH_KEYWORD_TRIGGER = /\bstatut\b\s*(?:est\s+|:\s*|=\s*)?([A-Za-zÀ-ÿ][^?.!,;]*)/i;
// Repli sans le mot "statut" — "Liste les projets en Négociation"/"...projets
// en cours". Volontairement large (n'importe quoi après "projet(s) ") : sans
// intérêt à elle seule, cette capture n'a d'effet QUE si le résultat
// normalisé correspond exactement à une entrée de STATUS_LOOKUP (voir
// _extractStatus) — un message comme "projets en retard"/"projets de Hadil"
// ne matche aucune entrée connue et retombe donc sans risque sur les autres
// chemins (attention/nom de propriétaire) déjà en place.
const STATUS_TAIL_TRIGGER = /\bprojets?\s+([A-Za-zÀ-ÿ][^?.!,;]*)/i;

// Signal lexical scopé à CET Agent (pas une intention/un mot-clé du
// catalogue global — voir orchestrator/intentCatalog.js) : ne se déclenche
// QUE quand ProjectAgent a déjà été sélectionné pour l'intention "projects",
// donc jamais de faux positif sur une question sans rapport avec les
// projets. Volontairement pas ajouté à intentCatalog.js : "attention" est un
// mot trop générique pour servir de mot-clé de ROUTAGE (il apparaîtrait dans
// des messages n'ayant rien à voir avec les projets) — voir
// reasoning/BUSINESS_REASONING.md, section "Où le déclenchement a lieu".
const ATTENTION_MARKERS = [
  "attention",
  "prioritaire",
  "prioritaires",
  "priorite",
  "priorité",
  "priorites",
  "priorités",
  "risque",
  "risques",
  "urgent",
  "urgents",
  "urgente",
  "urgentes",
  "surveiller",
  "surveillance",
  // "retard"/"retards" est la toute première dimension notée par
  // ProjectAttentionAnalyzer (voir BUSINESS_REASONING.md) mais avait été
  // omise de cette liste — un vrai angle mort découvert en développant le
  // Natural Conversation Engine (CONVERSATION_CONTEXT.md) : sans ce mot, la
  // question canonique « Et lesquels sont en retard ? » (résolue vers
  // l'intention "projects" par ConversationContextResolver) retombait sur
  // le chemin générique de BaseAgent au lieu du classement par attention
  // réel — corrigé ici, jamais dans le resolver (qui ne connaît rien du
  // vocabulaire métier d'un Agent en particulier).
  "retard",
  "retards",
  // Même angle mort, découvert cette fois en diagnostiquant
  // AI-Business-Copilot/09_INCIDENT_KPI_AGENT.md : "critique"/"critiques"
  // est LE LIBELLÉ MÊME que ProjectAttentionAnalyzer utilise pour sa
  // priorité la plus haute (`priority === "critique"` — la définition
  // réelle et unique de "projet critique" dans ce CRM, voir
  // dashboardBriefing.service.js, qui filtre exactement sur cette valeur
  // pour le compteur "projets critiques" de l'AI Dashboard) — pourtant
  // absent de cette liste. Sans ce mot, « Quels projets sont critiques ? »
  // (la question canonique la plus naturelle pour cette priorité)
  // retombait sur le chemin générique de BaseAgent, jamais sur le
  // classement par attention réel.
  "critique",
  "critiques",
].map((m) => m.toLowerCase());

const SYSTEM_PROMPT = [
  "Tu es l'Agent Projets du CRM CBI Tunisia.",
  "Tu aides à consulter la liste des projets, changer l'étape d'un projet et",
  "assigner un propriétaire, exclusivement via les Tools fournis.",
  "N'invente jamais un projet, une étape ou un propriétaire qui ne provient pas",
  "du résultat d'un Tool.",
].join(" ");

/**
 * # ProjectAgent — prend en charge l'intention `projects`
 *
 * ## Raisonnement métier — « Quels projets nécessitent une attention ? »
 * Contrairement au comportement par défaut de `BaseAgent._run()` (tool-calling
 * puis réponse du modèle), une question qui contient un marqueur
 * d'attention/priorité/risque (`ATTENTION_MARKERS`) déclenche un chemin
 * ENTIÈREMENT déterministe, sans second appel au modèle de langage :
 * 1. Appelle `list_projects` (le même Tool MCP que le chemin normal — aucun
 *    accès direct à un service CRM, voir `test/ai.agents.policy.test.js`).
 * 2. Passe les projets renvoyés à `ProjectAttentionAnalyzer.analyzeProjectAttention()`
 *    (`reasoning/projectAttentionAnalyzer.js`) — calcule, pour chacun, un
 *    score sur 6 dimensions (retard, budget, activité, échéances, pipeline,
 *    blocages) et une priorité (`critique`/`elevee`/`moyenne`/`faible`).
 * 3. Met le classement en mots via `buildAttentionAnswer()`
 *    (`reasoning/attentionAnswerBuilder.js`).
 * Voir `reasoning/BUSINESS_REASONING.md` pour la justification de chaque
 * règle et ses limites assumées.
 *
 * ## Smart Suggestions — proposer sans jamais exécuter
 * 4. Après le classement, `suggestionEngine` (optionnel, injecté par
 *    `orchestrator/pipeline.js` — `null` par défaut, rétrocompatible) reçoit
 *    l'union des `factors` de tous les projets signalés (priorité ≠
 *    "faible") et renvoie une liste d'actions candidates DÉJÀ filtrée aux
 *    seules actions que `user` est autorisé à réaliser (voir
 *    `orchestrator/suggestionEngine.js`/`SMART_SUGGESTIONS.md`). Cette liste
 *    est purement descriptive (`{id, label, reason}`) : `ProjectAgent`
 *    n'appelle, ne planifie et n'exécute JAMAIS lui-même l'action suggérée —
 *    voir `test/ai.agents.projectAgent.test.js`, section Smart Suggestions.
 *
 * ## Vérifier la cohérence des données (étape 8)
 * 5. `checkProjectsCoherence()` (`reasoning/dataCoherenceChecker.js`)
 *    parcourt les MÊMES projets renvoyés par `list_projects` et signale les
 *    fiches incomplètes (réutilise `completionRate`/`missingFields`, déjà
 *    calculés par le CRM) ou logiquement incohérentes (ex. étape "gagnée"
 *    mais avancement < 100 %) — exposé sous `dataQuality` dans la réponse,
 *    jamais mélangé à `answer` (voir `BUSINESS_REASONING.md`).
 *
 * Permissions laissées ouvertes (`requiredRoles: []`) au niveau de l'Agent :
 * `list_projects` est ouvert à tout utilisateur authentifié tandis que
 * `move_project_stage`/`assign_project_owner` exigent déjà `admin`/
 * `superadmin`/`superadmin2` au niveau du Tool lui-même (voir
 * mcp/tools/projects/) — c'est le Permission Manager MCP, pas cet Agent, qui
 * doit trancher au cas par cas.
 */
class ProjectAgent extends BaseAgent {
  constructor({ suggestionEngine = null, ...rest }) {
    super(rest);
    this.suggestionEngine = suggestionEngine;
  }

  async _run({ message, user, conversationId }) {
    if (this._looksLikeAttentionQuery(message)) {
      return this._runAttentionAnalysis(user);
    }
    const statusValue = this._extractStatus(message);
    if (statusValue) {
      return this._runStatusQuery(statusValue, user);
    }
    const ownerName = this._extractOwnerName(message);
    if (ownerName) {
      return this._runOwnerNameQuery(ownerName, user);
    }
    const projectName = this._extractProjectName(message);
    if (projectName) {
      return this._runProjectDescribeQuery(projectName, user);
    }
    return super._run({ message, user, conversationId });
  }

  _looksLikeAttentionQuery(message) {
    const terms = new Set(tokenize(message));
    return ATTENTION_MARKERS.some((marker) => terms.has(marker));
  }

  // Repère "les projets de X"/"...appartenant à X"/"...associés à X"/"...de
  // l'utilisateur X" — jamais un UUID, jamais une extraction LLM. `X` est
  // capturé tel quel (casse d'origine préservée) puis nettoyé/filtré.
  _extractOwnerName(message) {
    const match = message.match(STRONG_OWNER_TRIGGER) || message.match(WEAK_OWNER_TRIGGER);
    if (!match) return null;
    const candidate = match[1].trim().replace(/\s+/g, " ");
    if (!candidate) return null;
    if (GENERIC_OWNER_REFERENCES.has(candidate.toLowerCase())) return null;
    // Filet de sécurité : un nom réel ne s'étend pas sur une phrase entière.
    if (candidate.split(" ").length > 4) return null;
    return candidate;
  }

  // Repère "projet X"/"détails de X"/"informations du projet X" — jamais un
  // projectId, jamais une extraction LLM.
  _extractProjectName(message) {
    const match = message.match(PROJECT_NAME_WITH_KEYWORD) || message.match(PROJECT_NAME_WITHOUT_KEYWORD);
    if (!match) return null;
    const candidate = match[1].trim().replace(/\s+/g, " ");
    if (!candidate) return null;
    // Filet de sécurité : même discipline que _extractOwnerName — un nom de
    // projet réel ne s'étend pas sur une phrase entière.
    if (candidate.split(" ").length > 6) return null;
    return candidate;
  }

  // Repère "... statut est Négociation"/"... au statut Négociation"/"...
  // projets en Négociation" — jamais une extraction LLM, jamais une valeur
  // qui n'existe pas réellement en base : ne retourne QUE l'une des 11
  // valeurs RÉELLES de KNOWN_STATUS_VALUES (via STATUS_LOOKUP), jamais le
  // texte brut capturé. Un texte qui ne correspond à aucune valeur connue
  // retourne `null` et laisse le message retomber sur les autres chemins
  // (attention/nom de propriétaire/nom de projet/générique) sans risque.
  _extractStatus(message) {
    const match = message.match(STATUS_WITH_KEYWORD_TRIGGER) || message.match(STATUS_TAIL_TRIGGER);
    if (!match) return null;
    const candidate = match[1].trim().replace(/\s+/g, " ");
    if (!candidate) return null;
    return STATUS_LOOKUP.get(normalizeAccents(candidate)) || null;
  }

  async _runStatusQuery(statusValue, user) {
    const tool = this._allowedTools().find((t) => t.name === "list_projects");
    if (!tool) {
      throw new AgentError(`Agent "${this.name}" has no "list_projects" Tool available to run the status query.`);
    }

    // Même principe transverse que _runAttentionAnalysis/_runProjectDescribeQuery
    // ci-dessus : admin-tier voit tous les projets actifs, tout autre rôle
    // reste scopé à SES PROPRES projets (mine:true) — jamais recalculé ici,
    // c'est scopeInputForActingUser() (listProjectsTool.js) qui l'imposerait
    // de toute façon côté serveur si ce booléen était omis ou falsifié.
    const baseInput = ADMIN_TIER_ROLES.has(user.role) ? { isArchived: false, limit: 100 } : { isArchived: false, limit: 100, mine: true };
    const toolInput = { ...baseInput, statut: statusValue };
    const rawOutput = await tool.invoke(toolInput);
    const { data: projects = [], total = 0 } = JSON.parse(rawOutput);

    return {
      answer: this._buildStatusProjectsAnswer(statusValue, projects, total),
      citations: [],
      toolSteps: [{ tool: "list_projects", input: toolInput, output: `${projects.length}/${total} projet(s) au statut « ${statusValue} »` }],
    };
  }

  // Construit la réponse UNIQUEMENT à partir de ce que list_projects a
  // réellement renvoyé — `total` vient de Project.findAndCountAll() (même
  // WHERE que les lignes retournées, voir project.repository.js), jamais un
  // nombre recalculé ou supposé. Affiche au plus 10 fiches détaillées
  // (lisibilité du panneau Copilot, voir mission) avec un décompte honnête
  // du reliquat — jamais "23 projets" si moins de 23 ont réellement été
  // retournés/comptés.
  _buildStatusProjectsAnswer(statusValue, projects, total) {
    if (total === 0) {
      return `Aucun projet trouvé avec le statut « ${statusValue} ».`;
    }
    const DISPLAY_LIMIT = 10;
    const shown = projects.slice(0, DISPLAY_LIMIT);
    const lines = [
      `📋 PROJETS — ${statusValue.toUpperCase()}`,
      "",
      total > shown.length ? `${total} projets trouvés. Voici les ${shown.length} premiers :` : `${total} projet${total > 1 ? "s" : ""} trouvé${total > 1 ? "s" : ""}`,
      "",
    ];
    shown.forEach((p, i) => {
      lines.push(`${i + 1}. ${p.nomProjet || "Projet sans nom"}`);
      const owner = p.owner && (p.owner.name || p.owner.email);
      if (owner) lines.push(`   👤 Responsable : ${owner}`);
      if (p.dateDemarrage) lines.push(`   📅 Date de début : ${p.dateDemarrage}`);
      lines.push(`   📊 Statut : ${p.statut || statusValue}`);
      lines.push("");
    });
    if (total > shown.length) {
      lines.push(`... et ${total - shown.length} autre(s) projet(s) non affiché(s) ici — précisez si vous voulez les voir tous.`);
    }
    return lines.join("\n").trimEnd();
  }

  async _runAttentionAnalysis(user) {
    const tool = this._allowedTools().find((t) => t.name === "list_projects");
    if (!tool) {
      throw new AgentError(`Agent "${this.name}" has no "list_projects" Tool available to run the attention analysis.`);
    }

    // AI-Business-Copilot/24_PROJECT_AGENT_RBAC_FIX.md avait ajouté
    // `mine: true` inconditionnellement : sans lui, ce chemin déterministe
    // interrogeait TOUS les projets actifs du système (185/253), tronqués à
    // `limit:100` — sur les 100 retournés, 83 appartenaient à d'autres
    // utilisateurs (vérifié via leur ownerId réel en base). Correct pour un
    // rôle NON admin-tier, mais appliqué SANS distinction de rôle, ce même
    // `mine: true` restreignait aussi admin/superadmin/superadmin2 à LEURS
    // PROPRES projets — or aucun compte admin-tier réel de cette base n'en
    // possède un seul (0 projet actif chacun, vérifié en direct) : « Quels
    // projets sont critiques ? » répondait donc TOUJOURS "aucun" pour ces
    // rôles, quel que soit l'état réel de la base (mission "CORRIGER
    // PROJECT AGENT POUR LES PROJETS CRITIQUES ADMIN" — 60 projets
    // réellement critiques trouvés lors de l'audit). Corrigé en réutilisant
    // EXACTEMENT le même principe transverse déjà appliqué par
    // dashboardBriefing.service.js::buildProjectInsights() pour cette même
    // analyse (jamais une deuxième définition de "projets à analyser") :
    // admin-tier voit tous les projets actifs, tout autre rôle garde
    // `mine: true` strictement inchangé — que ce booléen soit envoyé ou non
    // pour un rôle non admin-tier, `scopeInputForActingUser()`
    // (listProjectsTool.js) l'aurait de toute façon imposé côté serveur :
    // aucun élargissement de scope n'est introduit, ni possible, par ce
    // changement. Le rôle vient de `user.role` (`actingUser` réel, résolu
    // depuis le JWT bien avant cet Agent), jamais du message ni d'un choix
    // du LLM — voir la garde `ownerId`/`userId` déjà en place dans
    // `scopeInputForActingUser()`, inchangée.
    const toolInput = ADMIN_TIER_ROLES.has(user.role)
      ? { limit: 100, isArchived: false }
      : { limit: 100, isArchived: false, mine: true };
    const rawOutput = await tool.invoke(toolInput);
    const { data: projects = [] } = JSON.parse(rawOutput);

    const ranked = analyzeProjectAttention(projects);
    const answer = buildAttentionAnswer(ranked);
    const suggestions = this._suggestActionsFor(ranked, user);
    const dataQuality = checkProjectsCoherence(projects);

    return {
      answer,
      citations: [],
      suggestions,
      dataQuality,
      toolSteps: [
        { tool: "list_projects", input: toolInput, output: `${projects.length} projet(s) analysé(s)` },
        {
          tool: "analyze_project_attention",
          // Étape de RAISONNEMENT (pas un Tool MCP réel) — voir
          // orchestrator/explainabilityBuilder.js, qui distingue les deux
          // pour construire response.explainability.businessRules.
          synthetic: true,
          description: `Classement de ${ranked.length} projet(s) par attention sur 6 dimensions (retard, budget, activité, échéances, pipeline, blocages) — voir BUSINESS_REASONING.md.`,
          input: {},
          output: ranked.map((r) => ({ projectId: r.projectId, projectName: r.projectName, score: r.score, priority: r.priority })),
        },
      ],
    };
  }

  // AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission
  // "IMPLÉMENTER PROJETS D'UN UTILISATEUR NOMMÉ". Flow entièrement
  // déterministe, jamais de LLM :
  //   nom détecté -> RBAC (admin-tier only) -> list_commercial_candidates
  //   -> résolution (0/1/plusieurs) -> list_projects({ownerId: id résolu})
  // Le LLM n'intervient JAMAIS dans cette chaîne — aucun UUID n'est jamais
  // lu depuis `message` (voir TEST OBLIGATOIRE anti-injection dans
  // test/ai.agents.projectAgent.ownerNameQuery.test.js : un UUID présent
  // dans le texte n'a structurellement aucun effet, seul `resolvedUser.id`,
  // obtenu de `list_commercial_candidates`, est jamais utilisé).
  async _runOwnerNameQuery(ownerName, user) {
    // NON ADMIN-TIER : jamais d'accès aux projets d'un tiers nommé, quelle
    // que soit l'identité visée — refus déterministe, AUCUN Tool appelé.
    // "Mes projets" (déjà existant, inchangé) reste la voie légitime pour
    // consulter ses propres projets, y compris pour la personne nommée
    // elle-même — voir le rapport de mission pour la justification de ce
    // choix (pas de résolution d'auto-référence, hors-scope demandé).
    if (!ADMIN_TIER_ROLES.has(user.role)) {
      return {
        answer:
          "Vous ne pouvez consulter que vos propres projets — demandez « Quels sont mes projets ? ». " +
          "La consultation des projets d'un autre utilisateur nommé n'est pas autorisée pour votre rôle.",
        citations: [],
        toolSteps: [],
      };
    }

    const candidatesTool = this._allowedTools().find((t) => t.name === "list_commercial_candidates");
    const listTool = this._allowedTools().find((t) => t.name === "list_projects");
    if (!candidatesTool || !listTool) {
      throw new AgentError(`Agent "${this.name}" is missing a Tool required to resolve a named owner's projects.`);
    }

    const rawCandidates = await candidatesTool.invoke({});
    const allCandidates = JSON.parse(rawCandidates);

    const normalized = ownerName.toLowerCase();
    const exactMatches = allCandidates.filter((c) => (c.fullName || "").trim().toLowerCase() === normalized);
    const matches =
      exactMatches.length > 0
        ? exactMatches
        : allCandidates.filter((c) => {
            const fullName = (c.fullName || "").trim().toLowerCase();
            return fullName && (fullName.includes(normalized) || normalized.includes(fullName));
          });

    const candidatesStep = { tool: "list_commercial_candidates", input: {}, output: `${allCandidates.length} candidat(s), ${matches.length} correspondance(s) pour « ${ownerName} »` };

    if (matches.length === 0) {
      return { answer: `Je n'ai trouvé aucun utilisateur correspondant à « ${ownerName} ».`, citations: [], toolSteps: [candidatesStep] };
    }
    if (matches.length > 1) {
      const options = matches.map((c) => `${c.fullName} (${c.email})`).join(", ");
      return {
        answer: `Plusieurs utilisateurs correspondent à « ${ownerName} » : ${options}. Pouvez-vous préciser l'adresse e-mail ou le nom complet ?`,
        citations: [],
        toolSteps: [candidatesStep],
      };
    }

    // Exactement UNE correspondance : le SEUL id jamais transmis à
    // list_projects, jamais un UUID venu du message ou du LLM.
    const resolvedUser = matches[0];
    const toolInput = { ownerId: resolvedUser.id, limit: 100, isArchived: false };
    const rawOutput = await listTool.invoke(toolInput);
    const { data: projects = [], total = 0 } = JSON.parse(rawOutput);

    return {
      answer: this._buildOwnerProjectsAnswer(resolvedUser.fullName, projects, total),
      citations: [],
      toolSteps: [candidatesStep, { tool: "list_projects", input: toolInput, output: `${projects.length} projet(s) de ${resolvedUser.fullName}` }],
    };
  }

  _buildOwnerProjectsAnswer(ownerLabel, projects, total) {
    if (projects.length === 0) {
      return `${ownerLabel} ne possède actuellement aucun projet actif.`;
    }
    const lines = [`${ownerLabel} possède ${total} projet(s) :`, ""];
    projects.slice(0, 20).forEach((p) => lines.push(`- ${p.nomProjet || p.title || "Projet sans nom"}`));
    if (total > 20) lines.push(`... et ${total - 20} autre(s) projet(s) non affiché(s) ici.`);
    return lines.join("\n");
  }

  // AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission
  // "CORRIGER LA RECHERCHE/DESCRIPTION D'UN PROJET PAR SON NOM". Flow
  // entièrement déterministe, jamais de LLM :
  //   nom détecté -> list_projects(search: nom[, mine:true]) -> résolution
  //   (0/1/plusieurs, insensible accents/casse) -> réponse
  // Le SEUL Tool réutilisé est list_projects (déjà existant, déjà scopé par
  // scopeInputForActingUser côté Tool — jamais contournée, jamais
  // recalculée ici) : admin-tier voit tous les projets actifs (même
  // principe transverse que _runAttentionAnalysis, mission P0 précédente),
  // tout autre rôle reste scopé à SES PROPRES projets (mine:true) — décrire
  // le projet d'un autre utilisateur non-admin-tier retombe donc
  // naturellement sur "introuvable", jamais une fuite ni un message
  // d'erreur distinct qui révélerait que le projet existe ailleurs.
  async _runProjectDescribeQuery(projectName, user) {
    const listTool = this._allowedTools().find((t) => t.name === "list_projects");
    if (!listTool) {
      throw new AgentError(`Agent "${this.name}" has no "list_projects" Tool available to describe a project by name.`);
    }

    const baseInput = ADMIN_TIER_ROLES.has(user.role) ? { isArchived: false, limit: 100 } : { isArchived: false, limit: 100, mine: true };

    // Passe 1 — recherche ciblée côté DB (ILIKE, rapide ; gère déjà la
    // casse et les cas où l'accentuation du message correspond exactement).
    let rawOutput = await listTool.invoke({ ...baseInput, search: projectName });
    let { data: candidates = [] } = JSON.parse(rawOutput);
    let matches = this._matchProjectsByName(candidates, projectName);
    let toolSteps = [{ tool: "list_projects", input: { ...baseInput, search: projectName }, output: `${candidates.length} candidat(s) (recherche ciblée), ${matches.length} correspondance(s)` }];

    // Passe 2 (repli) — Postgres ILIKE est SENSIBLE aux accents (vérifié en
    // direct : ILIKE '%Residence HOLYA%' sans accent ne trouve PAS
    // "Résidence HOLYA") : si la recherche ciblée ne trouve rien, élargit
    // sur le MÊME périmètre déjà autorisé (aucune donnée supplémentaire
    // exposée, juste comparée différemment) et compare en JS de façon
    // insensible aux accents/casse — jamais une deuxième source de vérité,
    // seulement une comparaison plus tolérante sur les projets déjà
    // scopés par baseInput/scopeInputForActingUser.
    if (matches.length === 0) {
      rawOutput = await listTool.invoke(baseInput);
      ({ data: candidates = [] } = JSON.parse(rawOutput));
      matches = this._matchProjectsByName(candidates, projectName);
      toolSteps.push({ tool: "list_projects", input: baseInput, output: `${candidates.length} candidat(s) (repli insensible aux accents), ${matches.length} correspondance(s)` });
    }

    if (matches.length === 0) {
      return { answer: `Je n'ai trouvé aucun projet correspondant à « ${projectName} ».`, citations: [], toolSteps };
    }
    if (matches.length > 1) {
      const options = matches.map((p) => `${p.nomProjet} (propriétaire : ${p.owner && p.owner.email ? p.owner.email : "inconnu"})`).join(", ");
      return {
        answer: `Plusieurs projets correspondent à « ${projectName} » : ${options}. Pouvez-vous préciser le propriétaire ou un autre détail ?`,
        citations: [],
        toolSteps,
      };
    }

    return { answer: this._buildProjectDetailsAnswer(matches[0]), citations: [], toolSteps };
  }

  // Comparaison insensible aux accents ET à la casse — jamais un choix
  // arbitraire : une correspondance EXACTE (une fois normalisée) est
  // toujours préférée à une correspondance partielle, et TOUTE ambiguïté
  // réelle (plusieurs projets normalisés identiques) est remontée telle
  // quelle, jamais tranchée ici.
  _normalizeProjectName(value) {
    return normalizeAccents(value);
  }

  _matchProjectsByName(projects, name) {
    const target = this._normalizeProjectName(name);
    const exact = projects.filter((p) => this._normalizeProjectName(p.nomProjet) === target);
    if (exact.length > 0) return exact;
    return projects.filter((p) => {
      const normalized = this._normalizeProjectName(p.nomProjet);
      return normalized && (normalized.includes(target) || target.includes(normalized));
    });
  }

  // Construit la description UNIQUEMENT à partir des champs déjà renvoyés
  // par list_projects (la même "project card" que la vue liste, voir
  // kanban.service.js::toProjectCard) — jamais une donnée inventée ou
  // devinée : aucun Tool `get_project` n'existe dans ce module (voir audit
  // de mission), donc jamais plus de détail que ce que list_projects sait
  // déjà fournir.
  _buildProjectDetailsAnswer(project) {
    const lines = [`### ${project.nomProjet || "Projet sans nom"}`, ""];
    if (project.statut) lines.push(`Statut : ${project.statut}`);
    if (project.pourcentageReussite != null) lines.push(`Avancement : ${project.pourcentageReussite}%`);
    if (project.montantMarche != null) lines.push(`Montant marché : ${project.montantMarche}`);
    if (project.owner && (project.owner.email || project.owner.name)) {
      lines.push(`Propriétaire : ${project.owner.name || project.owner.email}${project.owner.email ? ` (${project.owner.email})` : ""}`);
    }
    if (project.stage && project.stage.name) lines.push(`Étape pipeline : ${project.stage.name}`);
    if (project.dateLimiteIngenieur) lines.push(`Échéance ingénieur : ${project.dateLimiteIngenieur}`);
    if (project.nextRelanceDate) lines.push(`Prochaine relance : ${project.nextRelanceDate}`);
    if (project.adresse) lines.push(`Adresse : ${project.adresse}`);
    lines.push(`Nombre d'actions enregistrées : ${project.actionsCount ?? 0}`);
    return lines.join("\n");
  }

  // Smart Suggestions (voir orchestrator/suggestionEngine.js/SMART_SUGGESTIONS.md) :
  // pool unique de suggestions pour TOUS les projets signalés (union des
  // `factors` de chaque projet dont la priorité n'est pas "faible",
  // dédupliquée par SuggestionEngine) — pas une suggestion par projet, une
  // simplification assumée et documentée, pas un oubli. Sans
  // `suggestionEngine` injecté (défaut), aucune suggestion n'est produite —
  // rétrocompatible.
  _suggestActionsFor(ranked, user) {
    if (!this.suggestionEngine) return [];
    const flaggedFactors = ranked.filter((r) => r.priority !== "faible").flatMap((r) => r.factors);
    return this.suggestionEngine.suggestForFactors(flaggedFactors, user);
  }
}

function createProjectAgent({ chatModel, tools = [], workflowEngine, qaChain = null, memory = null, maxToolCalls, maxHistoryMessages, promptInjectionGuard = null, suggestionEngine = null }) {
  return new ProjectAgent({
    name: "project_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["projects"],
    requiredRoles: [],
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
    // AI-Business-Copilot/21_TOOL_CALLING_RELIABILITY.md — reproduced live
    // against Ollama/qwen3:8b: the model can return a "final_answer" that
    // CLAIMS to have used list_projects (and states a fabricated result)
    // without ever actually invoking it. project_agent's entire purpose is
    // reporting real CRM data, so a final_answer backed by zero real tool
    // calls is never legitimate here (unlike meeting_agent, which legitimately
    // answers directly most of the time while collecting missing details).
    requireToolUse: true,
    suggestionEngine,
  });
}

module.exports = { createProjectAgent, ProjectAgent, ALLOWED_TOOL_NAMES, ATTENTION_MARKERS, ADMIN_TIER_ROLES, SYSTEM_PROMPT, KNOWN_STATUS_VALUES, normalizeAccents };
