"use strict";

/**
 * # PlanStep — une étape d'un plan multi-étapes (Phase 3)
 *
 * - `read`    : appel d'un Tool de lecture, exécuté immédiatement.
 * - `analyze` : filtrage DÉTERMINISTE des lignes lues (aucun modèle de
 *               langage, aucune donnée ajoutée).
 * - `write`   : appel d'un Tool d'écriture, UNIQUEMENT après confirmation ;
 *               sa cible (`target`) provient toujours d'une ligne lue.
 *
 * `status` suit le cycle réel : planned → running → done | failed | denied |
 * timeout | skipped | cancelled. `output` n'est rempli que par le résultat
 * réel du Tool, jamais par une estimation.
 */

const STEP_KINDS = Object.freeze({ READ: "read", ANALYZE: "analyze", WRITE: "write" });

const STEP_STATUS = Object.freeze({
  PLANNED: "planned",
  RUNNING: "running",
  DONE: "done",
  FAILED: "failed",
  DENIED: "denied",
  TIMEOUT: "timeout",
  SKIPPED: "skipped",
  CANCELLED: "cancelled",
});

class PlanStep {
  constructor({ id, kind, description, tool = null, input = null, target = null }) {
    if (!Object.values(STEP_KINDS).includes(kind)) throw new Error(`PlanStep: kind inconnu "${kind}"`);
    if (kind !== STEP_KINDS.ANALYZE && !tool) throw new Error(`PlanStep: un Tool est requis pour une étape "${kind}"`);
    this.id = id;
    this.kind = kind;
    this.description = description;
    this.tool = tool;
    this.input = input;
    // { entityType, id, label } — pour une écriture : l'enregistrement visé.
    this.target = target;
    this.status = STEP_STATUS.PLANNED;
    this.output = null;
    this.error = null;
    this.recordId = null;
  }

  get isWrite() {
    return this.kind === STEP_KINDS.WRITE;
  }

  markRunning() {
    this.status = STEP_STATUS.RUNNING;
  }

  markDone(output, recordId = null) {
    this.status = STEP_STATUS.DONE;
    this.output = output;
    this.recordId = recordId;
  }

  markFailed(status, error) {
    this.status = status;
    this.error = error;
  }

  /** Forme stockée dans le PendingActionStore et exposée au client. */
  toJSON() {
    return {
      id: this.id,
      kind: this.kind,
      description: this.description,
      tool: this.tool,
      input: this.input,
      target: this.target,
      status: this.status,
      ...(this.recordId ? { recordId: this.recordId } : {}),
      ...(this.error ? { error: this.error } : {}),
    };
  }

  static fromJSON(json) {
    const step = new PlanStep(json);
    step.status = STEP_STATUS.PLANNED;
    return step;
  }
}

module.exports = { PlanStep, STEP_KINDS, STEP_STATUS };
