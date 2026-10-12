"use strict";

/**
 * # crmRecordAnswerBuilder — fiche CRM complète d'un ingénieur, d'un contact, d'une société (FR/EN/RU)
 *
 * Met en forme l'objet structuré renvoyé par find_crm_entity (fields,
 * projects, activity) : Identité / Coordonnées / Entreprise / Adresse /
 * Activité CRM / Autres informations. Déterministe — aucune valeur n'est
 * reformulée ni devinée :
 * - un champ de la fiche laissé vide est affiché « Non renseigné » ;
 * - un champ masqué par les droits de l'utilisateur est dit tel quel ;
 * - une question sur un champ qui n'existe pas pour ce type de fiche
 *   (l'adresse d'un ingénieur) reçoit « Non renseigné » avec cette précision.
 */

const L = {
  fr: {
    crmHeading: "### 🏢 Informations CRM",
    source: "_Source : données internes du CRM_",
    empty: "Non renseigné",
    restricted: "Non accessible avec votre rôle",
    noSuchField: (kind) => `Non renseigné (la fiche ${kind} du CRM ne comporte pas ce champ)`,
    kinds: { engineer: "ingénieur", architect: "architecte", contact: "contact", company: "société" },
    types: { engineer: "Ingénieur", architect: "Architecte", contact: "Contact commercial", company: "Société" },
    sections: { identity: "👤 **Identité**", coordinates: "📞 **Coordonnées**", company: "🏢 **Entreprise**", address: "📍 **Adresse**", activity: "📊 **Activité CRM**", other: "📝 **Autres informations**" },
    f: {
      id: "ID CRM", fullName: "Nom complet", firstName: "Prénom", lastName: "Nom", contactType: "Type", category: "Catégorie",
      phone: "Téléphone", email: "Email", company: "Société", companyFromProjects: "Société (d'après ses projets)", designOffice: "Bureau d'études (d'après ses projets)", engineers: "Ingénieurs associés (d'après ses projets)", taxId: "Matricule fiscal", address: "Adresse",
      status: "Statut", pipelineStage: "Étape commerciale", assignedCommercial: "Commercial responsable",
      calls: "Nombre d'appels", lastCall: "Dernier appel", actions: "Nombre d'actions", lastAction: "Dernière action",
      relances: "Nombre de relances", lastRelance: "Dernière relance", projects: "Projets associés",
      topic: "Sujet de discussion", notes: "Notes", createdAt: "Date de création", updatedAt: "Date de modification",
    },
    of: (label, name) => `${label} de **${name}**`,
    scopeMine: " (dans votre périmètre)",
    noneInScope: "Aucun dans votre périmètre",
    outOfScope: (n) => `${n} autre${n > 1 ? "s" : ""} projet${n > 1 ? "s" : ""} associé${n > 1 ? "s" : ""} hors de votre périmètre — non accessible${n > 1 ? "s" : ""} avec votre rôle`,
    more: (n) => `… et ${n} autre${n > 1 ? "s" : ""}`,
    archived: "archivé",
    none: "Aucun",
    fuzzy: (asked, found) => `ℹ️ Aucune correspondance exacte pour « ${asked} » : voici la fiche la plus proche, **${found}**. Vérifiez qu'il s'agit bien de la bonne personne.`,
  },
  en: {
    crmHeading: "### 🏢 CRM information",
    source: "_Source: internal CRM data_",
    empty: "Not provided",
    restricted: "Not accessible with your role",
    noSuchField: (kind) => `Not provided (the CRM ${kind} record has no such field)`,
    kinds: { engineer: "engineer", architect: "architect", contact: "contact", company: "company" },
    types: { engineer: "Engineer", architect: "Architect", contact: "Sales contact", company: "Company" },
    sections: { identity: "👤 **Identity**", coordinates: "📞 **Contact details**", company: "🏢 **Company**", address: "📍 **Address**", activity: "📊 **CRM activity**", other: "📝 **Other information**" },
    f: {
      id: "CRM ID", fullName: "Full name", firstName: "First name", lastName: "Last name", contactType: "Type", category: "Category",
      phone: "Phone", email: "Email", company: "Company", companyFromProjects: "Company (from related projects)", designOffice: "Design office (from related projects)", engineers: "Related engineers (from its projects)", taxId: "Tax ID", address: "Address",
      status: "Status", pipelineStage: "Sales stage", assignedCommercial: "Assigned sales rep",
      calls: "Number of calls", lastCall: "Last call", actions: "Number of actions", lastAction: "Last action",
      relances: "Number of follow-ups", lastRelance: "Last follow-up", projects: "Related projects",
      topic: "Discussion topic", notes: "Notes", createdAt: "Created on", updatedAt: "Last modified on",
    },
    of: (label, name) => `${label} of **${name}**`,
    scopeMine: " (within your scope)",
    noneInScope: "None within your scope",
    outOfScope: (n) => `${n} other related project${n > 1 ? "s" : ""} outside your scope — not accessible with your role`,
    more: (n) => `… and ${n} more`,
    archived: "archived",
    none: "None",
    fuzzy: (asked, found) => `ℹ️ No exact match for "${asked}": the closest record is **${found}**. Please check that this is the right person.`,
  },
  ru: {
    crmHeading: "### 🏢 Данные CRM",
    source: "_Источник: внутренние данные CRM_",
    empty: "Не указано",
    restricted: "Недоступно для вашей роли",
    noSuchField: () => "Не указано (в этой карточке CRM такого поля нет)",
    kinds: { engineer: "инженер", architect: "архитектор", contact: "контакт", company: "компания" },
    types: { engineer: "Инженер", architect: "Архитектор", contact: "Коммерческий контакт", company: "Компания" },
    sections: { identity: "👤 **Личные данные**", coordinates: "📞 **Контакты**", company: "🏢 **Компания**", address: "📍 **Адрес**", activity: "📊 **Активность в CRM**", other: "📝 **Прочее**" },
    f: {
      id: "ID в CRM", fullName: "Полное имя", firstName: "Имя", lastName: "Фамилия", contactType: "Тип", category: "Категория",
      phone: "Телефон", email: "Email", company: "Компания", companyFromProjects: "Компания (по его проектам)", designOffice: "Проектное бюро (по его проектам)", engineers: "Связанные инженеры (по проектам компании)", taxId: "Налоговый номер", address: "Адрес",
      status: "Статус", pipelineStage: "Этап продаж", assignedCommercial: "Ответственный менеджер",
      calls: "Количество звонков", lastCall: "Последний звонок", actions: "Количество действий", lastAction: "Последнее действие",
      relances: "Количество напоминаний", lastRelance: "Последнее напоминание", projects: "Связанные проекты",
      topic: "Тема обсуждения", notes: "Заметки", createdAt: "Дата создания", updatedAt: "Дата изменения",
    },
    of: (label, name) => `${label} — **${name}**`,
    scopeMine: " (в вашей зоне доступа)",
    noneInScope: "В вашей зоне доступа нет",
    outOfScope: (n) => `Других связанных проектов вне вашей зоны доступа: ${n} — недоступно для вашей роли`,
    more: (n) => `… и ещё ${n}`,
    archived: "в архиве",
    none: "Нет",
    fuzzy: (asked, found) => `ℹ️ Точного совпадения для «${asked}» нет: ближайшая карточка — **${found}**. Проверьте, что это нужный человек.`,
  },
};

