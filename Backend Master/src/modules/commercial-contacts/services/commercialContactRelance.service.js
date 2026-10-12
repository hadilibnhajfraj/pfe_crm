"use strict";

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "CORRIGER
// LES ACTIONS COMMERCIALES DEPUIS LA LISTE DES CONTACTS". Extraction
// fidèle de la logique déjà réelle de `POST /:id/relances`
// (routes/commercial_contacts.routes.js) — RBAC, validations et résolution
// du commercial IDENTIQUES à la route, jamais une deuxième définition :
// seule la couche transport change (Tool MCP au lieu d'un handler Express).
//
// SQL brut via `sequelize.query()` (jamais un `require()` direct d'un
// modèle Sequelize) — même convention que
// `commercialContactKpi.service.js` dans ce même fichier/module : un Tool
// de ce module doit rester mockable en remplaçant seulement CE service
// (voir test/ai.mcp.tools.commercialContacts.test.js, qui ne configure
// aucune variable d'environnement DB) — `require("../../../models/User")`
// chargerait `src/db.js` au moment du `require()` du Tool lui-même, avant
// même qu'un test ne puisse le mocker.
//
// AI-Business-Copilot/35_..._MD — mission "SYNCHRONISER LES RELANCES
// COMMERCIALES DU COPILOT AVEC LE CRM ET LE CALENDRIER" : après une
// création réussie, synchronise le calendrier CRM (`Task`) et Google
// Calendar en RÉUTILISANT tel quel `multiRecipientCalendarSync.service.js`
// (le même mécanisme déjà utilisé par `followupAutomation.service.js` pour
// CommercialContactRelance, et par `meetingCopilotSync.service.js` pour les
// réunions créées depuis le Copilot) — jamais une deuxième implémentation.
// Décision explicite du donneur d'ordre : CRM + Google Calendar UNIQUEMENT,
// jamais `runFollowupAutomation()` (qui déclenche AUSSI notifications CRM/
// email/WhatsApp, hors périmètre de cette mission).
const crypto = require("crypto");
const { sequelize } = require("../../../db");
const { isCommercialEligibleRole } = require("../../../constants/commercialRoles");
const { canAccessContact, LEVELS } = require("../policies/contactAccess.policy");
const { resolveFullName } = require("../../../utils/userDisplay");
const { resolveRecipients, syncTaskForRecipients, syncEventForRecipients } = require("../../../services/multiRecipientCalendarSync.service");
const { combineDateTime } = require("../../../services/calendar.service");

const ENTITY_TYPE = "commercial_contact_relance";

// Même triplet ADMIN_TIER_ROLES répété par convention ailleurs dans ce
// noyau (voir getMyCommercialContactsTool.js, getPersonalKpiSummaryTool.js).
const ADMIN_TIER_ROLES = new Set(["admin", "superadmin", "superadmin2"]);

// Identique à `_resolveCommercial()` de la route : ne fait JAMAIS confiance
// à un nom/email envoyé par l'appelant — résout toujours depuis un id réel,
// vérifié contre la table users et éligible (voir isCommercialEligibleRole).
async function _resolveCommercial(commercialId) {
  if (!commercialId) return null;
  const [row] = await sequelize.query(
    `SELECT u.id, u.email, u.role, u."isActive", up.name, up.nom, up.prenom
       FROM users u
       LEFT JOIN user_profiles up ON up."userId" = u.id
      WHERE u.id = :commercialId`,
    { replacements: { commercialId }, type: sequelize.QueryTypes.SELECT }
  );
  // Commercial actif uniquement (un compte désactivé n'est jamais désigné).
  if (!row || !row.isActive || !isCommercialEligibleRole(row.role)) return null;
  return {
    id: row.id,
    email: row.email || null,
    name: resolveFullName({ email: row.email, profile: { name: row.name, nom: row.nom, prenom: row.prenom } }),
  };
}

