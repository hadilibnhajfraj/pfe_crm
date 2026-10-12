"use strict";

// Réponses « liste / nombre / analyse des projets » du Copilot, construites
// UNIQUEMENT à partir de ce que le Tool list_projects a réellement renvoyé.
// Aucun appel au modèle de langage : rien n'est résumé, complété ni inventé.
//
// Règles :
// - le nombre annoncé est toujours le nombre réellement récupéré ; si toutes
//   les pages n'ont pas pu être lues, la réponse le dit et n'est jamais
//   présentée comme complète ;
// - un champ absent n'est pas affiché, sauf la prochaine relance, dont
//   l'absence est une information de suivi utile ;
// - trois langues : français, anglais, russe.

const PAGE_SIZE = 20;

const T = {
  fr: {
    titleAll: "📋 PROJETS",
    titleMine: "📋 MES PROJETS",
    scopeAll: "tous les projets non archivés",
    scopeMine: "vos projets non archivés",
    scopeRestricted: "vos projets non archivés (votre périmètre d'accès)",
    none: (scope) => `Aucun projet trouvé pour ${scope}.`,
    tryAll: "Aucun projet ne vous est attribué. Pour l'ensemble des projets, demandez « tous les projets ».",
    found: (n, scope) => `${n} projet${n > 1 ? "s" : ""} — ${scope}.`,
    showing: (from, to, n) => `Projets ${from} à ${to} sur ${n}.`,
    incomplete: (got, n) => `⚠️ Récupération incomplète : ${got} projets lus sur ${n}. Cette liste n'est pas exhaustive.`,
    archived: (n) => `${n} projet${n > 1 ? "s" : ""} archivé${n > 1 ? "s" : ""} non inclus.`,
    more: (n) => `Il reste ${n} projet${n > 1 ? "s" : ""}. Écrivez « suite » pour afficher les suivants.`,
    end: "Fin de la liste.",
    unnamed: "Projet sans nom",
    id: "Identifiant",
    stage: "Étape",
    status: "Statut",
    priority: "Priorité",
    owner: "Commercial",
    engineer: "Ingénieur",
    architect: "Architecte",
    nextRelance: "Prochaine relance",
    noRelance: "aucune planifiée",
    lastRelance: "Dernière relance",
    followUp: "Suivi",
    actions: (n) => `${n} action${n > 1 ? "s" : ""}`,
    lastAction: "dernière action",
    count: (n, scope) => `Il y a ${n} projet${n > 1 ? "s" : ""} — ${scope}.`,
    countAll: (active, archived, total) => `Total en base dans ce périmètre : ${total} (${active} actif${active > 1 ? "s" : ""}, ${archived} archivé${archived > 1 ? "s" : ""}).`,
    analysisTitle: "📊 ANALYSE DES PROJETS",
    analysed: (n, scope) => `Analyse de ${n} projet${n > 1 ? "s" : ""} — ${scope}.`,
    byStage: "Répartition par étape du pipeline",
    byStatus: "Répartition par statut",
    relances: "Relances",
    overdue: (n) => `en retard (date dépassée) : ${n}`,
    upcoming: (n) => `prévues dans les 7 prochains jours : ${n}`,
    planned: (n) => `planifiées plus tard : ${n}`,
    noneRelance: (n) => `sans relance planifiée : ${n}`,
    missing: "Champs manquants",
    missingNone: "aucun champ de suivi manquant",
    noStage: "sans étape",
    noStatus: "sans statut",
    noOwner: "sans commercial",
    overdueList: "Relances en retard",
    error: "Je n'ai pas pu récupérer les projets : la lecture des données a échoué. Aucune liste n'est affichée, pour ne pas présenter un résultat partiel. Réessayez dans un instant ; si le problème persiste, prévenez l'administrateur.",
    endOfList: "Il n'y a plus de projets à afficher.",
  },
  en: {
    titleAll: "📋 PROJECTS",
    titleMine: "📋 MY PROJECTS",
    scopeAll: "all non-archived projects",
    scopeMine: "your non-archived projects",
    scopeRestricted: "your non-archived projects (your access scope)",
    none: (scope) => `No project found for ${scope}.`,
    tryAll: 'No project is assigned to you. For every project, ask for "all projects".',
    found: (n, scope) => `${n} project${n > 1 ? "s" : ""} — ${scope}.`,
    showing: (from, to, n) => `Projects ${from} to ${to} of ${n}.`,
    incomplete: (got, n) => `⚠️ Incomplete retrieval: ${got} projects read out of ${n}. This list is not exhaustive.`,
    archived: (n) => `${n} archived project${n > 1 ? "s" : ""} not included.`,
    more: (n) => `${n} more project${n > 1 ? "s" : ""}. Type "next" to see the following ones.`,
    end: "End of the list.",
    unnamed: "Unnamed project",
    id: "Identifier",
    stage: "Stage",
    status: "Status",
    priority: "Priority",
    owner: "Sales owner",
    engineer: "Engineer",
    architect: "Architect",
    nextRelance: "Next follow-up",
    noRelance: "none planned",
    lastRelance: "Last follow-up",
    followUp: "Tracking",
    actions: (n) => `${n} action${n > 1 ? "s" : ""}`,
    lastAction: "last action",
    count: (n, scope) => `There ${n > 1 ? "are" : "is"} ${n} project${n > 1 ? "s" : ""} — ${scope}.`,
    countAll: (active, archived, total) => `Total stored in this scope: ${total} (${active} active, ${archived} archived).`,
    analysisTitle: "📊 PROJECT ANALYSIS",
    analysed: (n, scope) => `Analysis of ${n} project${n > 1 ? "s" : ""} — ${scope}.`,
    byStage: "Breakdown by pipeline stage",
    byStatus: "Breakdown by status",
    relances: "Follow-ups",
    overdue: (n) => `overdue: ${n}`,
    upcoming: (n) => `due in the next 7 days: ${n}`,
    planned: (n) => `planned later: ${n}`,
    noneRelance: (n) => `no follow-up planned: ${n}`,
    missing: "Missing fields",
    missingNone: "no tracking field missing",
    noStage: "without a stage",
    noStatus: "without a status",
    noOwner: "without a sales owner",
    overdueList: "Overdue follow-ups",
    error: "I could not retrieve the projects: reading the data failed. No list is shown, so that a partial result is not presented as complete. Please try again shortly; if the problem persists, contact the administrator.",
    endOfList: "There are no more projects to show.",
  },
  ru: {
    titleAll: "📋 ПРОЕКТЫ",
    titleMine: "📋 МОИ ПРОЕКТЫ",
    scopeAll: "все неархивные проекты",
    scopeMine: "ваши неархивные проекты",
    scopeRestricted: "ваши неархивные проекты (ваша область доступа)",
    none: (scope) => `Проекты не найдены: ${scope}.`,
    tryAll: "За вами не закреплено ни одного проекта. Чтобы увидеть все проекты, напишите «все проекты».",
    found: (n, scope) => `Проектов: ${n} — ${scope}.`,
    showing: (from, to, n) => `Проекты с ${from} по ${to} из ${n}.`,
    incomplete: (got, n) => `⚠️ Данные получены не полностью: прочитано ${got} из ${n}. Список не является полным.`,
    archived: (n) => `Архивных проектов, не включённых в список: ${n}.`,
    more: (n) => `Осталось проектов: ${n}. Напишите «дальше», чтобы показать следующие.`,
    end: "Конец списка.",
    unnamed: "Проект без названия",
    id: "Идентификатор",
    stage: "Этап",
    status: "Статус",
    priority: "Приоритет",
    owner: "Менеджер",
    engineer: "Инженер",
    architect: "Архитектор",
    nextRelance: "Следующий контакт",
    noRelance: "не запланирован",
    lastRelance: "Последний контакт",
    followUp: "Сопровождение",
    actions: (n) => `действий: ${n}`,
    lastAction: "последнее действие",
    count: (n, scope) => `Проектов: ${n} — ${scope}.`,
    countAll: (active, archived, total) => `Всего в этой области: ${total} (активных: ${active}, архивных: ${archived}).`,
    analysisTitle: "📊 АНАЛИЗ ПРОЕКТОВ",
    analysed: (n, scope) => `Проанализировано проектов: ${n} — ${scope}.`,
    byStage: "Распределение по этапам воронки",
    byStatus: "Распределение по статусам",
    relances: "Контакты",
    overdue: (n) => `просрочено: ${n}`,
    upcoming: (n) => `в ближайшие 7 дней: ${n}`,
    planned: (n) => `запланировано позже: ${n}`,
    noneRelance: (n) => `без запланированного контакта: ${n}`,
    missing: "Незаполненные поля",
    missingNone: "все поля сопровождения заполнены",
    noStage: "без этапа",
    noStatus: "без статуса",
    noOwner: "без менеджера",
    overdueList: "Просроченные контакты",
    error: "Не удалось получить проекты: ошибка чтения данных. Список не показан, чтобы частичный результат не выглядел полным. Повторите попытку позже; если ошибка сохраняется, обратитесь к администратору.",
    endOfList: "Больше проектов нет.",
  },
};

