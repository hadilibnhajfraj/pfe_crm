"use strict";

const { STEP_STATUS } = require("./planStep");
const { WRITE_CONTRACTS, READ_CONTRACTS, InvalidToolResultError, parseToolOutput, extractReadRows } = require("./toolContracts");

/**
 * # PlanExecutor — exécuter les étapes d'un plan avec de vrais Tools (Phase 3)
 *
 * Les Tools reçus sont ceux de l'Agent : des adaptateurs MCP liés à
 * l'utilisateur authentifié. Chaque appel repasse donc par
 * `McpServer` → `PermissionManager` (RBAC) → validation Joi → service réel.
 * L'exécuteur ne décide JAMAIS d'une autorisation : il constate le refus du
 * serveur et le rapporte (`denied`).
 *
 * Garanties :
 * - délai par étape et délai global (`ExecutionContext`) ; une écriture non
 *   commencée avant l'échéance est `skipped`, jamais lancée en retard ;
 * - une écriture ne vise qu'une cible observée dans une lecture réelle ;
 * - un succès n'est rapporté que si le Tool renvoie l'enregistrement créé
 *   (`WRITE_CONTRACTS[tool].verify`) ;
 * - les écritures sont indépendantes : l'échec de l'une n'empêche pas les
 *   suivantes (échec partiel rapporté ligne par ligne).
 */

const PERMISSION_DENIED_CODE = -32002;

class StepTimeoutError extends Error {
  constructor(ms) {
    super(`délai de ${ms} ms dépassé`);
    this.name = "StepTimeoutError";
  }
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new StepTimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function classifyToolError(err) {
  if (err instanceof StepTimeoutError) return STEP_STATUS.TIMEOUT;
  if (err && (err.code === PERMISSION_DENIED_CODE || /is not allowed to call tool/i.test(err.message || ""))) return STEP_STATUS.DENIED;
  return STEP_STATUS.FAILED;
}

function publicError(status, err, { isWrite }) {
  if (status === STEP_STATUS.DENIED) return "permission refusée par le serveur (droits de votre rôle)";
  if (status === STEP_STATUS.TIMEOUT) {
    return isWrite
      ? `${err.message} — l'opération a pu aboutir côté serveur : vérifiez avant de la relancer`
      : err.message;
  }
  if (err instanceof InvalidToolResultError) return err.message;
  const message = String((err && err.message) || "erreur inconnue").slice(0, 200);
  return `échec du Tool : ${message}`;
}

class PlanExecutor {
  constructor({ tools = [], logger = null }) {
    this.toolByName = new Map(tools.map((t) => [t.name, t]));
    this.logger = logger;
  }

  _log(level, text) {
    if (this.logger && this.logger[level]) this.logger[level](text);
  }

  async _invoke(step, ctx) {
    const tool = this.toolByName.get(step.tool);
    if (!tool) throw Object.assign(new Error(`Tool "${step.tool}" indisponible`), { unavailable: true });
    const budget = ctx.stepBudgetMs();
    if (budget <= 0) throw new StepTimeoutError(0);
    const raw = await withTimeout(Promise.resolve().then(() => tool.invoke(step.input)), budget);
    return parseToolOutput(step.tool, raw);
  }

  /**
   * Lecture : renvoie les lignes validées et les enregistre comme
   * « observées » ; en cas d'échec, l'étape porte le statut réel et
   * `{ rows: null }` est renvoyé (aucune écriture ne sera préparée).
   */
  async runRead(step, ctx) {
    step.markRunning();
    try {
      const output = await this._invoke(step, ctx);
      const { rows, total } = extractReadRows(step.tool, output);
      ctx.observe(READ_CONTRACTS[step.tool].entityType, rows);
      step.markDone({ count: rows.length, total });
      ctx.recordToolStep({ tool: step.tool, input: step.input, output, status: step.status });
      this._log("info", `plan: lecture "${step.tool}" -> ${rows.length} ligne(s)`);
      return { rows, total };
    } catch (err) {
      const status = classifyToolError(err);
      step.markFailed(status, publicError(status, err, { isWrite: false }));
      ctx.recordToolStep({ tool: step.tool, input: step.input, output: null, status, error: step.error });
      this._log("warn", `plan: lecture "${step.tool}" -> ${status}`);
      return { rows: null, total: 0 };
    }
  }

  /** Écritures confirmées, une par une ; chaque étape porte son résultat réel. */
  async runWrites(steps, ctx) {
    for (const step of steps) {
      if (ctx.isExpired()) {
        step.markFailed(STEP_STATUS.SKIPPED, "non exécutée : délai global du plan dépassé");
        continue;
      }
      const contract = WRITE_CONTRACTS[step.tool];
      const targetId = contract && step.input ? step.input[contract.targetField] : null;
      if (!contract || !step.target || targetId !== step.target.id || !ctx.isObserved(contract.entityType, targetId)) {
        step.markFailed(STEP_STATUS.FAILED, "refusée : la cible ne provient d'aucune lecture réelle");
        this._log("warn", `plan: écriture "${step.tool}" refusée (cible non observée)`);
        continue;
      }

      step.markRunning();
      try {
        const output = await this._invoke(step, ctx);
        const verdict = contract.verify(output);
        if (verdict.ok) step.markDone(output, verdict.recordId);
        else step.markFailed(STEP_STATUS.FAILED, `non effectuée : ${verdict.reason}`);
        ctx.recordToolStep({ tool: step.tool, input: step.input, output, status: step.status, ...(step.error ? { error: step.error } : {}) });
      } catch (err) {
        const status = classifyToolError(err);
        step.markFailed(status, publicError(status, err, { isWrite: true }));
        ctx.recordToolStep({ tool: step.tool, input: step.input, output: null, status, error: step.error });
      }
      this._log("info", `plan: écriture "${step.tool}" -> ${step.status}`);
    }
    return steps;
  }
}

module.exports = { PlanExecutor, StepTimeoutError, withTimeout, classifyToolError, PERMISSION_DENIED_CODE };
