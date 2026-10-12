"use strict";

/**
 * # entityLookupAnswerBuilder — fiche d'une personne, d'une société, d'un promoteur (FR/EN/RU)
 *
 * Met en mots, de façon déterministe, ce que les Tools ont renvoyé :
 * - la partie CRM est toujours annoncée comme « données internes du CRM » ;
 * - la partie Web comme « informations publiques », chaque extrait étant
 *   rattaché à SA source (titre + lien renvoyés par le moteur, jamais écrits ici) ;
 * - une absence de résultat est dite telle quelle.
 * Aucun modèle de langage : rien ne peut être inventé, reformulé ou attribué
 * à la mauvaise source.
 */

const T = {
  fr: {
    crmSection: "### Profil CRM",
    crmSource: "_Source : données internes du CRM_",
    webSection: "### 🌐 Informations publiques",
    webIntro: "Les recherches publiques disponibles indiquent :",
    webSource: "_Source : recherche Web — informations publiques, non vérifiées par le CRM_",
    sources: "### 🔗 Sources Web",
    sourcesUnverified: "### 🔗 Pages publiques portant ce nom (identité non vérifiée)",
    name: "Nom",
    role: "Fonction",
    engineerRole: "Ingénieur référencé dans le CRM",
    companyRole: "Société référencée dans le CRM",
    projects: (n) => `Projets associés (${n})`,
    noProjects: "Aucun projet associé",
    scopeMine: " dans votre périmètre",
    more: (n) => `… et ${n} autre${n > 1 ? "s" : ""}`,
    archived: "archivé",
    fuzzy: (asked, found) => `ℹ️ Aucune correspondance exacte pour « ${asked} » : voici le nom le plus proche, **${found}**. Vérifiez qu'il s'agit bien de la bonne personne.`,
    according: (s) => `Selon ${s}`,
    notInCrm: { engineer: "Je ne trouve pas cet ingénieur dans le CRM.", company: "Je ne trouve pas cette société dans le CRM.", unknown: "Je ne trouve pas ce nom dans le CRM." },
    notFound: (name) => `Aucun contact, ingénieur ni société nommé « ${name} » n'a été trouvé dans les données du CRM auxquelles vous avez accès.`,
    whichPerson: "De quelle personne ou société souhaitez-vous les informations ? Indiquez son nom.",
    offerWeb: "Je peux rechercher des informations publiques sur le Web.",
    webNothing: "Je n'ai pas trouvé de source publique suffisamment fiable pour confirmer cette information.",
    webNothingForRecord: "Aucune information publique suffisamment fiable n'a été trouvée.",
    webNothingForPerson: "Je n'ai trouvé aucune information publique suffisamment fiable pour cette personne.",
    webOff: "La recherche Web n'est pas encore configurée sur ce serveur : seules les données du CRM sont disponibles.",
    webFailed: "Les données CRM sont disponibles, mais la recherche Web est temporairement indisponible.",
    webFailedAlone: "La recherche Web est momentanément indisponible. Veuillez réessayer dans quelques instants.",
    webReasons: {
      invalid_key: "La recherche Web n'a pas pu être effectuée : la clé du fournisseur est refusée. L'administrateur doit vérifier la configuration du serveur.",
      quota_exceeded: "La recherche Web n'a pas pu être effectuée : le quota du fournisseur est épuisé. L'administrateur doit vérifier l'abonnement.",
      rate_limited: "La recherche Web est momentanément limitée (trop de requêtes). Réessayez dans une minute.",
      timeout: "La recherche Web n'a pas répondu dans le délai imparti. Réessayez dans quelques instants.",
    },
    webCrmStillThere: "Les données du CRM ci-dessus restent complètes.",
    badge: { crm: "🔵 Données CRM", web: "🌐 Recherche Web", sources: "🔗 Sources" },
    summary: "**Synthèse** _(rédigée automatiquement à partir des sources ci-dessous)_",
    identityUnconfirmed: (name) => `⚠️ J'ai trouvé des informations publiques correspondant au nom ${name}, mais je ne peux pas confirmer qu'elles correspondent à la même personne que celle enregistrée dans le CRM.`,
    identityUnconfirmedNoCrm: (name) => `⚠️ J'ai trouvé des informations publiques correspondant au nom ${name}, mais je ne peux pas confirmer de quelle personne il s'agit.`,
    identityProbable: "ℹ️ Ces résultats mentionnent ce nom dans un contexte professionnel concordant ; rien ne permet toutefois de confirmer avec certitude qu'il s'agit de la même personne.",
    crmFailed: "Je n'ai pas pu consulter le CRM pour cette demande. Veuillez réessayer.",
    denied: "Vous n'avez pas l'autorisation de consulter cette information dans le CRM.",
    ambiguous: (n, name) => `J'ai trouvé ${n} résultats correspondant à « ${name} » dans le CRM. Lequel souhaitez-vous consulter ?`,
    kinds: { engineer: "Ingénieur", architect: "Architecte", contact: "Contact commercial", company: "Société" },
    projectsOf: (name, n, scope) => `Selon les données internes du CRM, **${name}** est associé à **${n}** projet${n > 1 ? "s" : ""}${scope} :`,
    noProjectsOf: (name, scope) => `Selon les données internes du CRM, aucun projet n'est associé à **${name}**${scope}.`,
    promoterKnown: (project, promoter) => `Selon les données internes du CRM, le promoteur du projet **${project}** est **${promoter}**.`,
    promoterUnknown: (project) => `Le promoteur du projet **${project}** n'est pas renseigné dans le CRM.`,
    promoterWebHint: "Voici les sources publiques qui mentionnent ce projet — elles peuvent indiquer son promoteur :",
    projectNotFound: (name) => `Je ne trouve pas le projet${name ? ` « ${name} »` : ""} dans le CRM (ou il est hors de votre périmètre).`,
    severalProjects: (n) => `${n} projets correspondent. Lequel souhaitez-vous consulter ?`,
    promoters: {
      title: "🏢 Promoteurs du CRM",
      found: (n) => `J'ai trouvé **${n}** promoteur${n > 1 ? "s" : ""} dans le CRM :`,
      none: "Je n'ai trouvé aucun promoteur dans les données CRM accessibles avec votre rôle.",
      projects: (n) => `${n} projet${n > 1 ? "s" : ""}`,
      shown: (from, to, total) => `Affichage ${from}–${to} sur ${total}.`,
      next: "Pour voir la suite, écrivez « Afficher les suivants ».",
      nextLabel: "Afficher les suivants",
      note: "Liste établie à partir du champ « promoteur » des projets ; un même promoteur saisi sous deux orthographes apparaît deux fois.",
      scopeMine: "Périmètre : vos projets uniquement (droits de votre rôle).",
      projectsOf: (name, n) => `Selon les données internes du CRM, le promoteur **${name}** a **${n}** projet${n > 1 ? "s" : ""} :`,
      notFound: (name) => `Je ne trouve aucun promoteur nommé « ${name} » dans les données CRM accessibles avec votre rôle.`,
      several: (n, name) => `${n} promoteurs correspondent à « ${name} ». Lequel souhaitez-vous consulter ?`,
    },
    companies: {
      title: "🏢 Sociétés du CRM",
      found: (n) => `J'ai trouvé **${n}** société${n > 1 ? "s" : ""} dans le CRM :`,
      none: "Je n'ai trouvé aucune société dans les données CRM accessibles avec votre rôle.",
      projects: (n) => (n ? `${n} projet${n > 1 ? "s" : ""}` : "aucun projet"),
      shown: (from, to, total) => `Affichage ${from}–${to} sur ${total}.`,
      next: "Pour voir la suite, écrivez « Afficher les suivants ».",
      nextLabel: "Afficher les suivants",
      scopeMine: "Nombre de projets : vos projets uniquement (droits de votre rôle).",
      foundWith: (n, scope = "") => `J'ai trouvé **${n}** société${n > 1 ? "s" : ""} ayant au moins un projet${scope} :`,
      foundWithout: (n, scope = "") => `J'ai trouvé **${n}** société${n > 1 ? "s" : ""} sans projet associé${scope} :`,
      noneWith: "Aucune société n'a de projet associé.",
      noneWithout: "Toutes les sociétés ont au moins un projet associé.",
      inScope: " dans votre périmètre",
      scopeFilter: "Critère évalué sur vos projets uniquement (droits de votre rôle) : une société peut avoir des projets que vous ne voyez pas.",
      scopeProjects: "Projets affichés : les vôtres uniquement (droits de votre rôle).",
      noProject: "aucun projet associé",
      noProjectInScope: "aucun projet dans votre périmètre",
      hidden: (n) => `🔒 ${n} projet${n > 1 ? "s" : ""} hors de votre périmètre`,
      moreProjects: (n) => `… et ${n} autre${n > 1 ? "s" : ""}`,
      projectsFailed: "⚠️ Les projets n'ont pas pu être récupérés : seuls les noms des sociétés sont affichés. Cela ne signifie pas qu'elles n'ont aucun projet.",
      count: (n) => `Le CRM compte **${n}** société${n > 1 ? "s" : ""}.`,
      countWith: (n, all, scope) => `**${n}** société${n > 1 ? "s ont" : " a"} au moins un projet${scope}, sur ${all} dans le CRM.`,
      countWithout: (n, all, scope) => `**${n}** société${n > 1 ? "s n'ont" : " n'a"} aucun projet${scope}, sur ${all} dans le CRM.`,
    },
    machines: {
      title: "⚙️ Machines du CRM",
      found: (n) => `J'ai trouvé **${n}** machine${n > 1 ? "s" : ""} dans le référentiel de production :`,
      none: "Je n'ai trouvé aucune machine dans le référentiel de production.",
      header: "| Code | Nom | Ligne | Statut |",
      status: { ACTIVE: "Active", INACTIVE: "Inactive" },
    },
    promoterLabel: "promoteur",
    notSet: "non renseigné",
    clarify: {
      whichProject: "De quel projet souhaitez-vous connaître le promoteur ? Indiquez son nom ou ouvrez sa fiche.",
      whichEngineer: "De quel ingénieur parlez-vous ? Indiquez son nom.",
      whichCompany: "De quelle société parlez-vous ? Indiquez son nom.",
    },
    sourceKinds: { official: "Site officiel", institutional: "Source institutionnelle", linkedin: "LinkedIn", press: "Presse", other: "Autre source" },
  },
  en: {
    crmSection: "### CRM profile",
    crmSource: "_Source: internal CRM data_",
    webSection: "### 🌐 Public information",
    webIntro: "Available public sources indicate:",
    webSource: "_Source: Web search — public information, not verified by the CRM_",
    sources: "### 🔗 Web sources",
    sourcesUnverified: "### 🔗 Public pages bearing this name (identity not verified)",
    name: "Name",
    role: "Role",
    engineerRole: "Engineer registered in the CRM",
    companyRole: "Company registered in the CRM",
    projects: (n) => `Related projects (${n})`,
    noProjects: "No related project",
    scopeMine: " within your scope",
    more: (n) => `… and ${n} more`,
    archived: "archived",
    fuzzy: (asked, found) => `ℹ️ No exact match for "${asked}": the closest name is **${found}**. Please check that this is the right person.`,
    according: (s) => `According to ${s}`,
    notInCrm: { engineer: "I cannot find this engineer in the CRM.", company: "I cannot find this company in the CRM.", unknown: "I cannot find this name in the CRM." },
    notFound: (name) => `No contact, engineer or company named "${name}" was found in the CRM data you have access to.`,
    whichPerson: "Which person or company do you want information about? Please give a name.",
    offerWeb: "I can look for public information on the Web.",
    webNothing: "I did not find a sufficiently reliable public source to confirm this information.",
    webNothingForRecord: "No sufficiently reliable public information was found.",
    webNothingForPerson: "I found no sufficiently reliable public information about this person.",
    webOff: "Web search is not configured on this server yet: only CRM data is available.",
    webFailed: "CRM data is available, but Web search is temporarily unavailable.",
    webFailedAlone: "Web search is temporarily unavailable. Please try again in a moment.",
    webReasons: {
      invalid_key: "Web search could not run: the provider key was rejected. The administrator must check the server configuration.",
      quota_exceeded: "Web search could not run: the provider quota is exhausted. The administrator must check the subscription.",
      rate_limited: "Web search is temporarily rate-limited (too many requests). Try again in a minute.",
      timeout: "Web search did not answer in time. Please try again in a moment.",
    },
    webCrmStillThere: "The CRM data above is complete.",
    badge: { crm: "🔵 CRM data", web: "🌐 Web search", sources: "🔗 Sources" },
    summary: "**Summary** _(written automatically from the sources below)_",
    identityUnconfirmed: (name) => `⚠️ I found public information matching the name ${name}, but I cannot confirm that it refers to the same person as the one recorded in the CRM.`,
    identityUnconfirmedNoCrm: (name) => `⚠️ I found public information matching the name ${name}, but I cannot confirm which person it refers to.`,
    identityProbable: "ℹ️ These results mention this name in a matching professional context; nothing confirms with certainty that it is the same person.",
    crmFailed: "I could not query the CRM for this request. Please try again.",
    denied: "You are not allowed to view this information in the CRM.",
    ambiguous: (n, name) => `I found ${n} results matching "${name}" in the CRM. Which one would you like to see?`,
    kinds: { engineer: "Engineer", architect: "Architect", contact: "Sales contact", company: "Company" },
    projectsOf: (name, n, scope) => `According to internal CRM data, **${name}** is linked to **${n}** project${n > 1 ? "s" : ""}${scope}:`,
    noProjectsOf: (name, scope) => `According to internal CRM data, no project is linked to **${name}**${scope}.`,
    promoterKnown: (project, promoter) => `According to internal CRM data, the developer of project **${project}** is **${promoter}**.`,
    promoterUnknown: (project) => `The developer of project **${project}** is not recorded in the CRM.`,
    promoterWebHint: "Here are the public sources mentioning this project — they may name its developer:",
    projectNotFound: (name) => `I cannot find the project${name ? ` "${name}"` : ""} in the CRM (or it is outside your scope).`,
    severalProjects: (n) => `${n} projects match. Which one would you like to see?`,
    promoters: {
      title: "🏢 CRM developers",
      found: (n) => `I found **${n}** developer${n > 1 ? "s" : ""} in the CRM:`,
      none: "I found no developer in the CRM data accessible with your role.",
      projects: (n) => `${n} project${n > 1 ? "s" : ""}`,
      shown: (from, to, total) => `Showing ${from}–${to} of ${total}.`,
      next: 'To see more, type "Show more".',
      nextLabel: "Show more",
      note: "List built from the \"developer\" field of projects; a developer entered under two spellings appears twice.",
      scopeMine: "Scope: your own projects only (your role's permissions).",
      projectsOf: (name, n) => `According to internal CRM data, developer **${name}** has **${n}** project${n > 1 ? "s" : ""}:`,
      notFound: (name) => `I cannot find any developer named "${name}" in the CRM data accessible with your role.`,
      several: (n, name) => `${n} developers match "${name}". Which one would you like to see?`,
    },
    companies: {
      title: "🏢 CRM companies",
      found: (n) => `I found **${n}** compan${n > 1 ? "ies" : "y"} in the CRM:`,
      none: "I found no company in the CRM data accessible with your role.",
      projects: (n) => (n ? `${n} project${n > 1 ? "s" : ""}` : "no project"),
      shown: (from, to, total) => `Showing ${from}–${to} of ${total}.`,
      next: 'To see more, type "Show more".',
      nextLabel: "Show more",
      scopeMine: "Project counts: your own projects only (your role's permissions).",
      foundWith: (n, scope = "") => `I found **${n}** compan${n > 1 ? "ies" : "y"} with at least one project${scope}:`,
      foundWithout: (n, scope = "") => `I found **${n}** compan${n > 1 ? "ies" : "y"} with no related project${scope}:`,
      noneWith: "No company has a related project.",
      noneWithout: "Every company has at least one related project.",
      inScope: " within your scope",
      scopeFilter: "Criterion evaluated on your own projects only (your role's permissions): a company may have projects you cannot see.",
      scopeProjects: "Projects shown: your own only (your role's permissions).",
      noProject: "no related project",
      noProjectInScope: "no project within your scope",
      hidden: (n) => `🔒 ${n} project${n > 1 ? "s" : ""} outside your scope`,
      moreProjects: (n) => `… and ${n} more`,
      projectsFailed: "⚠️ Projects could not be retrieved: only company names are shown. This does not mean they have no project.",
      count: (n) => `The CRM holds **${n}** compan${n > 1 ? "ies" : "y"}.`,
      countWith: (n, all, scope) => `**${n}** compan${n > 1 ? "ies have" : "y has"} at least one project${scope}, out of ${all} in the CRM.`,
      countWithout: (n, all, scope) => `**${n}** compan${n > 1 ? "ies have" : "y has"} no project${scope}, out of ${all} in the CRM.`,
    },
    machines: {
      title: "⚙️ CRM machines",
      found: (n) => `I found **${n}** machine${n > 1 ? "s" : ""} in the production registry:`,
      none: "I found no machine in the production registry.",
      header: "| Code | Name | Line | Status |",
      status: { ACTIVE: "Active", INACTIVE: "Inactive" },
    },
    promoterLabel: "developer",
    notSet: "not recorded",
    clarify: {
      whichProject: "Which project's developer are you asking about? Give its name or open its record.",
      whichEngineer: "Which engineer do you mean? Please give a name.",
      whichCompany: "Which company do you mean? Please give its name.",
    },
    sourceKinds: { official: "Official website", institutional: "Institutional source", linkedin: "LinkedIn", press: "Press", other: "Other source" },
  },
  ru: {
    crmSection: "### Профиль в CRM",
    crmSource: "_Источник: внутренние данные CRM_",
    webSection: "### 🌐 Публичная информация",
    webIntro: "Доступные публичные источники сообщают:",
    webSource: "_Источник: поиск в интернете — публичные сведения, не проверенные CRM_",
    sources: "### 🔗 Источники",
    sourcesUnverified: "### 🔗 Публичные страницы с этим именем (личность не подтверждена)",
    name: "Имя",
    role: "Должность",
    engineerRole: "Инженер, зарегистрированный в CRM",
    companyRole: "Компания, зарегистрированная в CRM",
    projects: (n) => `Связанные проекты (${n})`,
    noProjects: "Связанных проектов нет",
    scopeMine: " в вашей зоне доступа",
    more: (n) => `… и ещё ${n}`,
    archived: "в архиве",
    fuzzy: (asked, found) => `ℹ️ Точного совпадения для «${asked}» нет: ближайшее имя — **${found}**. Проверьте, что это нужный человек.`,
    according: (s) => `По данным ${s}`,
    notInCrm: { engineer: "Я не нахожу этого инженера в CRM.", company: "Я не нахожу эту компанию в CRM.", unknown: "Я не нахожу это имя в CRM." },
    notFound: (name) => `В доступных вам данных CRM не найдено ни контакта, ни инженера, ни компании с именем «${name}».`,
    whichPerson: "О каком человеке или компании нужна информация? Укажите имя.",
    offerWeb: "Я могу поискать публичную информацию в интернете.",
    webNothing: "Я не нашёл достаточно надёжного публичного источника, чтобы подтвердить эту информацию.",
    webNothingForRecord: "Достаточно надёжной публичной информации не найдено.",
    webNothingForPerson: "Я не нашёл достаточно надёжной публичной информации об этом человеке.",
    webOff: "Поиск в интернете на этом сервере пока не настроен: доступны только данные CRM.",
    webFailed: "Данные CRM доступны, но поиск в интернете временно недоступен.",
    webFailedAlone: "Поиск в интернете временно недоступен. Повторите попытку чуть позже.",
    webReasons: {
      invalid_key: "Поиск в интернете не выполнен: ключ поставщика отклонён. Администратору нужно проверить настройки сервера.",
      quota_exceeded: "Поиск в интернете не выполнен: квота поставщика исчерпана. Администратору нужно проверить подписку.",
      rate_limited: "Поиск в интернете временно ограничен (слишком много запросов). Повторите через минуту.",
      timeout: "Поиск в интернете не ответил вовремя. Повторите попытку чуть позже.",
    },
    webCrmStillThere: "Данные CRM выше полные.",
    badge: { crm: "🔵 Данные CRM", web: "🌐 Поиск в интернете", sources: "🔗 Источники" },
    summary: "**Сводка** _(составлена автоматически по источникам ниже)_",
    identityUnconfirmed: (name) => `⚠️ Я нашёл публичную информацию по имени ${name}, но не могу подтвердить, что она относится к тому же человеку, что записан в CRM.`,
    identityUnconfirmedNoCrm: (name) => `⚠️ Я нашёл публичную информацию по имени ${name}, но не могу подтвердить, о каком человеке идёт речь.`,
    identityProbable: "ℹ️ В этих результатах имя встречается в подходящем профессиональном контексте; однако нельзя с уверенностью подтвердить, что это тот же человек.",
    crmFailed: "Не удалось обратиться к CRM по этому запросу. Попробуйте ещё раз.",
    denied: "У вас нет прав на просмотр этой информации в CRM.",
    ambiguous: (n, name) => `В CRM найдено ${n} результатов по запросу «${name}». Какой из них показать?`,
    kinds: { engineer: "Инженер", architect: "Архитектор", contact: "Коммерческий контакт", company: "Компания" },
    projectsOf: (name, n, scope) => `По внутренним данным CRM, **${name}** связан с проектами (${n})${scope}:`,
    noProjectsOf: (name, scope) => `По внутренним данным CRM, с **${name}** не связан ни один проект${scope}.`,
    promoterKnown: (project, promoter) => `По внутренним данным CRM, застройщик проекта **${project}** — **${promoter}**.`,
    promoterUnknown: (project) => `Застройщик проекта **${project}** в CRM не указан.`,
    promoterWebHint: "Публичные источники, упоминающие этот проект, — в них может быть указан застройщик:",
    projectNotFound: (name) => `Я не нахожу проект${name ? ` «${name}»` : ""} в CRM (или он вне вашей зоны доступа).`,
    severalProjects: (n) => `Подходят проекты: ${n}. Какой из них показать?`,
    promoters: {
      title: "🏢 Застройщики в CRM",
      found: (n) => `В CRM найдено застройщиков: **${n}**.`,
      none: "В данных CRM, доступных для вашей роли, застройщиков не найдено.",
      projects: (n) => `проектов: ${n}`,
      shown: (from, to, total) => `Показаны ${from}–${to} из ${total}.`,
      next: "Чтобы увидеть продолжение, напишите «Показать ещё».",
      nextLabel: "Показать ещё",
      note: "Список составлен по полю «застройщик» в проектах; один и тот же застройщик, записанный по-разному, показан дважды.",
      scopeMine: "Область: только ваши проекты (права вашей роли).",
      projectsOf: (name, n) => `По внутренним данным CRM, у застройщика **${name}** проектов: **${n}**.`,
      notFound: (name) => `В данных CRM, доступных для вашей роли, нет застройщика «${name}».`,
      several: (n, name) => `По запросу «${name}» найдено застройщиков: ${n}. Какой из них показать?`,
    },
    companies: {
      title: "🏢 Компании в CRM",
      found: (n) => `В CRM найдено компаний: **${n}**.`,
      none: "В данных CRM, доступных для вашей роли, компаний не найдено.",
      projects: (n) => (n ? `проектов: ${n}` : "нет проектов"),
      shown: (from, to, total) => `Показаны ${from}–${to} из ${total}.`,
      next: "Чтобы увидеть продолжение, напишите «Показать ещё».",
      nextLabel: "Показать ещё",
      scopeMine: "Количество проектов: только ваши проекты (права вашей роли).",
      foundWith: (n, scope = "") => `Компаний хотя бы с одним проектом${scope}: **${n}**.`,
      foundWithout: (n, scope = "") => `Компаний без связанных проектов${scope}: **${n}**.`,
      noneWith: "Ни у одной компании нет связанного проекта.",
      noneWithout: "У каждой компании есть хотя бы один связанный проект.",
      inScope: " в вашей зоне доступа",
      scopeFilter: "Условие проверено только по вашим проектам (права вашей роли): у компании могут быть проекты, которых вы не видите.",
      scopeProjects: "Показаны только ваши проекты (права вашей роли).",
      noProject: "связанных проектов нет",
      noProjectInScope: "в вашей зоне доступа проектов нет",
      hidden: (n) => `🔒 проектов вне вашей зоны доступа: ${n}`,
      moreProjects: (n) => `… и ещё ${n}`,
      projectsFailed: "⚠️ Не удалось получить проекты: показаны только названия компаний. Это не значит, что у них нет проектов.",
      count: (n) => `В CRM компаний: **${n}**.`,
      countWith: (n, all, scope) => `Компаний хотя бы с одним проектом${scope}: **${n}** из ${all}.`,
      countWithout: (n, all, scope) => `Компаний без проектов${scope}: **${n}** из ${all}.`,
    },
    machines: {
      title: "⚙️ Машины в CRM",
      found: (n) => `В производственном справочнике найдено машин: **${n}**.`,
      none: "В производственном справочнике машин не найдено.",
      header: "| Код | Название | Линия | Статус |",
      status: { ACTIVE: "Активна", INACTIVE: "Неактивна" },
    },
    promoterLabel: "застройщик",
    notSet: "не указан",
    clarify: {
      whichProject: "О застройщике какого проекта идёт речь? Назовите проект или откройте его карточку.",
      whichEngineer: "О каком инженере идёт речь? Укажите имя.",
      whichCompany: "О какой компании идёт речь? Укажите название.",
    },
    sourceKinds: { official: "Официальный сайт", institutional: "Официальный источник", linkedin: "LinkedIn", press: "Пресса", other: "Другой источник" },
  },
};

