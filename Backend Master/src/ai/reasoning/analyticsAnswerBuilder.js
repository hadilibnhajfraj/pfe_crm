"use strict";

/**
 * # Réponses analytiques CRM (PROBAR ASSISTANT) — FR / EN / RU, déterministes
 *
 * Aucun modèle de langage : chaque nombre, nom et total affiché vient
 * EXACTEMENT de la sortie du Tool statistique. Les égalités sont annoncées
 * comme telles (jamais un gagnant choisi arbitrairement). Si rien n'est
 * trouvé, la réponse le dit — elle n'invente ni ne complète rien.
 *
 * Les lignes « Libellé : nombre » du pied de réponse sont affichées en cartes
 * KPI par l'interface Flutter ; la répartition est un tableau markdown.
 */

// Accord du russe : 1 проект, 2-4 проекта, 5+ проектов.
function ruPlural(n, [one, few, many]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const UNITS = {
  project: { fr: ["projet", "projets"], en: ["project", "projects"], ru: ["проект", "проекта", "проектов"] },
  contact: { fr: ["contact", "contacts"], en: ["contact", "contacts"], ru: ["контакт", "контакта", "контактов"] },
  relance: { fr: ["relance", "relances"], en: ["follow-up", "follow-ups"], ru: ["напоминание", "напоминания", "напоминаний"] },
  industrial: { fr: ["fiche", "fiches"], en: ["record", "records"], ru: ["запись", "записи", "записей"] },
};

function unit(domain, n, lang) {
  const u = UNITS[domain][lang];
  if (lang === "ru") return ruPlural(n, u);
  return n === 1 ? u[0] : u[1];
}

const count = (domain, n, lang) => `${n} ${unit(domain, n, lang)}`;

// Dimension : [singulier, pluriel, « par … »].
const DIMENSIONS = {
  engineer: { fr: ["ingénieur", "ingénieurs", "par ingénieur"], en: ["engineer", "engineers", "by engineer"], ru: ["инженер", "инженеры", "по инженерам"] },
  owner: { fr: ["commercial", "commerciaux", "par commercial"], en: ["sales rep", "sales reps", "by sales rep"], ru: ["менеджер", "менеджеры", "по менеджерам"] },
  commercial: { fr: ["commercial", "commerciaux", "par commercial"], en: ["sales rep", "sales reps", "by sales rep"], ru: ["менеджер", "менеджеры", "по менеджерам"] },
  status: { fr: ["statut", "statuts", "par statut"], en: ["status", "statuses", "by status"], ru: ["статус", "статусы", "по статусам"] },
  client: { fr: ["client", "clients", "par client"], en: ["customer", "customers", "by customer"], ru: ["клиент", "клиенты", "по клиентам"] },
  product_family: { fr: ["famille de produit", "familles de produit", "par famille de produit"], en: ["product family", "product families", "by product family"], ru: ["семейство продуктов", "семейства продуктов", "по семействам продуктов"] },
  month: { fr: ["mois", "mois", "par mois"], en: ["month", "months", "by month"], ru: ["месяц", "месяцы", "по месяцам"] },
  machine: { fr: ["machine", "machines", "par machine"], en: ["machine", "machines", "by machine"], ru: ["машина", "машины", "по машинам"] },
  module: { fr: ["module", "modules", "par module"], en: ["module", "modules", "by module"], ru: ["модуль", "модули", "по модулям"] },
  operator: { fr: ["opérateur", "opérateurs", "par opérateur"], en: ["operator", "operators", "by operator"], ru: ["оператор", "операторы", "по операторам"] },
};

const TITLES = {
  project: { fr: "📊 Analyse des projets", en: "📊 Project analysis", ru: "📊 Анализ проектов" },
  contact: { fr: "📊 Analyse des contacts commerciaux", en: "📊 Sales contacts analysis", ru: "📊 Анализ контактов" },
  relance: { fr: "📊 Analyse des relances", en: "📊 Follow-up analysis", ru: "📊 Анализ напоминаний" },
  industrial: { fr: "📊 Analyse des fiches industrielles", en: "📊 Industrial records analysis", ru: "📊 Анализ производственных записей" },
};

// Article et accord français : « l'ingénieur associé », « le commercial
// associé », « la machine associée ».
const FR_FEMININE = new Set(["machine", "famille de produit"]);
const frLe = (word) => (/^[aeiouyéèêàâîôh]/i.test(word) ? `L'${word}` : FR_FEMININE.has(word) ? `La ${word}` : `Le ${word}`);
const frAssocie = (word) => (FR_FEMININE.has(word) ? "associée" : "associé");

// Icône de la ligne « gagnant », selon la dimension.
const DIMENSION_ICONS = { engineer: "👤", owner: "👤", commercial: "👤", operator: "👤", client: "🏢", machine: "⚙️", status: "🏷️", month: "📅", module: "🧩", product_family: "📦" };

const T = {
  fr: {
    topOne: (dim, n, u) => `${frLe(dim)} ${frAssocie(dim)} au plus grand nombre de ${u} est :`,
    topTie: (dims, n, u) => `Plusieurs ${dims} sont à égalité avec le plus grand nombre de ${u} (${n}) :`,
    minOne: (dim, u) => `${frLe(dim)} ${frAssocie(dim)} au plus petit nombre de ${u} est :`,
    minTie: (dims, n, u) => `Plusieurs ${dims} sont à égalité avec le plus petit nombre de ${u} (${n}) :`,
    minNote: (dims, u) => `Parmi les ${dims} ayant au moins un ${u}.`,
    ranking: (k, dims) => `Top ${k} des ${dims} :`,
    distribution: "Répartition :",
    average: (avg, u, dim, dims, groups, withDim) => `En moyenne **${avg}** ${u} par ${dim} (${groups} ${dims}, ${withDim} ${u} au total).`,
    more: (n, dims) => `… et ${n} autre(s) ${dims}.`,
    total: "Total",
    withDim: (dim) => `Avec ${dim}`,
    withoutDim: (dim) => `Sans ${dim}`,
    engineersWithoutProjects: "Ingénieurs sans projet",
    archived: "Dont archivés",
    quantity: "Quantité produite",
    scopeMine: "Périmètre : vos données uniquement (droits de votre rôle).",
    scopeAll: "Périmètre : toutes les données du CRM.",
    archivedIncluded: "Projets archivés inclus.",
    archivedExcluded: "Hors projets archivés.",
    filters: "Filtres",
    period: { today: "aujourd'hui", this_week: "cette semaine", last_week: "la semaine dernière", this_month: "ce mois-ci", last_month: "le mois dernier", this_year: "cette année", last_year: "l'année dernière", last_n_days: (d) => `les ${d} derniers jours` },
    empty: (u, dim) => `Je n'ai trouvé aucun ${u} associé à un ${dim} dans les données actuellement accessibles.`,
    emptyTotal: (u) => `Je n'ai trouvé aucun ${u} correspondant dans les données actuellement accessibles.`,
    totalSentence: (n, u) => `Nombre de ${u} : **${n}**.`,
    withoutRelance: (n) => `**${n}** contact(s) n'ont jamais été relancés.`,
    withoutRelanceNone: "Tous les contacts accessibles ont déjà au moins une relance.",
    oldestFirst: "Les plus anciens d'abord :",
    source: (tool) => `Source : données CRM en temps réel (\`${tool}\`).`,
  },
  en: {
    topOne: (dim, n, u) => `The ${dim} associated with the most ${u} is:`,
    topTie: (dims, n, u) => `Several ${dims} are tied for the most ${u} (${n}):`,
    minOne: (dim, u) => `The ${dim} associated with the fewest ${u} is:`,
    minTie: (dims, n, u) => `Several ${dims} are tied for the fewest ${u} (${n}):`,
    minNote: (dims, u) => `Among ${dims} with at least one ${u}.`,
    ranking: (k, dims) => `Top ${k} ${dims}:`,
    distribution: "Breakdown:",
    average: (avg, u, dim, dims, groups, withDim) => `On average **${avg}** ${u} per ${dim} (${groups} ${dims}, ${withDim} ${u} in total).`,
    more: (n, dims) => `… and ${n} more ${dims}.`,
    total: "Total",
    withDim: (dim) => `With ${dim}`,
    withoutDim: (dim) => `Without ${dim}`,
    engineersWithoutProjects: "Engineers without projects",
    archived: "Archived",
    quantity: "Quantity produced",
    scopeMine: "Scope: your own data only (your role's permissions).",
    scopeAll: "Scope: all CRM data.",
    archivedIncluded: "Archived projects included.",
    archivedExcluded: "Archived projects excluded.",
    filters: "Filters",
    period: { today: "today", this_week: "this week", last_week: "last week", this_month: "this month", last_month: "last month", this_year: "this year", last_year: "last year", last_n_days: (d) => `the last ${d} days` },
    empty: (u, dim) => `I found no ${u} associated with a ${dim} in the data currently accessible to you.`,
    emptyTotal: (u) => `I found no matching ${u} in the data currently accessible to you.`,
    totalSentence: (n, u) => `Number of ${u}: **${n}**.`,
    withoutRelance: (n) => `**${n}** contact(s) have never been followed up.`,
    withoutRelanceNone: "Every accessible contact already has at least one follow-up.",
    oldestFirst: "Oldest first:",
    source: (tool) => `Source: live CRM data (\`${tool}\`).`,
  },
  ru: {
    topOne: () => "Лидер по количеству:",
    topTie: (dims, n) => `Несколько значений делят первое место (${n}):`,
    minOne: () => "Меньше всего — у этого значения:",
    minTie: (dims, n) => `Несколько значений делят последнее место (${n}):`,
    minNote: () => "Среди значений, у которых есть хотя бы одна запись.",
    ranking: (k) => `Топ-${k}:`,
    distribution: "Распределение:",
    average: (avg, u, dim, dims, groups, withDim) => `В среднем **${avg}** (${u}) на одно значение — ${dims}: ${groups}, всего: ${withDim}.`,
    more: (n) => `… и ещё ${n}.`,
    total: "Всего",
    withDim: () => "С указанным значением",
    withoutDim: () => "Без значения",
    engineersWithoutProjects: "Инженеры без проектов",
    archived: "Из них в архиве",
    quantity: "Произведено",
    scopeMine: "Область: только ваши данные (права вашей роли).",
    scopeAll: "Область: все данные CRM.",
    archivedIncluded: "Архивные проекты учтены.",
    archivedExcluded: "Без архивных проектов.",
    filters: "Фильтры",
    period: { today: "сегодня", this_week: "на этой неделе", last_week: "на прошлой неделе", this_month: "в этом месяце", last_month: "в прошлом месяце", this_year: "в этом году", last_year: "в прошлом году", last_n_days: (d) => `за последние ${d} дн.` },
    empty: () => "В доступных вам данных не найдено ни одной подходящей записи.",
    emptyTotal: () => "В доступных вам данных не найдено ни одной подходящей записи.",
    totalSentence: (n) => `Количество: **${n}**.`,
    withoutRelance: (n) => `**${n}** контакт(ов) ни разу не получали напоминаний.`,
    withoutRelanceNone: "У всех доступных контактов уже есть хотя бы одно напоминание.",
    oldestFirst: "Сначала самые старые:",
    source: (tool) => `Источник: актуальные данные CRM (\`${tool}\`).`,
  },
};

const ERRORS = {
  denied: {
    fr: "Votre rôle ne permet pas de consulter ces statistiques : le serveur a refusé l'accès.",
    en: "Your role does not allow access to these statistics: the server denied the request.",
    ru: "Ваша роль не позволяет просматривать эту статистику: сервер отказал в доступе.",
  },
  timeout: {
    fr: "Les statistiques n'ont pas pu être calculées à temps. Réessayez dans un instant.",
    en: "The statistics could not be computed in time. Please try again in a moment.",
    ru: "Не удалось вовремя рассчитать статистику. Повторите попытку чуть позже.",
  },
  failure: {
    fr: "Les statistiques n'ont pas pu être récupérées (erreur du serveur). Je préfère ne rien afficher plutôt qu'un chiffre approximatif.",
    en: "The statistics could not be retrieved (server error). I prefer to show nothing rather than an approximate figure.",
    ru: "Не удалось получить статистику (ошибка сервера). Лучше ничего не показывать, чем приблизительные цифры.",
  },
  notUnderstood: {
    fr: "Je veux m'assurer de bien comprendre votre demande. Je peux analyser les projets (par ingénieur, commercial, statut, client, famille de produit ou mois), les contacts et relances, et les fiches industrielles (par machine, module ou opérateur). Pouvez-vous préciser ce que vous souhaitez compter ou classer ?",
    en: "I want to make sure I understand your request. I can analyze projects (by engineer, sales rep, status, customer, product family or month), sales contacts and follow-ups, and industrial records (by machine, module or operator). Could you specify what you would like to count or rank?",
    ru: "Хочу убедиться, что правильно понял запрос. Я могу анализировать проекты (по инженерам, менеджерам, статусам, клиентам, семействам продуктов или месяцам), контакты и напоминания, а также производственные записи (по машинам, модулям или операторам). Уточните, что нужно посчитать или ранжировать?",
  },
};

function lang(language) {
  return T[language] ? language : "fr";
}

function dimNames(groupBy, l) {
  return DIMENSIONS[groupBy] ? DIMENSIONS[groupBy][l] : [groupBy, groupBy, groupBy];
}

function escapeCell(value) {
  return String(value === null || value === undefined || value === "" ? "—" : value).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function totalOf(result, domain) {
  if (domain === "industrial") return result.totalRecords;
  if (domain === "project") return result.totalProjects;
  return result.total;
}

function contextLines(query, result, l) {
  const t = T[l];
  const lines = [];
  lines.push(result.scope === "mine" ? t.scopeMine : t.scopeAll);
  if (query.domain === "project") lines.push(result.includeArchived === false ? t.archivedExcluded : t.archivedIncluded);
  const filters = [];
  if (query.filters.productFamily) filters.push(query.filters.productFamily);
  if (query.filters.module) filters.push(query.filters.module.toUpperCase());
  if (query.filters.statut) filters.push(query.filters.statut);
  if (query.filters.period) {
    const p = t.period[query.filters.period.key];
    filters.push(typeof p === "function" ? p(query.filters.period.days) : p);
  }
  if (filters.length) lines.push(`${t.filters}${l === "fr" ? " : " : ": "}${filters.join(" · ")}`);
  return lines;
}

function footerKpis(query, result, l) {
  const t = T[l];
  const sep = l === "fr" ? " : " : ": ";
  const [dimSing] = dimNames(query.groupBy, l);
  const lines = [`📁 ${t.total}${sep}${totalOf(result, query.domain)}`];
  if (query.groupBy) {
    lines.push(`✅ ${t.withDim(dimSing)}${sep}${result.withDimension}`);
    lines.push(`❔ ${t.withoutDim(dimSing)}${sep}${result.withoutDimension}`);
  }
  if (typeof result.engineersWithoutProjects === "number") lines.push(`👷 ${t.engineersWithoutProjects}${sep}${result.engineersWithoutProjects}`);
  if (query.domain === "project" && !query.groupBy && typeof result.archivedProjects === "number") lines.push(`🗄️ ${t.archived}${sep}${result.archivedProjects}`);
  if (query.domain === "industrial" && !query.groupBy && typeof result.totalQuantity === "number") lines.push(`⚙️ ${t.quantity}${sep}${result.totalQuantity}`);
  return lines;
}

function table(query, groups, l) {
  const [dimSing] = dimNames(query.groupBy, l);
  const unitHeader = UNITS[query.domain][l][l === "ru" ? 2 : 1];
  const header = `| ${dimSing.charAt(0).toUpperCase()}${dimSing.slice(1)} | ${unitHeader.charAt(0).toUpperCase()}${unitHeader.slice(1)} |`;
  const rows = groups.map((g) => `| ${escapeCell(g.label)} | ${g.count} |`);
  return [header, "|---|---:|", ...rows].join("\n");
}

function buildAnalyticsAnswer({ query, result, tool }) {
  const l = lang(query.language);
  const t = T[l];
  const title = `${TITLES[query.domain][l]}${query.groupBy ? ` — ${dimNames(query.groupBy, l)[2]}` : ""}`;
  const lines = [title, ""];
  const total = totalOf(result, query.domain) || 0;

  if (query.operation === "list_without_relance") {
    if (!result.total) lines.push(t.withoutRelanceNone);
    else {
      lines.push(t.withoutRelance(result.total), "", t.oldestFirst);
      for (const c of result.contacts || []) {
        const name = [c.prenom, c.nom].filter(Boolean).join(" ") || "—";
        lines.push(`• ${name}${c.nomSociete ? ` — ${c.nomSociete}` : ""}${c.statut ? ` (${c.statut})` : ""}`);
      }
      if (result.truncated) lines.push(t.more(result.total - (result.contacts || []).length, UNITS.contact[l][l === "ru" ? 2 : 1]));
    }
    lines.push("", ...contextLines(query, result, l), "", t.source(tool));
    return lines.join("\n");
  }

  if (!query.groupBy) {
    if (!total) lines.push(t.emptyTotal(UNITS[query.domain][l][l === "ru" ? 2 : 0]));
    else lines.push(t.totalSentence(total, UNITS[query.domain][l][l === "ru" ? 2 : 1]));
    lines.push("", ...footerKpis(query, result, l), "", ...contextLines(query, result, l), "", t.source(tool));
    return lines.join("\n");
  }

  const [dimSing, dimPlural] = dimNames(query.groupBy, l);
  const unitPlural = UNITS[query.domain][l][l === "ru" ? 2 : 1];
  const groups = result.groups || [];

  if (!groups.length) {
    lines.push(t.empty(UNITS[query.domain][l][0], dimSing));
    lines.push("", ...footerKpis(query, result, l), "", ...contextLines(query, result, l), "", t.source(tool));
    return lines.join("\n");
  }

  if (query.operation === "max" || query.operation === "min") {
    const edge = groups[0].count;
    const tied = groups.filter((g) => g.count === edge);
    if (tied.length === 1) lines.push(query.operation === "max" ? t.topOne(dimSing, edge, unitPlural) : t.minOne(dimSing, unitPlural));
    else lines.push(query.operation === "max" ? t.topTie(dimPlural, edge, unitPlural) : t.minTie(dimPlural, edge, unitPlural));
    lines.push("");
    const icon = DIMENSION_ICONS[query.groupBy] || "•";
    for (const g of tied) lines.push(`${icon} **${escapeCell(g.label)}** — ${count(query.domain, g.count, l)}`);
    if (tied.length === groups.length && result.truncated) lines.push(t.more(result.groupCount - tied.length, dimPlural));
    if (query.operation === "min") lines.push("", t.minNote(dimPlural, UNITS[query.domain][l][0]));
    lines.push("", t.distribution, "", table(query, groups, l));
  } else if (query.operation === "top") {
    lines.push(t.ranking(groups.length, dimPlural), "", table(query, groups, l));
  } else if (query.operation === "average") {
    const avg = result.groupCount ? Math.round((result.withDimension / result.groupCount) * 10) / 10 : 0;
    lines.push(t.average(String(avg).replace(".", l === "en" ? "." : ","), unitPlural, dimSing, dimPlural, result.groupCount, result.withDimension));
  } else {
    lines.push(t.distribution, "", table(query, groups, l));
  }
  if (query.operation !== "average" && result.truncated && !(query.operation === "max" || query.operation === "min")) {
    lines.push("", t.more(result.groupCount - groups.length, dimPlural));
  }

  lines.push("", ...footerKpis(query, result, l), "", ...contextLines(query, result, l), "", t.source(tool));
  return lines.join("\n");
}

function buildAnalyticsErrorAnswer(kind, language) {
  const l = lang(language);
  return (ERRORS[kind] || ERRORS.failure)[l];
}

// ── Ingénieurs (intention `engineers`) ──────────────────────────────────────
const ENGINEERS = {
  fr: {
    title: "👥 Ingénieurs du CRM",
    found: (n) => `J'ai trouvé **${n}** ingénieur${n > 1 ? "s" : ""} référencé${n > 1 ? "s" : ""} dans le CRM :`,
    empty: "Aucun ingénieur n'est actuellement disponible dans les données CRM auxquelles vous avez accès.",
    header: "| N° | Ingénieur |",
    shown: (from, to, total) => `Affichage de ${from} à ${to} sur ${total}.`,
    next: "Pour voir la suite, écrivez « Afficher les suivants ».",
    nextLabel: "Afficher les suivants",
    total: (n) => `Total : ${n} ingénieur${n > 1 ? "s" : ""}.`,
    note: "La fiche ingénieur ne comporte pas de statut de disponibilité : cette liste recense les ingénieurs référencés.",
    projectTitle: (name) => `👷 Ingénieur du projet « ${name} »`,
    noProject: (name) => `Je n'ai trouvé aucun projet correspondant à « ${name} » parmi les projets auxquels vous avez accès.`,
    noEngineer: "aucun ingénieur renseigné",
    several: (n) => `${n} projets correspondent à cette recherche :`,
    scopeMine: "Périmètre : vos projets uniquement (droits de votre rôle).",
  },
  en: {
    title: "👥 CRM engineers",
    found: (n) => `I found **${n}** engineer${n > 1 ? "s" : ""} registered in the CRM:`,
    empty: "No engineer is currently available in the CRM data you have access to.",
    header: "| # | Engineer |",
    shown: (from, to, total) => `Showing ${from} to ${to} of ${total}.`,
    next: 'To see more, type "Show more".',
    nextLabel: "Show more",
    total: (n) => `Total: ${n} engineer${n > 1 ? "s" : ""}.`,
    note: "Engineer records have no availability status: this list shows the registered engineers.",
    projectTitle: (name) => `👷 Engineer of project "${name}"`,
    noProject: (name) => `I found no project matching "${name}" among the projects you have access to.`,
    noEngineer: "no engineer assigned",
    several: (n) => `${n} projects match this search:`,
    scopeMine: "Scope: your own projects only (your role's permissions).",
  },
  ru: {
    title: "👥 Инженеры CRM",
    found: (n) => `В CRM найдено инженеров: **${n}**.`,
    empty: "В доступных вам данных CRM сейчас нет ни одного инженера.",
    header: "| № | Инженер |",
    shown: (from, to, total) => `Показаны с ${from} по ${to} из ${total}.`,
    next: "Чтобы увидеть продолжение, напишите «Показать ещё».",
    nextLabel: "Показать ещё",
    total: (n) => `Всего инженеров: ${n}.`,
    note: "В карточке инженера нет статуса доступности: в списке — все зарегистрированные инженеры.",
    projectTitle: (name) => `👷 Инженер проекта «${name}»`,
    noProject: (name) => `Среди доступных вам проектов не найдено проекта «${name}».`,
    noEngineer: "инженер не указан",
    several: (n) => `Найдено проектов: ${n}.`,
    scopeMine: "Область: только ваши проекты (права вашей роли).",
  },
};

function buildEngineersAnswer({ query, result, tool }) {
  const l = lang(query.language);
  const t = ENGINEERS[l];
  const source = T[l].source(tool);

  if (query.operation === "of_project") {
    const lines = [t.projectTitle(result.projectName), ""];
    if (!result.matches.length) {
      lines.push(t.noProject(result.projectName));
    } else {
      if (result.matches.length > 1) lines.push(t.several(result.matches.length), "");
      for (const m of result.matches) {
        lines.push(`📁 **${escapeCell(m.projectName)}** → ${m.engineer ? `👷 **${escapeCell(m.engineer.name)}**` : `❔ ${t.noEngineer}`}`);
      }
    }
    if (result.scope === "mine") lines.push("", t.scopeMine);
    lines.push("", source);
    return lines.join("\n");
  }

  if (!result.total) return [t.title, "", t.empty, "", source].join("\n");
  const lines = [t.title, "", t.found(result.total), "", t.header, "|---:|---|"];
  const offset = Number.isInteger(result.offset) ? result.offset : 0;
  result.items.forEach((e, i) => lines.push(`| ${offset + i + 1} | ${escapeCell(e.name)} |`));
  lines.push("");
  if (result.truncated || offset > 0) lines.push(t.shown(offset + 1, offset + result.items.length, result.total));
  if (result.truncated) lines.push(t.next);
  lines.push(t.total(result.total), "", `ℹ️ ${t.note}`, "", source);
  return lines.join("\n");
}

function engineersNextLabel(language) {
  return ENGINEERS[lang(language)].nextLabel;
}

module.exports = { buildAnalyticsAnswer, buildAnalyticsErrorAnswer, buildEngineersAnswer, engineersNextLabel, ruPlural };