const tr = (language) => T[language] || T.fr;
const clean = (v) => (v == null ? "" : String(v).trim());

function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

// Champs d'un projet, tels que list_projects les renvoie (aucun n'est déduit).
function projectFields(p) {
  return {
    id: p.id || null,
    name: clean(p.nomProjet) || clean(p.title) || null,
    stage: clean(p.stage && p.stage.name) || null,
    status: clean(p.statut) || null,
    priority: clean(p.priorityLabel) || clean(p.priority) || null,
    owner: clean(p.owner && (p.owner.fullName || p.owner.name || p.owner.email)) || null,
    engineer: clean(p.ingenieurResponsable) || null,
    architect: clean(p.architecte) || null,
    nextRelance: p.nextRelanceDate || null,
    lastRelance: p.lastRelanceAt || null,
    actionsCount: Number.isFinite(Number(p.actionsCount)) ? Number(p.actionsCount) : null,
    currentAction: clean(p.currentAction) || null,
  };
}

function scopeLabel(t, scope) {
  return scope === "mine" ? t.scopeMine : scope === "restricted" ? t.scopeRestricted : t.scopeAll;
}

function projectLines(t, p, index, { showIds }) {
  const f = projectFields(p);
  const lines = [`${index}. ${f.name || t.unnamed}`];
  if (showIds && f.id) lines.push(`   ${t.id} : ${f.id}`);
  const state = [f.stage && `${t.stage} : ${f.stage}`, f.status && `${t.status} : ${f.status}`, f.priority && `${t.priority} : ${f.priority}`].filter(Boolean);
  if (state.length) lines.push(`   ${state.join(" · ")}`);
  const people = [f.owner && `${t.owner} : ${f.owner}`, f.engineer && `${t.engineer} : ${f.engineer}`, f.architect && `${t.architect} : ${f.architect}`].filter(Boolean);
  if (people.length) lines.push(`   ${people.join(" · ")}`);
  const relance = [`${t.nextRelance} : ${formatDate(f.nextRelance) || t.noRelance}`];
  if (formatDate(f.lastRelance)) relance.push(`${t.lastRelance} : ${formatDate(f.lastRelance)}`);
  lines.push(`   ${relance.join(" · ")}`);
  if (f.actionsCount != null) {
    const last = f.currentAction && !/^aucune action$/i.test(f.currentAction) ? ` (${t.lastAction} : ${f.currentAction})` : "";
    lines.push(`   ${t.followUp} : ${t.actions(f.actionsCount)}${last}`);
  }
  return lines;
}

