"use strict";

const { SystemMessage, HumanMessage, AIMessage } = require("@langchain/core/messages");
const { IChain } = require("./chain.interface");
const { LangChainError, UnknownToolError, PlanningError, ToolCallLimitExceededError } = require("../errors");
const { buildResponseSystemPrompt } = require("../prompts");
const { withNamespace } = require("../../utils/logger");

const logger = withNamespace("langchain:tool_calling_chain");

// AI-Business-Copilot/20_OLLAMA_PROVIDER.md / 21_TOOL_CALLING_RELIABILITY.md —
// reproduced live against qwen3:8b (Ollama): for "Donne-moi les projets
// associés à Hadil.", the model sometimes returns
// {"action":"final_answer","answer":"J'utilise l'outil list_projects ...
// Aucun projet ne correspond à ce filtre."} on the VERY FIRST turn — valid
// JSON, a real "final_answer" decision, but ZERO tool was ever invoked
// (`steps` empty) despite the answer text claiming otherwise. The model's
// own protocol-following is NOT trustworthy enough to be the source of
// truth for "was a tool actually called" — only `steps.length` (built
// exclusively from real `tool.invoke()` results, never from parsing the
// model's text) can answer that. See `requireToolUse` below.
const UNVERIFIED_FINAL_ANSWER_MESSAGE = "Je n'ai pas pu récupérer les données CRM nécessaires pour répondre à cette question.";

// AI-Business-Copilot/22_OLLAMA_PERFORMANCE.md — measured live: an
// unscoped `list_projects` result (253 projects) re-injected verbatim as
// the NEXT turn's message was 42 115 characters, vs. 1 759 on the turn
// before it — by far the single biggest driver of that turn timing out
// (prefill time on local inference scales with prompt size). This is a
// general safety net for ANY Tool, not specific to list_projects: a Tool
// returning a large result should slow the NEXT LLM call, never make it
// unusable. Only the text fed back to the model is shortened — `steps`
// (the audit trail returned to the caller, used for citations/
// explainability) always keeps the REAL, complete, untruncated output.
const MAX_TOOL_RESULT_CHARS = 4000;

