const cron = require("node-cron");
const dayjs = require("dayjs");
const { Op } = require("sequelize");

const { sendEmail } = require("../services/email.service");
const { sendWhatsappMessage } = require("../services/whatsapp.service");
const { combineDateTime } = require("../services/calendar.service");
const { clientName, resolveProjectName } = require("../services/followupAutomation.service");
const { emitToUser } = require("../socket");

const CommercialContactRelance = require("../models/CommercialContactRelance");
const CommercialContact = require("../models/CommercialContact");
const Notification = require("../models/Notification");
const User = require("../models/User");
const UserProfile = require("../models/UserProfile");
const ProjectAction = require("../models/ProjectAction");
const Project = require("../models/Project");
const { actionLabel } = require("../services/projectActionCalendar.service");
const { resolveOwnerInfo } = require("../services/projectActionCalendarSync.service");
// ⚠️ TEMPORAIRE — voir src/diagnostics/crashDiagnostics.js (mission crash cron).
const { setCronContext } = require("../diagnostics/crashDiagnostics");

console.log("🔥 FOLLOWUP CRON LOADED");

const FOLLOWUP_AUTOMATION_EMAIL = "info@probardistribution.com";

// =========================
// 🔥 MAIN FUNCTION
// =========================
const checkFollowup = async () => {
  const now = dayjs();
  const today = now.format("YYYY-MM-DD");

  console.log("🚀 CRON START (FOLLOW-UP)");
  setCronContext("FOLLOW-UP", "start"); // ⚠️ TEMPORAIRE — diagnostic crash
  console.log("📅 TODAY:", today);

  try {
    // =========================
    // 👥 1. GET ALL CONTACTS
    // =========================
    const contacts = await CommercialContact.findAll();
    console.log("👥 TOTAL CONTACTS:", contacts.length);

    // =========================
    // 📅 2. GET TODAY RELANCES
    // =========================
    const relances = await CommercialContactRelance.findAll({
      where: { dateRelance: today },
    });

    console.log("📊 RELANCES TODAY:", relances.length);

    // 🔥 OPTIMISATION (lookup rapide)
    const relanceMap = new Map();
    relances.forEach((r) => {
      relanceMap.set(r.commercialContactId, r);
    });

    // ── Déduplication FOLLOWUP_MISSING (correctif perf/coût) ────────────
    // Ce cron tourne CHAQUE MINUTE (voir le scheduler plus bas). Sans ce
    // garde-fou, un contact sans email ou sans relance planifiée déclenchait
    // une nouvelle Notification (ET un nouvel email réel si
    // AUTO_EMAIL_JOBS_ENABLED=true) à CHAQUE tick, indéfiniment, tant que la
    // situation n'était pas corrigée manuellement — confirmé en base réelle :
    // une seule condition non résolue a produit plus de 12 millions de
    // notifications FOLLOWUP_MISSING sur ~80 jours (table de 3 Go, requêtes
    // de liste de notifications passant de <10ms à >1,3s en scan séquentiel
    // faute d'index adapté — voir Performance_Report.md). Un seul rappel par
    // contact et par jour suffit ; se recalcule chaque jour via `today`.
    const alreadyNotifiedToday = new Set(
      (
        await Notification.findAll({
          where: { type: "FOLLOWUP_MISSING", createdAt: { [Op.gte]: `${today} 00:00:00` } },
          attributes: ["commercialContactId"],
          raw: true,
        })
      ).map((n) => n.commercialContactId)
    );

    // =========================
    // 🔁 LOOP CONTACTS
    // =========================
    for (let contact of contacts) {
      try {
        if (!contact.email) {
          if (alreadyNotifiedToday.has(contact.id)) {
            continue;
          }
          console.log(`⚠️ No email: ${contact.nom}`);

          await Notification.create({
            userId: contact.createdBy,
            type: "FOLLOWUP_MISSING",
            title: "Email manquant",
            message: `Le contact ${contact.nom} n'a pas d'email`,
            commercialContactId: contact.id,
            isRead: false,
          });
          alreadyNotifiedToday.add(contact.id);

          continue;
        }

        const relance = relanceMap.get(contact.id);

        // =========================
        // ✅ RELANCE AUJOURD’HUI
        // =========================
        if (relance) {
          if (relance.emailSent) {
            console.log(`⏭️ Already sent: ${contact.nom}`);
            continue;
          }

          console.log(`📅 Relance TODAY: ${contact.nom}`);

          // ⛔ Envoi d'email CLIENT désactivé (demande explicite : plus
          // aucun email de follow-up ne doit atteindre un client — voir
          // sendEmail(contact.email, ...) ci-dessus, supprimé). contact.email
          // est l'adresse du CLIENT lui-même — à ne jamais confondre avec les
          // emails ADMIN/internes (info@probardistribution.com, commercial,
          // responsable projet) envoyés par checkReminders()/
          // checkActionReminders() plus bas, INCHANGÉS. Le Follow-up reste
          // détecté et enregistré (relance.emailSent + Notification) — seule
          // la tentative SMTP disparaît, plus aucun appel sendEmail().
          console.log(`⏭️ Follow-up email skipped for client: ${contact.nom}`);

          relance.emailSent = true;
          await relance.save();

          await Notification.create({
            userId: relance.createdBy,
            type: "FOLLOWUP",
            title: "Relance détectée",
            message: `Follow-up du jour détecté pour ${contact.nom} ${contact.prenom} — email client non envoyé (désactivé)`,
            isRead: false,
          });
        }

        // =========================
        // ❌ PAS DE RELANCE
        // =========================
        else {
          if (alreadyNotifiedToday.has(contact.id)) {
            continue;
          }
          console.log(`⚠️ No follow-up: ${contact.nom}`);
          console.log(`⏭️ Follow-up email skipped for client: ${contact.nom}`);

          await Notification.create({
            userId: contact.createdBy,
            type: "FOLLOWUP_MISSING",
            title: "Relance manquante",
            message: `Aucune relance définie pour ${contact.nom}`,
            commercialContactId: contact.id,
            isRead: false,
          });
          alreadyNotifiedToday.add(contact.id);
        }
      } catch (err) {
        console.error("❌ LOOP ERROR:", err.message);
      }
    }

    console.log("✅ CRON END");
    setCronContext("FOLLOW-UP", "end"); // ⚠️ TEMPORAIRE — diagnostic crash
  } catch (err) {
    console.error("❌ CRON ERROR:", err);
  }
};