/**
 * @param {object} o
 * @param {"fr"|"en"|"ru"} o.language
 * @param {"all"|"mine"|"restricted"} o.scope      périmètre réellement appliqué
 * @param {number} o.total                          total annoncé par la source pour ce périmètre
 * @param {number} o.fetched                        projets réellement récupérés
 * @param {boolean} o.complete                      toutes les pages ont été lues
 * @param {object[]} o.items                        projets de la page affichée
 * @param {number} o.offset                         rang du premier projet affiché (0 = premier)
 * @param {number} [o.archived]                     projets archivés non inclus
 */
function buildProjectListAnswer({ language, scope, total, fetched, complete, items, offset = 0, archived = 0, showIds = false, canSeeAll = false }) {
  const t = tr(language);
  const label = scopeLabel(t, scope);
  if (!total && !items.length) {
    const lines = [scope === "all" ? t.titleAll : t.titleMine, "", t.none(label)];
    if (archived > 0) lines.push(t.archived(archived));
    if (scope === "mine" && canSeeAll) lines.push(t.tryAll);
    return lines.join("\n");
  }
  const lines = [scope === "all" ? t.titleAll : t.titleMine, "", t.found(total, label)];
  if (!complete) lines.push(t.incomplete(fetched, total));
  if (items.length < total || offset > 0) lines.push(t.showing(offset + 1, offset + items.length, total));
  if (archived > 0) lines.push(t.archived(archived));
  lines.push("");
  items.forEach((p, i) => lines.push(...projectLines(t, p, offset + i + 1, { showIds }), ""));
  const remaining = total - (offset + items.length);
  lines.push(remaining > 0 ? t.more(remaining) : t.end);
  return lines.join("\n").trimEnd();
}

