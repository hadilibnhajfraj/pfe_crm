const { sequelize } = require("../../../db");
const projectRepo = require("../repositories/project.repository");
const stageRepo = require("../../pipeline/repositories/pipelineStage.repository");
const actionTypeRepo = require("../../project-actions/repositories/projectActionType.repository");
const actionRepo = require("../../project-actions/repositories/projectAction.repository");
const { logActivity } = require("../../project-activities/services/projectActivity.service");
const { toProjectCard, invalidateStageCache } = require("../../kanban/services/kanban.service");
const User = require("../../../models/User");
const projectActionCalendarSync = require("../../../services/projectActionCalendarSync.service");

const SORTABLE = ["createdAt", "nomProjet", "montantMarche", "pourcentageReussite", "updatedAt"];

// AI-Business-Copilot/15_AGENT_RUNTIME_AUDIT.md — `listProjects()` était
// appelée avec un `query` de deux formes bien réelles selon l'appelant :
// des query-params Express (`req.query`, TOUJOURS des chaînes — voir
// project.controller.js/kanban.controller.js) OU l'input JSON déjà validé
// par Joi du Tool MCP `list_projects` (voir
// mcp/tools/projects/listProjectsTool.js), où `mine`/`isArchived` sont
// déclarés `Joi.boolean()` et arrivent donc comme de VRAIS booléens
// JavaScript. `=== "true"` seul ne reconnaissait QUE la première forme —
// un appel MCP réel avec `{mine: true}` (exactement ce qu'un modèle de
// langage produit pour un champ booléen JSON) était SILENCIEUSEMENT ignoré
// (`mine` retombait à `false`), donc "Montre-moi mes projets"/toute
// question scopée à l'utilisateur listait TOUS les projets visibles
// (185/253 observés pendant ce diagnostic) au lieu des siens. Corrigé une
// seule fois, ici, pour les DEUX formes — jamais dans le Tool ni dans les
// contrôleurs, qui restent inchangés.
function isTruthyFlag(value) {
  return value === true || value === "true";
}

// ── List ──────────────────────────────────────────────────

async function listProjects(query, userId) {
  const limit = Math.min(parseInt(query.limit) || 20, 100);
  const page = Math.max(parseInt(query.page) || 1, 1);
  const offset = (page - 1) * limit;
  const sortBy = SORTABLE.includes(query.sortBy) ? query.sortBy : "createdAt";
  const sortDir = query.sortDir === "ASC" ? "ASC" : "DESC";

  const mine = isTruthyFlag(query.mine) || isTruthyFlag(query.myProjects);
  // Accept both ?ownerId=... and ?userId=... from any client
  const ownerId = query.ownerId || query.userId || null;

  console.log("=== USER FILTER ===");
  console.log("query.userId =", query.userId, "| query.ownerId =", query.ownerId, "| resolved ownerId =", ownerId);
  console.log("[listProjects] authUserId =", userId, "| mine =", mine);

  const filters = {
    mine,
    userId,
    stageId: query.stageId || null,
    statut: query.statut || null,
    projectModele: query.projectModele || null,
    productFamily: query.productFamily || null,
    diameterMm: query.diameterMm ? Number(query.diameterMm) : null,
    search: query.search || null,
    isArchived: isTruthyFlag(query.isArchived),
    ownerId,
    dateFrom: query.dateFrom || null,
    dateTo: query.dateTo || null,
  };

  const [{ count, rows }, stats] = await Promise.all([
    projectRepo.findPaginated(filters, { limit, offset, sortBy, sortDir }),
    projectRepo.countStats(filters),
  ]);

  console.log("PROJECT COUNT AFTER FILTER");
  console.log("page count =", count, "| total =", stats.total, "| active =", stats.active, "| archived =", stats.archived);

  return {
    data: rows.map((r) => toProjectCard(r)),
    total: count,
    stats: {
      total: stats.total,
      active: stats.active,
      archived: stats.archived,
    },
    page,
    pages: Math.ceil(count / limit),
    limit,
  };
}