// =========================
// ⏰ RAPPELS 24H / 1H / 15MIN — info@probardistribution.com + commercial
// =========================
// Ne remplace pas checkFollowup() ci-dessus (email du jour même, conservé
// tel quel) — logique additionnelle, tourne dans le même tick (déjà chaque
// minute), sur tous les Follow-up "planifiee", quel que soit leur créateur.
const REMINDER_THRESHOLDS = [
  { key: "24h", minutes: 24 * 60, label: "24 heures" },
  { key: "1h", minutes: 60, label: "1 heure" },
  { key: "15m", minutes: 15, label: "15 minutes" },
];

function buildReminderMessage({ name, relance, projectName, label }) {
  return [
    "Bonjour,",
    "",
    `Rappel : Vous avez un Follow-up dans ${label}.`,
    "",
    `Client : ${name}`,
    `Date : ${relance.dateRelance || "-"}`,
    `Heure : ${relance.heureRelance || "-"}`,
    `Projet : ${projectName || "-"}`,
    `Commentaire : ${relance.commentaire || "-"}`,
    "",
    "Merci.",
  ].join("\n");
}

const checkReminders = async () => {
  console.log("⏰ CRON START (FOLLOWUP REMINDERS)");
  setCronContext("FOLLOWUP REMINDERS", "start"); // ⚠️ TEMPORAIRE — diagnostic crash

  try {
    const infoUser = await User.findOne({ where: { email: FOLLOWUP_AUTOMATION_EMAIL } });

    // On ne charge que les relances à venir (ou tout juste passées) pour
    // rester performant même avec plusieurs milliers de Follow-up.
    const relances = await CommercialContactRelance.findAll({
      where: {
        statutRelance: "planifiee",
        dateRelance: { [Op.gte]: dayjs().subtract(1, "day").format("YYYY-MM-DD") },
      },
    });

    console.log("📊 RELANCES À VÉRIFIER (rappels):", relances.length);

    for (const relance of relances) {
      try {
        if (!relance.heureRelance) continue;

        const target = combineDateTime(relance.dateRelance, relance.heureRelance);
        const diffMinutes = dayjs(target).diff(dayjs(), "minute");

        if (diffMinutes < 0) continue; // déjà passé

        // Fenêtre de tolérance de 2 minutes (bornes incluses) : dayjs().diff()
        // tronque vers le bas, donc "15 minutes avant" peut se lire 14 ou 15
        // selon l'instant exact du tick (cadence 1 min) — une fenêtre stricte
        // à une seule valeur loupe le seuil selon le timing. On élargit pour
        // ne jamais manquer un rappel, tout en restant précis à la minute.
        const threshold = REMINDER_THRESHOLDS.find(
          (t) => diffMinutes >= t.minutes - 1 && diffMinutes <= t.minutes
        );
        if (!threshold) continue;
        if (relance.lastReminderSent === threshold.key) continue; // déjà envoyé

        const contact = await CommercialContact.findByPk(relance.commercialContactId);
        if (!contact) continue;

        const name = clientName(contact);
        const projectName = await resolveProjectName(contact);
        const message = buildReminderMessage({ name, relance, projectName, label: threshold.label });

        // ── Email ────────────────────────────────────────────────────
        const emailRecipients = [...new Set([infoUser?.email, relance.commercialEmail].filter(Boolean))];
        for (const to of emailRecipients) {
          await sendEmail(to, `Rappel Follow-up — ${threshold.label}`, message);
        }

        // ── Notification CRM (cloche) + push temps réel ────────────────
        const recipientIds = [...new Set([infoUser?.id, relance.commercialId].filter(Boolean))];
        for (const userId of recipientIds) {
          await Notification.create({
            userId,
            type: "FOLLOWUP_REMINDER",
            title: `Follow-up dans ${threshold.label}`,
            message: `Le Follow-up avec ${name} commence dans ${threshold.label}.`,
            commercialContactId: contact.id,
            relanceId: relance.id,
            isRead: false,
          });
          try {
            emitToUser(userId, "followup-reminder", { relanceId: relance.id, threshold: threshold.key });
          } catch (err) {
            console.error("❌ emitToUser (reminder) error:", err.message);
          }
        }

        // ── WhatsApp (best-effort, scaffold) ────────────────────────────
        if (recipientIds.length) {
          const profiles = await UserProfile.findAll({ where: { userId: recipientIds } });
          const phones = [...new Set(profiles.map((p) => p.phone).filter(Boolean))];
          for (const phone of phones) {
            await sendWhatsappMessage(phone, message);
          }
        }

        await relance.update({ lastReminderSent: threshold.key });
        console.log(`✅ REMINDER SENT (${threshold.key}) — relance=${relance.id} — ${name}`);
      } catch (err) {
        console.error("❌ REMINDER LOOP ERROR:", err.message);
      }
    }

    console.log("✅ CRON END (REMINDERS)");
    setCronContext("FOLLOWUP REMINDERS", "end"); // ⚠️ TEMPORAIRE — diagnostic crash
  } catch (err) {
    console.error("❌ REMINDER CRON ERROR:", err);
  }
};

