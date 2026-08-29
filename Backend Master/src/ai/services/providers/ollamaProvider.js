"use strict";

const axios = require("axios");
const { ILlmProvider } = require("../llmProvider.interface");
const { AiError } = require("../../utils/errors");
const { withNamespace } = require("../../utils/logger");
const { classifyProviderHttpError, describeProviderHttpError } = require("./errors");
const { withControlledRetry } = require("./retry");

const logger = withNamespace("llm:ollama");

const DEFAULT_BASE_URL = "http://localhost:11434";
// AI-Business-Copilot/24_OLLAMA_TIMEOUT_DIAGNOSIS.md — mission "DIAGNOSTIQUER
// ET CORRIGER LE TIMEOUT OLLAMA DU COPILOT IA" : reproduit EN DIRECT contre
// ce serveur Ollama (vrai `por_promesh_agent`, vraie base, vrai Tool
// `list_por_promesh`) qu'un tour de conversation parfaitement légitime — 2
// appels LLM au total (aucune boucle, `requireToolUse` intact, RAG non
// impliqué pour cet Agent) — a pris 179 681ms pour son 2e appel (décision
// `final_answer`, prompt=2762 tokens/completion=227 tokens) : à 319ms du
// plafond de 180 000ms. Un appel équivalent (même Agent, même taille de
// prompt, ~1 minute plus tard, une fois la contention passée) a pris
// 9 084ms — un facteur ~20x sur EXACTEMENT le même travail. `ollama ps`
// confirme `size_vram: 0` : ce modèle tourne entièrement sur CPU, jamais
// GPU, sur une machine où le même processus Node héberge aussi le serveur
// Express (pool DB, tâche cron toutes les minutes — voir
// src/cron/followup.job.js — vérification SMTP au démarrage) : c'est cette
// contention CPU partagée, pas une boucle ni un prompt excessif à elle
// seule, qui fait varier le débit de préremplissage/génération d'Ollama
// dans des proportions aussi extrêmes. Rien dans ce mécanisme n'est
// éliminable côté code applicatif (pas de GPU à ajouter, pas de contrôle
// sur l'ordonnancement CPU de l'OS depuis ce kernel) — 240 000ms (4 min)
// restaure une VRAIE marge de sécurité au-dessus du pire cas légitime
// réellement mesuré (179 681ms), sans être un plafond arbitraire ni masquer
// une boucle (voir ToolCallingChain.maxToolCalls pour la garde anti-boucle
// réelle, indépendante de ce timeout). Complète — ne remplace pas — les
// réductions apportées par ailleurs (voir DEFAULT_NUM_PREDICT/DEFAULT_NUM_CTX
// ci-dessous, et porPromeshAgent.js RÈGLE 1, qui absorbe l'ex-RÈGLE 10
// redondante) : ce timeout reste le dernier recours de la mission, appliqué
// APRÈS audit complet, jamais en remplacement d'un vrai correctif. Ancienne
// valeur : 180 000ms (calibrée en 2026-08 contre un pire cas alors observé
// de 87 300ms — depuis dépassé, voir ci-dessus). Ollama-specific only —
// never touches OpenAI's/Anthropic's own DEFAULT_TIMEOUT_MS (30 000ms,
// unrelated hardware/latency profile).
const DEFAULT_TIMEOUT_MS = 240000;
// See the constructor's own comment on `think` for the measured rationale.
const DEFAULT_THINK = false;
// A safety CEILING against pathological/looping generation, never a normal
// truncation point. AI-Business-Copilot/24_OLLAMA_TIMEOUT_DIAGNOSIS.md :
// tous les completions RÉELLES mesurées pour por_promesh_agent lors du
// diagnostic restent largement en dessous (14, 18, 227 tokens) — 768
// conserve >3x de marge sur le pire cas réellement observé (227) tout en
// réduisant d'un quart (vs. l'ancien 1024) l'exposition au pire cas d'une
// génération qui ne s'arrêterait pas naturellement (qwen3:8b's Modelfile
// sets `repeat_penalty: 1`, i.e. no extra penalty against repetition — un
// mécanisme plausible de génération qui déborde, déjà documenté). Ollama's
// own field name is `num_predict`.
const DEFAULT_NUM_PREDICT = 768;
// AI-Business-Copilot/24_OLLAMA_TIMEOUT_DIAGNOSIS.md — `GET /api/ps` a
// révélé, en direct, que ce modèle tournait avec `context_length: 4096`
// (la valeur par défaut SILENCIEUSE d'Ollama quand aucun `num_ctx` n'est
// envoyé — jamais le cas avant ce correctif, voir modelOptions ci-dessous),
// alors qu'un tour por_promesh_agent réel (2e appel, après injection du
// résultat Tool tronqué à MAX_TOOL_RESULT_CHARS=4000, voir
// toolCallingChain.js) mesure déjà ~2762-3839 tokens de prompt à lui seul —
// laissant une marge quasi nulle avant que `num_predict` (voir ci-dessus)
// ne pousse le total au-delà de 4096, ce qui forcerait Ollama à décaler/
// recalculer une partie du contexte ("context shift", documenté comme
// nettement plus lent) en pleine génération. 8192 reste très en dessous de
// la fenêtre réelle du modèle (`qwen3.context_length: 40960`, voir
// `/api/show`) — un KV-cache plus grand ne coûte du calcul QUE si la
// séquence l'utilise réellement, donc aucun coût pour les Agents à prompt
// plus court (meeting_agent, ~2900 caractères de SYSTEM_PROMPT).
const DEFAULT_NUM_CTX = 8192;