function buildProjectCountAnswer({ language, scope, total, stats = null }) {
  const t = tr(language);
  const lines = [t.count(total, scopeLabel(t, scope))];
  if (stats && Number.isFinite(stats.total)) lines.push(t.countAll(stats.active || 0, stats.archived || 0, stats.total));
  return lines.join("\n");
}

function tally(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

// Analyse calculée sur les projets RÉELLEMENT récupérés — voir `complete`.
function analyzeProjects(projects, now = new Date()) {
  const rows = projects.map(projectFields);
  const today = now.getTime();
  const week = today + 7 * 86400000;
  const next = (r) => (r.nextRelance ? new Date(r.nextRelance).getTime() : null);
  const overdue = rows.filter((r) => next(r) != null && next(r) < today);
  return {
    count: rows.length,
    byStage: tally(rows.map((r) => r.stage)),
    byStatus: tally(rows.map((r) => r.status)),
    relances: {
      overdue: overdue.length,
      upcoming: rows.filter((r) => next(r) != null && next(r) >= today && next(r) <= week).length,
      later: rows.filter((r) => next(r) != null && next(r) > week).length,
      none: rows.filter((r) => next(r) == null).length,
    },
    overdueProjects: overdue.sort((a, b) => next(a) - next(b)).slice(0, 5),
    missing: {
      stage: rows.filter((r) => !r.stage).length,
      status: rows.filter((r) => !r.status).length,
      owner: rows.filter((r) => !r.owner).length,
    },
  };
}

function buildProjectAnalysisAnswer({ language, scope, projects, total, complete, archived = 0, now = new Date(), canSeeAll = false }) {
  const t = tr(language);
  const label = scopeLabel(t, scope);
  if (!projects.length) return [t.analysisTitle, "", t.none(label), ...(scope === "mine" && canSeeAll ? [t.tryAll] : [])].join("\n");
  const a = analyzeProjects(projects, now);
  const lines = [t.analysisTitle, "", t.analysed(a.count, label)];
  if (!complete) lines.push(t.incomplete(a.count, total));
  if (archived > 0) lines.push(t.archived(archived));
  lines.push("", `${t.byStage} :`);
  for (const [stage, n] of a.byStage) lines.push(`• ${stage || t.noStage} : ${n}`);
  lines.push("", `${t.byStatus} :`);
  for (const [status, n] of a.byStatus) lines.push(`• ${status || t.noStatus} : ${n}`);
  lines.push("", `${t.relances} :`, `• ${t.overdue(a.relances.overdue)}`, `• ${t.upcoming(a.relances.upcoming)}`, `• ${t.planned(a.relances.later)}`, `• ${t.noneRelance(a.relances.none)}`);
  if (a.overdueProjects.length) {
    lines.push("", `${t.overdueList} :`);
    for (const r of a.overdueProjects) lines.push(`• ${r.name || t.unnamed} — ${formatDate(r.nextRelance)}${r.owner ? ` (${r.owner})` : ""}`);
  }
  const missing = [a.missing.stage && `${t.noStage} : ${a.missing.stage}`, a.missing.status && `${t.noStatus} : ${a.missing.status}`, a.missing.owner && `${t.noOwner} : ${a.missing.owner}`].filter(Boolean);
  lines.push("", `${t.missing} :`, ...(missing.length ? missing.map((m) => `• ${m}`) : [`• ${t.missingNone}`]));
  return lines.join("\n");
}

const buildProjectListError = (language) => tr(language).error;
const buildProjectListEnd = (language) => tr(language).endOfList;

module.exports = { PAGE_SIZE, buildProjectListAnswer, buildProjectCountAnswer, buildProjectAnalysisAnswer, buildProjectListError, buildProjectListEnd, analyzeProjects, projectFields, formatDate };