// =========================
// ⏰ RAPPELS 24H / 1H / 15MIN — actions Timeline (ProjectAction)
// =========================
// Même moteur que checkReminders() ci-dessus (REMINDER_THRESHOLDS, fenêtre de
// tolérance de 2 min), généralisé aux actions de projet. Notifie
// project.ownerId (le responsable du projet, PAS l'auteur de l'action —
// voir projectActionCalendarSync.service.js).
function buildActionReminderMessage({ action, project, label }) {
  return [
    "Bonjour,",
    "",
    `Votre relance CRM (${actionLabel(action)}) est prévue dans ${label}.`,
    "",
    `Projet : ${project.nomProjet || "-"}`,
    `Client : ${project.entreprise || "-"}`,
    `Heure : ${new Date(action.dateRelance).toLocaleString("fr-FR")}`,
    `Commentaire : ${action.commentaire || "-"}`,
    "",
    "Merci.",
  ].join("\n");
}

const checkActionReminders = async () => {
  console.log("⏰ CRON START (ACTION REMINDERS)");
  setCronContext("ACTION REMINDERS", "start"); // ⚠️ TEMPORAIRE — diagnostic crash

  try {
    // ── Visibilité (point 2) : follow-up dus aujourd'hui ou en retard,
    // statut "A faire" (= pending), avec un responsable joignable par email.
    // Purement informatif ici — l'envoi réel est géré par la boucle de
    // seuils 24h/1h/15min ci-dessous, pour ne jamais envoyer un email en
    // double pour le même follow-up.
    const dueToday = await ProjectAction.findAll({
      where: {
        statut: "A faire",
        dateRelance: { [Op.ne]: null, [Op.lte]: dayjs().endOf("day").toDate() },
      },
      include: [{ model: Project, as: "project", attributes: ["id", "nomProjet", "ownerId"] }],
    });
    console.log(`📋 Follow-ups trouvés (dus aujourd'hui ou en retard) : ${dueToday.length}`);
    for (const a of dueToday) {
      const proj = a.project;
      if (!proj?.ownerId) continue;
      const { ownerEmail, ownerName } = await resolveOwnerInfo(proj.ownerId);
      if (!ownerEmail) continue;
      console.log(
        `  • ID=${a.id} | Projet=${proj.nomProjet || "-"} | Commercial=${ownerName || ownerEmail} | Date=${dayjs(a.dateRelance).format("YYYY-MM-DD HH:mm")}`
      );
    }

    const actions = await ProjectAction.findAll({
      where: {
        dateRelance: { [Op.ne]: null, [Op.gte]: dayjs().subtract(1, "day").toDate() },
      },
    });

    console.log("📊 ACTIONS À VÉRIFIER (rappels):", actions.length);

    for (const action of actions) {
      try {
        const diffMinutes = dayjs(action.dateRelance).diff(dayjs(), "minute");
        if (diffMinutes < 0) continue; // déjà passé

        const threshold = REMINDER_THRESHOLDS.find(
          (t) => diffMinutes >= t.minutes - 1 && diffMinutes <= t.minutes
        );
        if (!threshold) continue;
        if (action.lastReminderSent === threshold.key) continue; // déjà envoyé

        const project = await Project.findByPk(action.projectId);
        if (!project || !project.ownerId) continue; // pas de responsable connu → skip propre

        const { ownerEmail } = await resolveOwnerInfo(project.ownerId);
        const message = buildActionReminderMessage({ action, project, label: threshold.label });

        // ── Email ────────────────────────────────────────────────────
        if (ownerEmail) {
          await sendEmail(ownerEmail, `Rappel — ${threshold.label}`, message);
        }

        // ── Notification CRM (cloche) + push temps réel ────────────────
        await Notification.create({
          userId: project.ownerId,
          type: "ACTION_REMINDER",
          title: `${actionLabel(action)} dans ${threshold.label}`,
          message: `${actionLabel(action)} — ${project.nomProjet || ""} commence dans ${threshold.label}.`,
          projectId: project.id,
          actionId: action.id,
          isRead: false,
        });
        try {
          emitToUser(project.ownerId, "action-reminder", { actionId: action.id, threshold: threshold.key });
        } catch (err) {
          console.error("❌ emitToUser (action reminder) error:", err.message);
        }

        // ── WhatsApp (best-effort) ──────────────────────────────────────
        const profile = await UserProfile.findOne({ where: { userId: project.ownerId } });
        if (profile?.phone) await sendWhatsappMessage(profile.phone, message);

        await action.update({ lastReminderSent: threshold.key });
        console.log(`✅ ACTION REMINDER SENT (${threshold.key}) — action=${action.id}`);
      } catch (err) {
        console.error("❌ ACTION REMINDER LOOP ERROR:", err.message);
      }
    }

    console.log("✅ CRON END (ACTION REMINDERS)");
    setCronContext("ACTION REMINDERS", "end"); // ⚠️ TEMPORAIRE — diagnostic crash
  } catch (err) {
    console.error("❌ ACTION REMINDER CRON ERROR:", err);
  }
};

// =========================
// ⏰ SCHEDULER
// =========================
const runFollowupChecks = async () => {
  await checkFollowup();
  await checkReminders();
  await checkActionReminders();
};

// ─── Kill switch for all automatic email cron jobs ────────────────────────────
// Default: DISABLED. Set AUTO_EMAIL_JOBS_ENABLED=true in .env to re-enable.
const AUTO_EMAIL_JOBS_ENABLED = process.env.AUTO_EMAIL_JOBS_ENABLED === "true";

if (AUTO_EMAIL_JOBS_ENABLED) {
  // 🔥 TEST (chaque minute) — couvre aussi l'exigence "rappels toutes les minutes"
  cron.schedule("*/1 * * * *", runFollowupChecks, {
    timezone: "Africa/Tunis",
  });

  // 🔥 PROD
  // cron.schedule("0 8 * * *", checkFollowup, {
  //   timezone: "Africa/Tunis",
  // });
} else {
  console.log("[followup.job] AUTO_EMAIL_JOBS_ENABLED=false — cron NOT scheduled.");
}

module.exports = { checkFollowup, checkReminders, checkActionReminders };