const { buildRecordLines, buildFieldLines } = require("./crmRecordAnswerBuilder");

function strings(language) {
  return T[language] || T.fr;
}

// Texte venu du CRM ou du Web : jamais interprété comme du Markdown.
function plain(text) {
  return String(text == null ? "" : text).replace(/[\r\n]+/g, " ").replace(/([\\`*_[\]<>|])/g, "\\$1").trim();
}

function link(result) {
  return `[${plain(result.title)}](${String(result.url).replace(/[()\s]/g, encodeURIComponent)})`;
}

function projectLines(t, projects, scopeMine) {
  if (!projects) return [];
  if (!projects.total) return [`- ${t.noProjects}${scopeMine ? t.scopeMine : ""}`];
  const lines = [`- ${t.projects(projects.total)}${scopeMine ? t.scopeMine : ""} :`];
  for (const p of projects.items) {
    const details = [p.statut ? plain(p.statut) : null, p.archived ? t.archived : null].filter(Boolean).join(", ");
    lines.push(`  - 📁 ${plain(p.name)}${details ? ` — ${details}` : ""}`);
  }
  if (projects.total > projects.items.length) lines.push(`  - ${t.more(projects.total - projects.items.length)}`);
  return lines;
}

// Bloc Web : mise en garde d'identité, synthèse ou extraits (chacun rattaché à
// SA source), puis la liste numérotée des sources. `hasCrm` : la réponse
// contient déjà des données du CRM (formulation de l'indisponibilité).
function webLines(t, web, { intro = null, hasCrm = true, name = "" } = {}) {
  if (!web || web.status === "skipped") return [];
  if (web.status === "not_configured") return ["", `ℹ️ ${t.webOff}`];
  if (web.status === "failed") {
    const known = web.reason && t.webReasons[web.reason];
    if (known) return ["", `⚠️ ${known}${hasCrm ? ` ${t.webCrmStillThere}` : ""}`];
    return ["", `⚠️ ${hasCrm ? t.webFailed : t.webFailedAlone}`];
  }
  if (!web.results.length) {
    const personal = web.entity === "engineer" || web.entity === "person";
    return ["", t.webSection, personal ? t.webNothingForPerson : hasCrm ? t.webNothingForRecord : t.webNothing];
  }

  const lines = ["", t.webSection, t.webSource, ""];
  const person = web.entity === "engineer" || web.entity === "person";
  // Identité non établie : on signale que des pages portent ce nom et on
  // donne leurs liens, sans reprendre leur contenu — les détails d'un
  // homonyme ne sont jamais attribués à la personne du CRM.
  if (person && web.identity === "unconfirmed") {
    lines.push((hasCrm ? t.identityUnconfirmed : t.identityUnconfirmedNoCrm)(plain(name)), "", t.sourcesUnverified);
    web.results.forEach((r, i) => lines.push(`${i + 1}. ${link(r)} — ${t.sourceKinds[r.sourceKind] || t.sourceKinds.other} (${plain(r.source)})`));
    return lines;
  }
  if (person && web.identity === "probable") lines.push(t.identityProbable, "");
  if (intro) lines.push(intro, "");
  if (web.summary) {
    lines.push(t.summary, plain(web.summary).replace(/\\\[(\d+)\\\]/g, "[$1]"));
  } else {
    if (!intro && web.results.some((r) => r.snippet)) lines.push(t.webIntro, "");
    web.results.forEach((r, i) => {
      if (r.snippet) lines.push(`- ${t.according(link(r))} [${i + 1}] : « ${plain(r.snippet)} »`);
    });
  }
  lines.push("", t.sources);
  web.results.forEach((r, i) => {
    lines.push(`${i + 1}. ${link(r)} — ${t.sourceKinds[r.sourceKind] || t.sourceKinds.other} (${plain(r.source)})`);
  });
  return lines;
}

// « 🔵 Données CRM · 🌐 Recherche Web · 🔗 Sources » — uniquement ce qui a
// réellement été consulté : jamais « Web » si le moteur n'a pas répondu.
function badgeLine(t, { crm, web }) {
  const parts = [];
  if (crm) parts.push(t.badge.crm);
  if (web && web.status === "ok") {
    parts.push(t.badge.web);
    if (web.results.length) parts.push(t.badge.sources);
  }
  return parts.length > 1 ? [parts.join(" · "), ""] : [];
}

function buildClarificationAnswer(key, language) {
  const t = strings(language);
  return t.clarify[key] || t.whichPerson;
}

function buildErrorAnswer(kind, language) {
  const t = strings(language);
  return kind === "denied" ? t.denied : t.crmFailed;
}

/**
 * @param {{ route: object, crm: object|null, web: {status, results}|null }} input
 *   crm : sortie de find_crm_entity (null si la source est « web » seule)
 */
function buildEntityAnswer({ route, crm, web, showId = false }) {
  const t = strings(route.language);
  const scopeMine = Boolean(crm && crm.scope === "mine");
  const matches = crm ? crm.matches : [];

  // Plusieurs fiches possibles : on demande laquelle, on n'en choisit aucune.
  if (matches.length > 1) {
    const lines = [t.ambiguous(matches.length, plain(route.target)), ""];
    matches.forEach((m, i) => lines.push(`${i + 1}. **${plain(m.name)}** — ${t.kinds[m.entityType] || m.entityType}${m.company ? ` (${plain(m.company)})` : ""}`));
    return lines.join("\n");
  }

  const match = matches[0] || null;

  // Le CRM a été interrogé et ne connaît pas ce nom : dit tel quel — jamais
  // « aucune information dans la documentation ».
  if (crm && !match) {
    const lines = [t.notFound(plain(route.target))];
    if (route.operation === "details") {
      if (!web || web.status === "skipped") lines.push(t.offerWeb);
      lines.push(...webLines(t, web, { hasCrm: false, name: route.target }));
    }
    return lines.join("\n");
  }

  // Source « web » seule (société déjà identifiée dans la conversation).
  if (!match) return [`${route.entity === "company" ? "🏢" : route.entity === "topic" ? "🌐" : "👤"} **${plain(route.target)}**`, ...webLines(t, web, { hasCrm: false, name: route.target })].join("\n");

  if (route.operation === "projects") {
    return buildFieldLines({ match, questions: ["projects"], language: route.language, scopeMine, asked: route.fromContext ? null : route.target }).join("\n");
  }
  if (route.operation === "field") {
    return buildFieldLines({ match, questions: route.fields, language: route.language, scopeMine, asked: route.fromContext ? null : route.target }).join("\n");
  }
  return [
    ...badgeLine(t, { crm: true, web }),
    ...buildRecordLines({ match, language: route.language, scopeMine, asked: route.fromContext ? null : route.target, showId }),
    ...webLines(t, web, { name: match.name }),
  ].join("\n");
}

/**
 * @param {{ route: object, crm: {matches: {projectName, promoter}[]}|null, web: object|null, projectLabel: string|null }} input
 */
function buildPromoterAnswer({ route, crm, web, projectLabel }) {
  const t = strings(route.language);
  const matches = crm ? crm.matches : [];
  if (!matches.length) return t.projectNotFound(projectLabel ? plain(projectLabel) : null);
  if (matches.length > 1) {
    const lines = [t.severalProjects(matches.length), ""];
    matches.forEach((m, i) => lines.push(`${i + 1}. 📁 **${plain(m.projectName)}** — ${t.promoterLabel} : ${m.promoter ? plain(m.promoter) : t.notSet}`));
    return lines.join("\n");
  }
  const [project] = matches;
  if (project.promoter) {
    return [`🏗️ ${t.promoterKnown(plain(project.projectName), plain(project.promoter))}`, t.crmSource, ...webLines(t, web)].join("\n");
  }
  return [`🏗️ ${t.promoterUnknown(plain(project.projectName))}`, t.crmSource, ...webLines(t, web, { intro: t.promoterWebHint })].join("\n");
}

/** Liste paginée des promoteurs (valeurs distinctes de projects.promoteur). */
function buildPromoterListAnswer({ route, result }) {
  const t = strings(route.language);
  const p = t.promoters;
  if (!result.total) return [p.title, "", p.none, "", t.crmSource].join("\n");
  const offset = Number.isInteger(result.offset) ? result.offset : 0;
  const lines = [p.title, "", p.found(result.total), ""];
  result.items.forEach((item, i) => lines.push(`${offset + i + 1}. **${plain(item.name)}** — ${p.projects(item.projects)}`));
  const footer = [];
  if (result.truncated || offset > 0) footer.push(p.shown(offset + 1, offset + result.items.length, result.total));
  if (result.truncated) footer.push(p.next);
  if (result.scope === "mine") footer.push(p.scopeMine);
  if (footer.length) lines.push("", ...footer);
  lines.push("", `ℹ️ ${p.note}`, "", t.crmSource);
  return lines.join("\n");
}

function promotersNextLabel(language) {
  return strings(language).promoters.nextLabel;
}

/** Liste paginée des sociétés (table companies). */
function buildCompanyListAnswer({ route, result }) {
  const t = strings(route.language);
  const c = t.companies;
  const mine = result.scope === "mine";
  const filter = result.filter || null;
  const withProjects = result.view === "projects";
  if (!result.total) {
    const none = filter === "with_projects" ? c.noneWith : filter === "without_projects" ? c.noneWithout : c.none;
    return [c.title, "", none, ...(filter && mine ? ["", c.scopeFilter] : []), "", t.crmSource].join("\n");
  }
  const offset = Number.isInteger(result.offset) ? result.offset : 0;
  const found = filter === "with_projects" ? c.foundWith(result.total, mine ? c.inScope : "") : filter === "without_projects" ? c.foundWithout(result.total, mine ? c.inScope : "") : c.found(result.total);
  const lines = [c.title, "", found, ""];
  // Lecture des projets en échec : les noms seuls, sans rien affirmer.
  const showProjects = withProjects && result.projectsLoaded === true;
  if (withProjects && result.projectsLoaded === false) lines.push(c.projectsFailed, "");
  result.items.forEach((item, i) => {
    // Liste simple : le nom, rien d'autre.
    if (!showProjects) return lines.push(`${offset + i + 1}. ${plain(item.name)}`);
    lines.push(`${offset + i + 1}. **${plain(item.name)}**`);
    const projects = Array.isArray(item.projectItems) ? item.projectItems : [];
    for (const p of projects) {
      const details = [p.statut ? plain(p.statut) : null, p.archived ? t.archived : null].filter(Boolean).join(", ");
      lines.push(`   - 📁 ${plain(p.name)}${details ? ` — ${details}` : ""}`);
    }
    const total = Number(item.projects) || 0;
    if (total > projects.length) lines.push(`   - ${c.moreProjects(total - projects.length)}`);
    if (item.outOfScope > 0) lines.push(`   - ${c.hidden(item.outOfScope)}`);
    else if (!total) lines.push(`   - ${mine ? c.noProjectInScope : c.noProject}`);
  });
  const footer = [];
  if (result.truncated || offset > 0) footer.push(c.shown(offset + 1, offset + result.items.length, result.total));
  if (result.truncated) footer.push(c.next);
  if (mine && filter) footer.push(c.scopeFilter);
  else if (mine && showProjects) footer.push(c.scopeProjects);
  if (footer.length) lines.push("", ...footer);
  lines.push("", t.crmSource);
  return lines.join("\n");
}

/** « Combien de sociétés ? » — le total renvoyé par l'outil, jamais recompté ici. */
function buildCompanyCountAnswer({ route, result }) {
  const t = strings(route.language);
  const c = t.companies;
  const scope = result.scope === "mine" ? c.inScope : "";
  const all = Number.isInteger(result.totalAll) ? result.totalAll : result.total;
  const line = result.filter === "with_projects" ? c.countWith(result.total, all, scope) : result.filter === "without_projects" ? c.countWithout(result.total, all, scope) : c.count(result.total);
  return [line, ...(result.filter && result.scope === "mine" ? ["", c.scopeFilter] : []), "", t.crmSource].join("\n");
}

/** Machines du référentiel de production. */
function buildMachineListAnswer({ route, result }) {
  const t = strings(route.language);
  const m = t.machines;
  if (!result.total) return [m.title, "", m.none, "", t.crmSource].join("\n");
  const lines = [m.title, "", m.found(result.total), "", m.header, "|---|---|---|---|"];
  for (const item of result.items) {
    lines.push(`| ${plain(item.code)} | ${plain(item.nom)} | ${plain(item.typeMachine)} | ${m.status[item.statut] || plain(item.statut)} |`);
  }
  lines.push("", t.crmSource);
  return lines.join("\n");
}

function listNextLabel(entity, language) {
  const t = strings(language);
  return (t[entity === "company" ? "companies" : "promoters"] || t.promoters).nextLabel;
}

/** Projets d'un promoteur désigné par son nom. */
function buildPromoterProjectsAnswer({ route, result }) {
  const t = strings(route.language);
  const p = t.promoters;
  if (!result.matches.length) return p.notFound(plain(route.target));
  if (result.matches.length > 1) {
    return [p.several(result.matches.length, plain(route.target)), "", ...result.matches.map((m, i) => `${i + 1}. **${plain(m.name)}**`)].join("\n");
  }
  const [promoter] = result.matches;
  const lines = [];
  if (result.matchType === "fuzzy") lines.push(t.fuzzy(plain(route.target), plain(promoter.name)), "");
  lines.push(`🏢 ${p.projectsOf(plain(promoter.name), promoter.projects.total)}`, "");
  for (const project of promoter.projects.items) {
    const details = [project.statut ? plain(project.statut) : null, project.archived ? t.archived : null].filter(Boolean).join(", ");
    lines.push(`- 📁 ${plain(project.name)}${details ? ` — ${details}` : ""}`);
  }
  if (result.scope === "mine") lines.push("", p.scopeMine);
  lines.push("", t.crmSource);
  return lines.join("\n");
}

module.exports = { buildCompanyListAnswer, buildCompanyCountAnswer, buildMachineListAnswer, listNextLabel, buildEntityAnswer, buildPromoterAnswer, buildPromoterListAnswer, buildPromoterProjectsAnswer, promotersNextLabel, buildClarificationAnswer, buildErrorAnswer };