// Synchronise le calendrier CRM (Task) + Google Calendar pour CETTE
// relance — best-effort, jamais levée : un échec ici ne doit JAMAIS remettre
// en cause la relance déjà écrite en base (voir l'appelant, qui entoure cet
// appel d'un try/catch supplémentaire par prudence). `recipients` vient
// TOUJOURS de `resolveRecipients({selectedUserId: relance.commercialId})` —
// le commercial DÉJÀ résolu/validé par `_resolveCommercial()` ci-dessus,
// jamais un id lu ailleurs. `entityId: relance.id` est la clé d'idempotence
// (voir `upsertSync`/`findOrCreate` dans multiRecipientCalendarSync.service.js
// — un second appel avec le MÊME id met à jour l'existant, ne duplique
// jamais) : rappeler cette fonction pour la même relance est donc sûr.
async function _syncCalendars(relance, contact) {
  const recipients = await resolveRecipients({ selectedUserId: relance.commercialId });
  if (!recipients.length) {
    return { crmSynced: false, googleSynced: false, googleError: null, taskId: null };
  }

  const clientName = `${contact.prenom || ""} ${contact.nom || ""}`.trim() || "Client";
  const title = `Relance commerciale — ${clientName}`;
  const description = "Relance commerciale programmée par le Copilot";

  // Réutilise EXACTEMENT combineDateTime()/la règle "09:00 par défaut, 30
  // minutes de durée" déjà en place dans followupAutomation.service.js —
  // jamais une nouvelle constante inventée pour ce chemin.
  // `combineDateTime()` (calendar.service.js, RÉUTILISÉE telle quelle —
  // jamais modifiée) attend une date `"YYYY-MM-DD"` en STRING — la même
  // forme qu'un champ Sequelize DATEONLY (ce qu'elle reçoit toujours dans
  // followupAutomation.service.js, son seul appelant jusqu'ici). Ici,
  // `relance.dateRelance` peut être un objet `Date` réel (le schéma Joi du
  // Tool, `Joi.date().iso()`, coercit la chaîne "2026-08-27" envoyée par
  // l'Agent en `Date` AVANT que `run()` ne s'exécute) — un `Date` concaténé
  // tel quel dans un template literal donne `Date.prototype.toString()`
  // ("Thu Aug 27 2026 00:00:00 GMT+...") plutôt que la date ISO attendue,
  // ce que `combineDateTime()` ne sait pas parser correctement (reproduit en
  // direct : décale l'heure de plusieurs heures sans erreur visible).
  // Normalisée ICI, dans ce nouvel appelant — jamais dans
  // `combineDateTime()` elle-même, qui reste inchangée pour son appelant
  // existant.
  const dateRelanceStr = relance.dateRelance instanceof Date ? relance.dateRelance.toISOString().slice(0, 10) : String(relance.dateRelance).slice(0, 10);
  const start = combineDateTime(dateRelanceStr, relance.heureRelance);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  let crmSynced = false;
  let taskId = null;
  try {
    const taskResults = await syncTaskForRecipients({
      entityType: ENTITY_TYPE,
      entityId: relance.id,
      recipients,
      title,
      description,
      start,
      end,
      status: "planned",
    });
    crmSynced = taskResults.length > 0;
    taskId = taskResults.find((r) => r.userId === relance.commercialId)?.taskId || taskResults[0]?.taskId || null;
  } catch (err) {
    console.error(`❌ [CommercialContactRelance] Échec synchronisation calendrier CRM — relance=${relance.id}:`, err.message);
  }

  let googleSynced = false;
  let googleError = null;
  try {
    const eventResults = await syncEventForRecipients({
      entityType: ENTITY_TYPE,
      entityId: relance.id,
      recipients,
      summary: title,
      description,
      start,
      end,
    });
    const commercialResult = eventResults.find((r) => r.userId === relance.commercialId) || eventResults[0];
    if (commercialResult?.success) {
      googleSynced = true;
    } else if (commercialResult?.skipped) {
      googleError = "not_connected";
    } else if (commercialResult) {
      googleError = commercialResult.error || "Échec de synchronisation Google Calendar";
    }
  } catch (err) {
    googleError = err.message;
    console.error(`❌ [CommercialContactRelance] Échec synchronisation Google Calendar — relance=${relance.id}:`, err.message);
  }

  return { crmSynced, googleSynced, googleError, taskId };
}