// ── Move Stage (Drag & Drop) ──────────────────────────────

async function moveStage(projectId, newStageId, userId) {
  const t = await sequelize.transaction();
  try {
    // Load current project (with stage for old-stage name)
    const project = await projectRepo.findById(projectId);
    if (!project) throw { status: 404, message: "Project not found" };

    const newStage = await stageRepo.findById(newStageId);
    if (!newStage) throw { status: 404, message: "Pipeline stage not found" };

    const oldStageId = project.pipelineStageId;
    const oldStageName = project.stage?.name || null;

    // ── 1. Update stage ────────────────────────────────────
    await projectRepo.update(projectId, { pipelineStageId: newStageId }, t);

    // ── 2. Log activity ────────────────────────────────────
    await logActivity(
      {
        projectId,
        userId,
        type: "stage_change",
        message: `Stage changé : "${oldStageName || "—"}" → "${newStage.name}"`,
        metadata: {
          fromStageId: oldStageId,
          fromStageName: oldStageName,
          toStageId: newStageId,
          toStageName: newStage.name,
          isWon: newStage.isWonStage,
          isLost: newStage.isLostStage,
        },
      },
      t
    );

    // ── 3. Auto-create action if stage requires it ─────────
    let autoAction = null;
    if (newStage.autoCreateAction) {
      const actionTypes = await actionTypeRepo.findByStageId(newStageId);
      if (actionTypes.length > 0) {
        autoAction = await actionRepo.create(
          {
            projectId,
            actionTypeId: actionTypes[0].id,
            commentaire: `Action automatique — ${newStage.name}`,
            dateAction: new Date(),
            statut: "A faire",
            createdBy: userId,
          },
          t
        );
      }
    }

    await t.commit();

    // La fiche kanban._stageCache (60s TTL) contenait le compte de projets
    // par étape — ce chemin "move-stage complet" changeait aussi
    // pipelineStageId sans jamais l'invalider, contrairement à
    // moveStageFast() (audit performance : les compteurs pouvaient rester
    // faux jusqu'à 60s après un changement d'étape via ce endpoint).
    invalidateStageCache();

    // ── 4. Return fresh project card with all updated data ─
    const updated = await projectRepo.findById(projectId);
    return {
      project: toProjectCard(updated),
      autoActionCreated: autoAction !== null,
      newStage: {
        id: newStage.id,
        name: newStage.name,
        color: newStage.color,
        isWonStage: newStage.isWonStage,
        isLostStage: newStage.isLostStage,
      },
    };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// ── Assign Owner ──────────────────────────────────────────

async function assignOwner(projectId, ownerId, userId) {
  const t = await sequelize.transaction();
  try {
    const project = await projectRepo.findById(projectId);
    if (!project) throw { status: 404, message: "Project not found" };

    if (ownerId) {
      const owner = await User.findByPk(ownerId, { attributes: ["id"] });
      if (!owner) throw { status: 404, message: "User not found" };
    }

    const previousOwnerId = project.ownerId;
    await projectRepo.update(projectId, { ownerId: ownerId || null }, t);

    await logActivity(
      {
        projectId,
        userId,
        type: "edit",
        message: ownerId ? "Owner assigné" : "Owner retiré",
        metadata: { previousOwnerId, newOwnerId: ownerId || null },
      },
      t
    );

    await t.commit();

    const updated = await projectRepo.findById(projectId);

    // ── Calendrier CRM + Google Calendar (best-effort, jamais bloquant) ────
    // Déplace les événements des actions déjà synchronisées vers le nouveau
    // responsable (point 9) — ne doit jamais faire échouer la réassignation.
    try {
      await projectActionCalendarSync.onProjectOwnerChanged(updated, previousOwnerId, userId);
    } catch (err) {
      console.error("CALENDAR_SYNC_OWNER_CHANGE_ERROR:", err.message);
    }

    return toProjectCard(updated);
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

module.exports = { listProjects, moveStage, assignOwner };