// Champs présents sur chaque type de fiche (les autres n'existent pas en base).
const FIELDS_BY_TYPE = {
  engineer: new Set(["fullName", "contactType", "phone", "email", "company", "designOffice", "projects", "createdAt", "updatedAt"]),
  architect: new Set(["fullName", "contactType", "phone", "email", "company", "projects", "createdAt", "updatedAt"]),
  contact: new Set(["firstName", "lastName", "fullName", "contactType", "phone", "email", "address", "company", "taxId", "status", "pipelineStage", "assignedCommercial", "calls", "lastCall", "actions", "lastAction", "relances", "lastRelance", "topic", "notes", "createdAt", "updatedAt"]),
  company: new Set(["fullName", "contactType", "engineers", "projects", "createdAt", "updatedAt"]),
};

// Question de suivi → champs de la fiche à afficher.
const QUESTION_FIELDS = {
  phone: ["phone"],
  email: ["email"],
  address: ["address"],
  company: ["company"],
  coordinates: ["phone", "email", "address"],
  projects: ["projects"],
  relances: ["relances", "lastRelance"],
  actions: ["actions", "lastAction"],
  lastAction: ["lastAction"],
  status: ["status", "pipelineStage"],
};

function strings(language) {
  return L[language] || L.fr;
}

// Texte venu du CRM : jamais interprété comme du Markdown.
function plain(text) {
  return String(text == null ? "" : text).replace(/[\r\n]+/g, " ").replace(/([\\`*_[\]<>|])/g, "\\$1").trim();
}

function date(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return plain(value);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function humanize(value) {
  return plain(String(value).replace(/_/g, " "));
}

// Valeur affichable d'un champ de la fiche, ou null s'il est vide.
function valueOf(key, match, t) {
  const fields = match.fields || {};
  const activity = match.activity || {};
  switch (key) {
    case "contactType":
      return match.entityType === "contact" ? (fields.contactType ? `${t.types.contact} — ${plain(fields.contactType)}` : t.types.contact) : t.types[match.entityType];
    case "createdAt":
    case "updatedAt":
      return date(fields[key]);
    case "status":
      return fields.status ? humanize(fields.status) : null;
    case "calls":
    case "actions":
    case "relances":
      return Number.isInteger(activity[key]) ? String(activity[key]) : null;
    case "lastCall":
      return date(activity.lastCall);
    case "lastAction":
      return activity.lastAction ? [activity.lastAction.type ? plain(activity.lastAction.type) : null, date(activity.lastAction.date)].filter(Boolean).join(" — ") : null;
    case "lastRelance":
      return activity.lastRelance ? [date(activity.lastRelance.date), activity.lastRelance.status ? humanize(activity.lastRelance.status) : null].filter(Boolean).join(" — ") : null;
    default:
      return fields[key] == null || fields[key] === "" ? null : plain(fields[key]);
  }
}

// La fiche ingénieur n'a pas de champ « société » : la valeur affichée est
// celle saisie sur les projets qu'il suit, et le libellé le dit.
function labelOf(key, match, t) {
  return key === "company" && (match.entityType === "engineer" || match.entityType === "architect") ? t.f.companyFromProjects : t.f[key];
}

function line(key, match, t) {
  if ((match.restricted || []).includes(key)) return `- ${labelOf(key, match, t)} : ${t.restricted}`;
  return `- ${labelOf(key, match, t)} : ${valueOf(key, match, t) || t.empty}`;
}

function projectLines(match, t, scopeMine) {
  const projects = match.projects;
  if (!projects) return [];
  const label = `${t.f.projects} (${projects.total})${scopeMine ? t.scopeMine : ""}`;
  // Projets liés mais hors du périmètre de l'utilisateur : dits tels quels,
  // jamais confondus avec « aucun projet ».
  const hidden = projects.outOfScope > 0 ? `  - 🔒 ${t.outOfScope(projects.outOfScope)}` : null;
  if (!projects.total) return hidden ? [`- ${label} : ${t.noneInScope}`, hidden] : [`- ${label} : ${t.none}`];
  const lines = [`- ${label} :`];
  for (const p of projects.items) {
    const details = [p.statut ? plain(p.statut) : null, p.archived ? t.archived : null].filter(Boolean).join(", ");
    lines.push(`  - 📁 ${plain(p.name)}${details ? ` — ${details}` : ""}`);
  }
  if (projects.total > projects.items.length) lines.push(`  - ${t.more(projects.total - projects.items.length)}`);
  if (hidden) lines.push(hidden);
  return lines;
}

/**
 * Fiche complète. `asked` : nom saisi par l'utilisateur (pour signaler un
 * rapprochement approché).
 */
function buildRecordLines({ match, language, scopeMine = false, asked = null, showId = false }) {
  const t = strings(language);
  const has = (key) => FIELDS_BY_TYPE[match.entityType].has(key);
  // En-tête : qui, quel type de fiche — puis le bloc des données internes,
  // toujours annoncé comme tel.
  const icon = match.entityType === "company" ? "🏢" : "👤";
  const lines = [`${icon} **${plain(match.name)}**`, t.types[match.entityType] || "", "", t.crmHeading, t.source, ""];
  if (match.matchType === "fuzzy" && asked) lines.push(t.fuzzy(plain(asked), plain(match.name)), "");

  lines.push(t.sections.identity);
  // UUID du CRM : donnée technique — `showId` n'est vrai que pour un
  // administrateur en mode diagnostic (décidé par l'Agent).
  if (showId) lines.push(`- ${t.f.id} : ${plain(match.id)}`);
  for (const key of ["fullName", "firstName", "lastName", "contactType"]) if (has(key)) lines.push(line(key, match, t));

  if (has("phone")) lines.push("", t.sections.coordinates, line("phone", match, t), line("email", match, t));
  if (has("company")) {
    lines.push("", t.sections.company, line("company", match, t));
    // Affiché seulement s'il est renseigné sur au moins un projet visible.
    if (has("designOffice") && valueOf("designOffice", match, t)) lines.push(line("designOffice", match, t));
    if (has("taxId")) lines.push(line("taxId", match, t));
  }
  if (has("address")) lines.push("", t.sections.address, line("address", match, t));

  lines.push("", t.sections.activity);
  for (const key of ["status", "pipelineStage", "assignedCommercial", "calls", "lastCall", "actions", "lastAction", "relances", "lastRelance"]) {
    if (has(key)) lines.push(line(key, match, t));
  }
  if (has("engineers") && valueOf("engineers", match, t)) lines.push(line("engineers", match, t));
  lines.push(...projectLines(match, t, scopeMine));

  lines.push("", t.sections.other);
  for (const key of ["topic", "notes", "createdAt", "updatedAt"]) if (has(key)) lines.push(line(key, match, t));
  return lines;
}

/** Réponse à une question précise (« Quel est son téléphone ? »). */
function buildFieldLines({ match, questions, language, scopeMine = false, asked = null }) {
  const t = strings(language);
  const keys = [...new Set((questions || []).flatMap((q) => QUESTION_FIELDS[q] || []))];
  const lines = [];
  if (match.matchType === "fuzzy" && asked) lines.push(t.fuzzy(plain(asked), plain(match.name)), "");
  const name = plain(match.name);
  const exists = (key) => FIELDS_BY_TYPE[match.entityType].has(key);

  for (const key of keys) {
    if (key === "projects") {
      if (match.projects) lines.push(...projectLines(match, t, scopeMine).map((l, i) => (i === 0 ? l.replace(/^- /, `${name} — `) : l)));
      else lines.push(`${t.of(t.f.projects, name)} : ${t.noSuchField(t.kinds[match.entityType])}`);
    } else if (!exists(key)) {
      lines.push(`${t.of(t.f[key], name)} : ${t.noSuchField(t.kinds[match.entityType])}`);
    } else if ((match.restricted || []).includes(key)) {
      lines.push(`${t.of(labelOf(key, match, t), name)} : ${t.restricted}`);
    } else {
      lines.push(`${t.of(labelOf(key, match, t), name)} : ${valueOf(key, match, t) || t.empty}`);
    }
  }
  lines.push("", t.source);
  return lines;
}

module.exports = { buildRecordLines, buildFieldLines, QUESTION_FIELDS, FIELDS_BY_TYPE };