// Retourne toujours `{ ok, ... }` — jamais une exception pour un refus
// métier/RBAC attendu (contact introuvable, statut invalide, non
// autorisé, commercial introuvable) : c'est à l'appelant (Tool/Agent) de
// décider comment le formuler, jamais une invention de succès.
async function scheduleContactRelance(contactId, { dateRelance, heureRelance, commercialId, commentaire } = {}, actingUser) {
  const [contact] = await sequelize.query(
    `SELECT id, statut, "createdBy", "commercialId", nom, prenom, "nomSociete" FROM commercial_contacts WHERE id = :contactId`,
    { replacements: { contactId }, type: sequelize.QueryTypes.SELECT }
  );
  if (!contact) {
    return { ok: false, reason: "contact_not_found" };
  }

  if (!["ok", "rappeler_plus_tard"].includes(contact.statut)) {
    return { ok: false, reason: "invalid_status", statut: contact.statut };
  }

  // Même règle RBAC EXACTE que POST /:id/relances : politique centralisée
  // contactAccess.policy.js (niveau MANAGE) — actingUser.id est la SEULE
  // source possible de l'identité, jamais un champ fourni par l'appelant.
  if (!(await canAccessContact(actingUser, contact, LEVELS.MANAGE))) {
    return { ok: false, reason: "forbidden" };
  }

  if (!dateRelance) {
    return { ok: false, reason: "date_required" };
  }

  let resolvedCommercial = null;
  if (commercialId) {
    resolvedCommercial = await _resolveCommercial(commercialId);
    if (!resolvedCommercial) {
      return { ok: false, reason: "commercial_not_found" };
    }
  }

  const id = crypto.randomUUID();
  await sequelize.query(
    `INSERT INTO commercial_contact_relances
       (id, "commercialContactId", "dateRelance", "heureRelance", commentaire, "createdBy",
        "commercialId", "commercialName", "commercialEmail",
        "statutRelance", "emailSent", "notificationSent", "whatsappSent", "googleCalendarSynced",
        "createdAt", "updatedAt")
     VALUES
       (:id, :contactId, :dateRelance, :heureRelance, :commentaire, :createdBy,
        :commercialId, :commercialName, :commercialEmail,
        'planifiee', false, false, false, false,
        NOW(), NOW())`,
    {
      replacements: {
        id,
        contactId,
        dateRelance,
        heureRelance: heureRelance || null,
        commentaire: commentaire || null,
        createdBy: actingUser.id,
        commercialId: resolvedCommercial ? resolvedCommercial.id : null,
        commercialName: resolvedCommercial ? resolvedCommercial.name : null,
        commercialEmail: resolvedCommercial ? resolvedCommercial.email : null,
      },
      type: sequelize.QueryTypes.INSERT,
    }
  );

  const relance = {
    id,
    commercialContactId: contactId,
    dateRelance,
    heureRelance: heureRelance || null,
    commentaire: commentaire || null,
    statutRelance: "planifiee",
    commercialId: resolvedCommercial ? resolvedCommercial.id : null,
    commercialName: resolvedCommercial ? resolvedCommercial.name : null,
    commercialEmail: resolvedCommercial ? resolvedCommercial.email : null,
  };

  // La relance CommercialContactRelance est DÉJÀ écrite en base à ce stade
  // (INSERT ci-dessus, hors transaction) — un échec de synchronisation
  // calendrier ne peut donc jamais l'annuler rétroactivement. Try/catch
  // supplémentaire ici, par prudence, au-dessus de celui déjà présent DANS
  // `_syncCalendars()` : même un bug inattendu dans la résolution des
  // destinataires ne doit jamais transformer une écriture réussie en erreur
  // côté Copilot (voir commercialAgent.js — un `run()` qui lève ferait
  // échouer tout le Tool, alors que la relance existe déjà réellement).
  let calendarSync = { crmSynced: false, googleSynced: false, googleError: null, taskId: null };
  try {
    calendarSync = await _syncCalendars(relance, contact);
  } catch (err) {
    calendarSync = { crmSynced: false, googleSynced: false, googleError: err.message, taskId: null };
    console.error(`❌ [CommercialContactRelance] Échec inattendu de synchronisation calendrier — relance=${id}:`, err.message);
  }

  // Reflète le résultat RÉEL sur la relance elle-même (mêmes champs déjà
  // présents sur le modèle, déjà utilisés par followupAutomation.service.js —
  // jamais une nouvelle colonne) : un consommateur qui relit cette relance
  // plus tard (ex. GET /:id/relances) voit un état cohérent avec ce qui
  // s'est réellement passé, jamais figé à ses valeurs par défaut.
  try {
    await sequelize.query(
      `UPDATE commercial_contact_relances
          SET "calendarEventId" = :taskId,
              "googleCalendarSynced" = :googleSynced,
              "googleCalendarError" = :googleError,
              "updatedAt" = NOW()
        WHERE id = :id`,
      {
        replacements: {
          id,
          taskId: calendarSync.taskId,
          googleSynced: calendarSync.googleSynced,
          googleError: calendarSync.googleError,
        },
        type: sequelize.QueryTypes.UPDATE,
      }
    );
  } catch (err) {
    console.error(`❌ [CommercialContactRelance] Échec mise à jour des indicateurs calendrier — relance=${id}:`, err.message);
  }

  return {
    ok: true,
    relance,
    contact: { id: contact.id, nom: contact.nom, prenom: contact.prenom, nomSociete: contact.nomSociete },
    calendarSync: { crmSynced: calendarSync.crmSynced, googleSynced: calendarSync.googleSynced, googleError: calendarSync.googleError },
  };
}

module.exports = { scheduleContactRelance, ADMIN_TIER_ROLES, _syncCalendars };
