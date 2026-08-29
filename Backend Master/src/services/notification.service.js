"use strict";

// AI-Business-Copilot/36_NOTIFICATION_TOOLS_BROKEN_IMPORT.md — `Notification`
// et `ProjectMember` n'ont jamais été exportés par le barrel `../models`
// (voir src/models/index.js : seuls Project/Company/Engineer/Architect/User/
// UserProject/PipelineStage/ProjectActionType/ProjectActivity le sont) —
// destructurés d'ici, ils valaient donc `undefined`, faisant planter
// (`Cannot read properties of undefined`) les 5 Tools Copilot notifications
// et `notifyProjectComment()` avant toute requête DB. Corrigé en réutilisant
// le chemin déjà fonctionnel de l'ancienne route REST
// (`routes/notifications.routes.js` : `require("../models/Notification")`)
// — `Project`/`User`, eux, sont bien exportés par le barrel, donc inchangés.
const { Project, User } = require("../models");
const Notification = require("../models/Notification");
const ProjectMember = require("../models/ProjectMember");
// La route legacy notifications.routes.js appelle `emailService.send(...)`
// (services/emailService.js), qui n'exporte que `sendRelanceEmail` — cet
// appel lève donc déjà une TypeError dans le code existant (bug préexistant,
// non lié à cette extraction). On utilise ici services/email.service.js
// (`sendEmail`), le service réellement fonctionnel déjà utilisé ailleurs
// (ex. hr-requests) — reproduire fidèlement un appel cassé n'aurait aucune
// valeur pour un Tool censé fonctionner.
const { sendEmail } = require("./email.service");

async function notifyProjectComment({ projectId, commentId, authorId, body }) {
  // 1) récupérer projet + owner
  const project = await Project.findByPk(projectId);
  if (!project) return;

  // 2) Destinataires = owner + members (sans auteur)
  const recipients = new Set();

  if (project.ownerId) recipients.add(project.ownerId);

  // si tu as ProjectMember
  const members = await ProjectMember.findAll({
    where: { projectId },
    attributes: ["userId"],
  });

  for (const m of members) recipients.add(m.userId);

  recipients.delete(authorId);

  if (recipients.size === 0) return;

  // 3) récupérer auteur (pour afficher son nom/email)
  const author = await User.findByPk(authorId);
  const authorLabel = author?.email ?? "Quelqu’un";

  const title = "Nouveau commentaire";
  const message = `${authorLabel} a commenté sur le projet`;

  const payload = Array.from(recipients).map((userId) => ({
    userId,
    type: "PROJECT_COMMENT",
    title,
    message,
    projectId,
    commentId,
    isRead: false,
  }));

  await Notification.bulkCreate(payload);
}

// ── Extraction fidèle depuis routes/notifications.routes.js (aucune règle
// métier nouvelle) — voir AI-Business-Copilot/00_PLAN_DEVELOPPEMENT.md.
// Les routes HTTP existantes ne sont pas modifiées, ce fichier est un ajout.

// GET / — notifications paginées de l'utilisateur + compteur non-lues.
async function listMyNotifications(userId, { page = 1, limit = 10 } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Number(limit) || 10);
  const offset = (safePage - 1) * safeLimit;

  const { count, rows } = await Notification.findAndCountAll({
    where: { userId },
    order: [["createdAt", "DESC"]],
    limit: safeLimit,
    offset,
  });
  const unreadCount = await Notification.count({ where: { userId, isRead: false } });

  return { items: rows, unreadCount, total: count, page: safePage, totalPages: Math.ceil(count / safeLimit) };
}

// PUT /read-all
async function markAllRead(userId) {
  await Notification.update({ isRead: true }, { where: { userId, isRead: false } });
  return { success: true };
}

// PUT /:id/read
async function markOneRead(userId, notificationId) {
  const notification = await Notification.findOne({ where: { id: notificationId, userId } });
  if (!notification) throw { status: 404, message: "Notification not found" };
  notification.isRead = true;
  await notification.save();
  return { success: true };
}

// DELETE /:id
async function deleteNotification(userId, notificationId) {
  const deleted = await Notification.destroy({ where: { id: notificationId, userId } });
  if (!deleted) throw { status: 404, message: "Notification not found" };
  return { success: true };
}

// POST /send-email — dans la route legacy, cet endpoint n'exige AUCUNE
// authentification (P0 identifié dans le dossier d'architecture). Le Tool
// qui appelle cette fonction, lui, exige un actingUser admin-tier (voir
// mcp/tools/notifications/sendNotificationEmailTool.js) — plus restrictif
// que la route existante, délibérément, pas un oubli.
async function sendEmailNotification({ toUserId, emailTo, fromName, subject, message, type = "CONTACT_CREATED" }) {
  await sendEmail(emailTo, subject, message);

  const notification = await Notification.create({
    userId: toUserId,
    type,
    title: subject || "Nouvel email reçu",
    message: `${fromName ? fromName + " : " : ""}${message}`,
    isRead: false,
  });

  return { success: true, notification };
}

module.exports = {
  notifyProjectComment,
  listMyNotifications,
  markAllRead,
  markOneRead,
  deleteNotification,
  sendEmailNotification,
};