/**
 * Real ILlmProvider adapter for a LOCAL Ollama server
 * (https://github.com/ollama/ollama), used to run the Copilot without any
 * paid API — same contract boundary, same shared error classification/retry
 * policy as `openAiProvider.js`/`anthropicProvider.js` (see those files'
 * header comments). No SDK dependency added: Ollama's REST API is plain
 * JSON over HTTP, exactly like the other two adapters already use via
 * axios — no new package needed.
 *
 * Uses Ollama's native `/api/chat` endpoint (not the OpenAI-compatibility
 * shim Ollama also exposes at `/v1/chat/completions`): the native endpoint
 * already accepts `{role, content}[]` messages including `role: "system"`
 * INSIDE `messages` (same shape OpenAI uses — no translation needed, unlike
 * Anthropic's separate top-level `system` field), and its response/error
 * shapes are documented and stable. `stream: false` is always sent — this
 * kernel's `ILlmProvider.complete()` contract is a single resolved string
 * (see llmProviderChatModel.js), and no adapter in this codebase implements
 * `ILlmProvider.stream()` yet, so streaming here would be unused dead code.
 *
 * No API key: Ollama is a local, unauthenticated server by design — this is
 * the ONLY adapter in `providers/` that never sends an Authorization/
 * x-api-key header, and `createLlmProvider()` (`providers/index.js`) knows
 * not to require one for this provider name.
 */