function truncateToolResultForPrompt(text) {
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}… [résultat tronqué : ${text.length} caractères au total, ${MAX_TOOL_RESULT_CHARS} affichés — si le compte ou le détail exact importe, dis-le explicitement plutôt que de conclure à partir de cet extrait partiel]`;
}

// Le protocole JSON (comment DÉCIDER d'appeler un outil) est distinct des
// principes de qualité de réponse (COMMENT rédiger `final_answer.answer`
// une fois la décision prise) — composé via buildResponseSystemPrompt()
// (langchain/prompts/responsePrompts.js), jamais dupliqué ici. Avant cette
// passe, ce prompt système ne portait AUCUNE instruction de qualité : le
// texte de `final_answer.answer` n'était guidé ni sur le ton, ni sur
// l'anti-hallucination, ni sur la citation des données/outils utilisés —
// un vrai manque, comblé ici.
function buildSystemPrompt(tools, role = null) {
  const toolList = tools.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n");
  const protocolInstructions = [
    "Tu es un assistant qui peut appeler des outils pour répondre à une demande.",
    "Outils disponibles :",
    toolList || "(aucun outil disponible)",
    "",
    "Réponds TOUJOURS avec un unique objet JSON, sans aucun texte autour, sous l'une de ces deux formes :",
    '{"action":"call_tool","tool":"<nom_exact_de_l_outil>","input":{...}}',
    '{"action":"final_answer","answer":"..."}',
    "",
    "Le champ \"answer\" de \"final_answer\" doit lui-même respecter les principes de réponse ci-dessus (cite les outils utilisés dans le texte de \"answer\", ne complète jamais une donnée manquante par une supposition).",
  ].join("\n");

  return buildResponseSystemPrompt({ role, extra: protocolInstructions });
}

// Models occasionally wrap JSON in a code fence or add stray whitespace —
// try a direct parse first, then fall back to the first {...} span found.
function parseDecision(rawText) {
  try {
    return JSON.parse(rawText);
  } catch (_err) {
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) {
      throw new PlanningError(`model output is not valid JSON: ${rawText.slice(0, 200)}`);
    }
    try {
      return JSON.parse(rawText.slice(start, end + 1));
    } catch (_err2) {
      throw new PlanningError(`model output is not valid JSON: ${rawText.slice(0, 200)}`);
    }
  }
}

/**
 * # ToolCallingChain — boucle bornée "décide d'appeler un outil ou répond"
 *
 * ## Rôle
 * Implémente le "Tool Calling" demandé : à chaque tour, le modèle reçoit
 * la liste des outils MCP disponibles (déjà filtrée par
 * `mcpToolAdapter.createMcpToolAdapters` selon le rôle de l'`actingUser`
 * fourni à la construction — voir tools/mcpToolAdapter.js) et choisit soit
 * d'appeler un outil, soit de répondre directement. Volontairement basé
 * sur une **sortie JSON structurée** plutôt que sur l'API "function
 * calling" propriétaire d'un fournisseur donné : ça marche avec
 * N'IMPORTE QUEL `ILlmProvider` (aucune hypothèse sur le fournisseur —
 * décision Sprint 0 non tranchée, plan §13.2) et c'est testable avec un
 * modèle factice qui renvoie du texte, sans mock d'API de function-calling.
 *
 * ## Entrée
 * `{ instruction: string }`
 *
 * ## Sortie
 * `{ answer: string, steps: {tool, input, output}[] }` — `steps` trace
 * chaque appel d'outil réellement exécuté, dans l'ordre, avec le résultat
 * COMPLET (jamais tronqué — voir `MAX_TOOL_RESULT_CHARS` ci-dessous, qui ne
 * raccourcit que ce qui est renvoyé au modèle, jamais l'audit trail).
 *
 * ## Performance — troncature du résultat réinjecté (`MAX_TOOL_RESULT_CHARS`)
 * AI-Business-Copilot/22_OLLAMA_PERFORMANCE.md : un résultat de Tool
 * volumineux (ex. `list_projects` non scopé, des centaines d'enregistrements)
 * réinjecté tel quel comme message pour le tour suivant fait exploser la
 * taille du prompt (mesuré : 42 115 caractères sur un tour, contre 1 759 sur
 * le tour précédent) — la cause dominante d'un tour qui dépasse le timeout
 * en inférence locale. Seul le texte renvoyé AU MODÈLE est raccourci
 * (`truncateToolResultForPrompt()`, avec une mention explicite de troncature
 * pour que le modèle ne conclue jamais à tort sur un extrait partiel) —
 * `steps`/`toolCalls` (ce qui est montré à l'utilisateur/l'audit) reste
 * toujours le résultat réel et complet.
 *
 * ## Composition LangChain
 * N'utilise pas `RunnableSequence` (la boucle a un nombre variable
 * d'itérations, contrôlé par du code, pas un graphe statique) — mais reste
 * bâtie sur `chatModel.invoke()` (`BaseChatModel`) et les classes de
 * message `@langchain/core/messages`, donc entièrement compatible avec le
 * reste de l'écosystème LangChain (traçage, callbacks, etc.).
 *
 * ## Sécurité
 * Chaque appel d'outil passe par `mcpServer.handleMessage()` (via les
 * outils injectés) — Permission Manager et Validation Manager s'appliquent
 * exactement comme pour tout autre client MCP. Cette chain ne fait
 * elle-même AUCUNE vérification de permission : elle fait confiance aux
 * outils qu'on lui a donnés pour se protéger eux-mêmes (Single
 * Responsibility).
 *
 * `promptInjectionGuard` (security/promptInjectionGuard.js), optionnel :
 * scanne le RÉSULTAT de chaque appel d'outil avant qu'il ne soit réinjecté
 * comme message dans la conversation (ligne suivante envoyée au modèle) —
 * un champ texte libre du CRM (description de demande de maintenance,
 * commentaire RH, ...) renvoyé par un Tool est un vecteur d'injection de
 * prompt INDIRECTE tout aussi réel que le contenu RAG (déjà protégé par
 * `RagContextBuilder`), simplement découvert plus tard lors d'un audit
 * sécurité. Sans lui (défaut), comportement strictement inchangé.
 *
 * ## Génération de réponse — principes + ton par rôle
 * `role` (optionnel, constructeur) : voir `langchain/prompts/responsePrompts.js`
 * et `RESPONSE_PROMPTS.md`. Compose systématiquement les principes de base
 * (professionnel, naturel, court, sans hallucination, citer les données/
 * outils, expliquer le raisonnement, signaler une information manquante)
 * avec le ton du rôle (admin/commercial/rh/maintenance/direction) si
 * reconnu, AVANT le protocole JSON d'appel d'outil. Sans `role` (défaut),
 * seuls les principes de base + le protocole s'appliquent.
 *
 * ## Erreurs
 * `LangChainError` si `instruction` est vide ; `PlanningError` si le modèle
 * ne renvoie pas un JSON exploitable ; `UnknownToolError` si le modèle
 * nomme un outil qui n'a pas été fourni à la construction ;
 * `ToolCallLimitExceededError` si `maxToolCalls` est atteint sans réponse
 * finale (garde-fou anti-boucle infinie).
 *
 * ## `requireToolUse` — le LLM n'est jamais la source de vérité (opt-in)
 * `false` par défaut (comportement strictement inchangé — un agent
 * conversationnel comme `meeting_agent` répond légitimement `final_answer`
 * sans jamais appeler d'outil la plupart du temps, ex. "il me faut la
 * date/l'heure/la durée", et ce n'est PAS une fabrication). Quand `true`
 * (agents dont le rôle EST de rapporter des données CRM réelles — voir
 * `projectAgent.js`) : un `final_answer` renvoyé alors qu'AUCUN outil n'a
 * réellement été exécuté durant cet appel (`steps.length === 0`, l'état
 * RÉEL de la boucle — jamais un texte du modèle inspecté/parsé, voir le
 * commentaire sur `UNVERIFIED_FINAL_ANSWER_MESSAGE`) est remplacé par un
 * message fixe, honnête, jamais inventé. Le modèle ne peut contourner cette
 * garde par AUCUNE formulation de son texte : la décision ne dépend que de
 * `steps.length`.
 */
class ToolCallingChain extends IChain {
  constructor({ chatModel, tools = [], maxToolCalls = 5, promptInjectionGuard = null, role = null, requireToolUse = false }) {
    super();
    this.chatModel = chatModel;
    this.toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
    this.maxToolCalls = maxToolCalls;
    this.promptInjectionGuard = promptInjectionGuard;
    this.role = role;
    this.requireToolUse = requireToolUse;
  }

  get name() {
    return "tool_calling_chain";
  }

  async invoke({ instruction }) {
    if (!instruction || !instruction.trim()) {
      throw new LangChainError("ToolCallingChain requires a non-empty 'instruction'.");
    }

    const tools = Array.from(this.toolsByName.values());
    const messages = [new SystemMessage(buildSystemPrompt(tools, this.role)), new HumanMessage(instruction)];
    const steps = [];

    for (let turn = 0; turn < this.maxToolCalls; turn++) {
      const response = await this.chatModel.invoke(messages);
      const rawText = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
      const decision = parseDecision(rawText);

      if (decision.action === "final_answer") {
        if (this.requireToolUse && steps.length === 0) {
          logger.warn(
            `final_answer rejected: requireToolUse=true but zero tools were actually invoked — the model's own text is never trusted as proof of tool execution. Raw decision: ${rawText.slice(0, 500)}`
          );
          return { answer: UNVERIFIED_FINAL_ANSWER_MESSAGE, steps, unverifiedFinalAnswerRejected: true };
        }
        return { answer: decision.answer, steps };
      }

      if (decision.action !== "call_tool") {
        throw new PlanningError(`unrecognized action "${decision.action}"`);
      }

      const tool = this.toolsByName.get(decision.tool);
      if (!tool) throw new UnknownToolError(decision.tool);

      let output;
      try {
        output = await tool.invoke(decision.input || {});
      } catch (err) {
        output = `Error: ${err.message}`;
      }
      steps.push({ tool: decision.tool, input: decision.input || {}, output });

      let effectiveOutput = output;
      if (this.promptInjectionGuard) {
        effectiveOutput = this.promptInjectionGuard.scan(String(output)).sanitizedText;
      }
      effectiveOutput = truncateToolResultForPrompt(String(effectiveOutput));

      messages.push(new AIMessage(rawText));
      messages.push(new HumanMessage(`Résultat de l'outil "${decision.tool}": ${effectiveOutput}`));
    }

    throw new ToolCallLimitExceededError(this.maxToolCalls);
  }
}

module.exports = {
  ToolCallingChain,
  parseDecision,
  buildSystemPrompt,
  UNVERIFIED_FINAL_ANSWER_MESSAGE,
  truncateToolResultForPrompt,
  MAX_TOOL_RESULT_CHARS,
};