class OllamaProvider extends ILlmProvider {
  // `think` (AI-Business-Copilot/22_OLLAMA_PERFORMANCE.md): explicitly
  // false by default. This kernel's protocol (ToolCallingChain/QaChain,
  // see their own headers) expects a single short, strictly-formatted
  // JSON/text reply — chain-of-thought reasoning tokens are never read by
  // anything downstream, so `think: true` only adds latency here, never
  // value. Left as a constructor override (not hardcoded) in case a future
  // caller genuinely needs it.
  constructor({ baseUrl = DEFAULT_BASE_URL, model, timeoutMs = DEFAULT_TIMEOUT_MS, think = DEFAULT_THINK, numPredict = DEFAULT_NUM_PREDICT, numCtx = DEFAULT_NUM_CTX, retry } = {}) {
    super();
    if (!model) throw new AiError("OllamaProvider requires a model");
    this.baseUrl = baseUrl;
    this.model = model;
    this.think = think;
    this.numPredict = numPredict;
    this.numCtx = numCtx;
    this.timeoutMs = timeoutMs;
    this._retryOptions = retry;
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: timeoutMs,
      headers: { "Content-Type": "application/json" },
    });
  }

  async complete(messages, options = {}) {
    return withControlledRetry(() => this._completeOnce(messages, options), this._retryOptions);
  }

  async _completeOnce(messages, options) {
    // Ollama's own request-level knobs (temperature/stop/...) live under a
    // single nested `options` object — distinct from this method's own
    // `options` parameter (the ILlmProvider `{stop, temperature}` contract).
    const modelOptions = {};
    if (options.stop) modelOptions.stop = Array.isArray(options.stop) ? options.stop : [options.stop];
    if (options.temperature !== undefined) modelOptions.temperature = options.temperature;
    // Safety ceiling, not a normal truncation point — see DEFAULT_NUM_PREDICT.
    if (this.numPredict != null) modelOptions.num_predict = this.numPredict;
    // AI-Business-Copilot/24_OLLAMA_TIMEOUT_DIAGNOSIS.md — see DEFAULT_NUM_CTX
    // above: sent explicitly on every call so Ollama's own silent default
    // (measured live at 4096 via `GET /api/ps`) never applies here.
    if (this.numCtx != null) modelOptions.num_ctx = this.numCtx;

    const requestStartedAt = Date.now();
    try {
      const response = await this.http.post("/api/chat", {
        model: this.model,
        messages,
        stream: false,
        // Top-level, per Ollama's /api/chat contract — NOT nested under
        // `options` (that object holds sampling knobs like
        // temperature/stop; `think` is a separate top-level field).
        think: this.think,
        ...(Object.keys(modelOptions).length ? { options: modelOptions } : {}),
      });
      const text = response.data && response.data.message && response.data.message.content;
      if (typeof text !== "string") {
        throw new AiError("Ollama returned an unexpected response shape");
      }
      // AI-Business-Copilot/24_OLLAMA_TIMEOUT_DIAGNOSIS.md — avant ce
      // correctif, cette ligne ne portait QUE le compte de tokens : le
      // diagnostic du timeout a dû être refait via des scripts manuels
      // instrumentés faute de pouvoir distinguer, depuis les logs
      // existants, un chargement à froid (`load_duration`) d'un
      // préremplissage lent (`prompt_eval_duration`) d'une génération lente
      // (`eval_duration`) — les trois champs natifs d'Ollama (nanosecondes,
      // convertis ici en ms), plus la durée totale mesurée côté client
      // (englobe aussi le réseau/la file d'attente serveur, jamais fournie
      // par Ollama), pour que le PROCHAIN diagnostic n'ait plus besoin de
      // scripts ad hoc. Jamais le contenu des tokens/messages — uniquement
      // des compteurs/durées, même discipline de non-secret que la ligne
      // existante.
      const wallMs = Date.now() - requestStartedAt;
      const promptTokens = response.data && response.data.prompt_eval_count;
      const completionTokens = response.data && response.data.eval_count;
      const loadMs = response.data && response.data.load_duration != null ? Math.round(response.data.load_duration / 1e6) : undefined;
      const promptEvalMs = response.data && response.data.prompt_eval_duration != null ? Math.round(response.data.prompt_eval_duration / 1e6) : undefined;
      const evalMs = response.data && response.data.eval_duration != null ? Math.round(response.data.eval_duration / 1e6) : undefined;
      if (promptTokens !== undefined || completionTokens !== undefined) {
        logger.info(
          `token usage: prompt=${promptTokens ?? "n/a"} completion=${completionTokens ?? "n/a"} — wall_ms=${wallMs} load_ms=${loadMs ?? "n/a"} prompt_eval_ms=${promptEvalMs ?? "n/a"} eval_ms=${evalMs ?? "n/a"}`
        );
      }
      return text;
    } catch (err) {
      if (err instanceof AiError) throw err;
      logger.error(`chat request failed — ${describeProviderHttpError(err)}`);
      throw classifyProviderHttpError(err, "Ollama");
    }
  }

  /**
   * NOT part of ILlmProvider — an extra, Ollama-specific diagnostic used
   * only by manual/ops verification (never called from the request path:
   * AIManager/Agents/LangChain only ever call `complete()`). Answers
   * exactly the two questions a local model needs at setup time: is the
   * server reachable, and is the configured model actually pulled.
   */
  async checkHealth() {
    try {
      const response = await this.http.get("/api/tags");
      const models = (response.data && response.data.models) || [];
      const modelNames = models.map((m) => m.name);
      return {
        available: true,
        modelAvailable: modelNames.includes(this.model),
        models: modelNames,
      };
    } catch (err) {
      return { available: false, modelAvailable: false, models: [], error: describeProviderHttpError(err) };
    }
  }
}

module.exports = { OllamaProvider, DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS, DEFAULT_THINK, DEFAULT_NUM_PREDICT, DEFAULT_NUM_CTX };
