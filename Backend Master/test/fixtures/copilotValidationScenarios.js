"use strict";

/**
 * # Corpus de validation du Copilot — plus de 500 conversations réalistes
 *
 * Voir `src/ai/orchestrator/COPILOT_VALIDATION.md` pour la méthodologie
 * complète. Chaque scénario documente, pour UNE question utilisateur
 * réaliste : l'intention attendue, l'Agent attendu (ou `null` s'il n'y en a
 * pas — voir `intentCatalog.js`/`agents/manifest.js`), les AI Tools
 * attendus, le contexte attendu (`tools`/`rag`/`none`), la permission
 * attendue au niveau Agent (`expectedAgentAllowed` : `true`/`false`/`null`
 * si sans objet), une vérification ciblée de permission au niveau Tool
 * quand pertinent (`toolCheck`), et un indice de réponse attendue
 * (`expectedResponseHint`, utilisé par les tests bout-en-bout).
 *
 * Regroupé par persona métier (Commercial, Chef de projet, RH, Direction,
 * + les autres domaines du CRM pour une couverture complète du catalogue
 * des 14 intentions), puis par deux sections dédiées aux fonctionnalités
 * ajoutées après les 500 premiers scénarios — Smart Suggestions et Context
 * Awareness (voir tout en bas du fichier) — qui exercent le VRAI routage
 * (`formatPageContext` réel, jamais une chaîne recopiée à la main) plutôt
 * que de le resimuler.
 */

const { formatPageContext } = require("../../src/modules/ai-copilot/services/pageContextFormatter");

function user(role, overrides = {}) {
  return { id: `u-${role}-${Math.random().toString(36).slice(2, 8)}`, role, ...overrides };
}

// Utilisateurs stables (mêmes id à travers tout le fichier — plus lisible
// dans les échecs de test que des id aléatoires).
const USERS = {
  user: { id: "u-generic", role: "user" },
  commercial: { id: "u-commercial", role: "commercial" },
  admin: { id: "u-admin", role: "admin" },
  superadmin: { id: "u-superadmin", role: "superadmin" },
  logistique: { id: "u-logistique", role: "responsable_logistique_achat" },
  maintenanceManagerByEmail: { id: "u-mm-email", role: "user", email: "accueilcbif@gmail.com" },
  hrReviewerByEmail: { id: "u-hr-email", role: "user", email: "manegerofficecbi@gmail.com" },
};

let seq = 0;
function scenario(fields) {
  seq += 1;
  return {
    seq,
    expectedModuleKey: null,
    expectedAgent: null,
    expectedAgentAllowed: null,
    expectedTools: [],
    toolCheck: null,
    ...fields,
  };
}

const SCENARIOS = [];

// ═══════════════════════════════════════════════════════════════════════
// COMMERCIAL — intention `commercial_contacts` (Agent: commercial_agent)
// requiredRoles agent : commercial/admin/superadmin/superadmin2
// ═══════════════════════════════════════════════════════════════════════
const COMMERCIAL_TOOLS = ["get_commercial_contact_kpi", "get_commercial_contact_analytics", "get_commercial_personal_kpi_summary"];
[
  { id: "com-01", message: "Quelle relance dois-je faire auprès de mes contacts commerciaux cette semaine ?", user: USERS.commercial },
  { id: "com-02", message: "Combien d'opportunités sont en négociation avec mes contacts commerciaux ?", user: USERS.commercial },
  { id: "com-03", message: "Donne-moi le KPI de mes contacts commerciaux ce mois-ci.", user: USERS.commercial },
  { id: "com-04", message: "Quel est mon taux de validation sur mes contacts commerciaux ?", user: USERS.commercial },
  { id: "com-05", message: "Affiche les analytics de mes contacts commerciaux.", user: USERS.commercial },
  { id: "com-06", message: "Résumé de mes KPI personnels commerciaux pour le trimestre.", user: USERS.commercial },
  { id: "com-07", message: "Combien de contacts commerciaux ai-je relancés aujourd'hui ?", user: USERS.commercial },
  { id: "com-08", message: "Quels sont mes indicateurs KPI en tant que commercial ?", user: USERS.commercial },
  { id: "com-09", message: "Montre-moi la répartition de mes contacts commerciaux par statut.", user: USERS.commercial },
  { id: "com-10", message: "Quel commercial a le meilleur KPI de contacts ce mois ?", user: USERS.admin },
  { id: "com-11", message: "Analyse globale des contacts commerciaux pour toute l'équipe.", user: USERS.admin },
  { id: "com-12", message: "Quels contacts commerciaux nécessitent une relance urgente ?", user: USERS.commercial },
  { id: "com-13", message: "Donne-moi les KPI de contacts commerciaux de Sami.", user: USERS.admin },
  { id: "com-14", message: "Quel est le taux de validation des contacts commerciaux globalement ?", user: USERS.superadmin },
  { id: "com-15", message: "Combien de contacts commerciaux ai-je créés cette semaine ?", user: USERS.commercial },
  { id: "com-16", message: "Distribution en pourcentage de mes contacts commerciaux par relance.", user: USERS.commercial },
  { id: "com-17", message: "Un rôle non-commercial a-t-il accès aux contacts commerciaux ?", user: USERS.user, expectedDenied: true },
  { id: "com-18", message: "Résumé KPI personnel enrichi pour le contact commercial de Nadia.", user: USERS.commercial },
  { id: "com-19", message: "Quels sont mes badges de performance sur les contacts commerciaux ?", user: USERS.commercial },
  { id: "com-20", message: "Quels contacts commerciaux ont une relance en retard cette semaine ?", user: USERS.commercial },
  { id: "com-21", message: "KPI des contacts commerciaux pour la direction ce trimestre.", user: USERS.superadmin },
  { id: "com-22", message: "Quels contacts commerciaux ont un badge de performance élevé ?", user: USERS.commercial },
  { id: "com-23", message: "Un responsable logistique peut-il voir les KPI de contacts commerciaux ?", user: USERS.logistique, expectedDenied: true },
  { id: "com-24", message: "Analytics enrichies de mes contacts commerciaux : taux et distributions.", user: USERS.commercial },
  { id: "com-25", message: "Quel est le taux de relance pour mes contacts commerciaux cette semaine ?", user: USERS.commercial },
  { id: "com-26", message: "Combien de contacts commerciaux sont en attente de validation ?", user: USERS.commercial },
  { id: "com-27", message: "Donne-moi le KPI de conversion de mes contacts commerciaux ce mois.", user: USERS.commercial },
  { id: "com-28", message: "Quels contacts commerciaux ont été créés hier ?", user: USERS.commercial },
  { id: "com-29", message: "Analyse mes contacts commerciaux par type de client.", user: USERS.commercial },
  { id: "com-30", message: "Quel est mon nombre total d'appels sur mes contacts commerciaux ?", user: USERS.commercial },
  { id: "com-31", message: "Contacts commerciaux : quelle société a le plus de contacts ?", user: USERS.admin },
  { id: "com-32", message: "Quels sont mes contacts commerciaux les plus actifs ce trimestre ?", user: USERS.commercial },
  { id: "com-33", message: "KPI de mes contacts commerciaux : combien sont validés ?", user: USERS.commercial },
  { id: "com-34", message: "Quels contacts commerciaux ai-je perdus ce mois-ci ?", user: USERS.commercial },
  { id: "com-35", message: "Relance tous mes contacts commerciaux en attente depuis une semaine.", user: USERS.commercial },
  { id: "com-36", message: "Combien de sociétés sont représentées parmi mes contacts commerciaux ?", user: USERS.commercial },
  { id: "com-37", message: "Quel est le score de performance de mes contacts commerciaux ?", user: USERS.commercial },
  { id: "com-38", message: "Un commercial peut-il voir les contacts commerciaux d'un collègue ?", user: USERS.commercial },
  { id: "com-39", message: "Top 5 des contacts commerciaux par nombre d'appels ce mois.", user: USERS.admin },
  { id: "com-40", message: "Quels contacts commerciaux nécessitent un rappel dans les prochains jours ?", user: USERS.commercial },
].forEach((s) =>
  SCENARIOS.push(
    scenario({
      id: s.id,
      persona: "Commercial",
      message: s.message,
      actingUser: s.user,
      expectedIntent: "commercial_contacts",
      expectedModuleKey: "commercialContacts",
      expectedAgent: "commercial_agent",
      expectedContext: "tools",
      expectedAgentAllowed: !s.expectedDenied,
      expectedTools: [COMMERCIAL_TOOLS[0]],
      expectedResponseHint: s.expectedDenied
        ? "Doit refuser poliment : rôle non autorisé pour les contacts commerciaux."
        : "Doit citer des chiffres/contacts issus des Tools, jamais inventés.",
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// CHEF DE PROJET — intention `projects` (Agent: project_agent, ouvert)
// ═══════════════════════════════════════════════════════════════════════
[
  { id: "prj-01", message: "Montre-moi la liste des projets en cours.", user: USERS.user },
  { id: "prj-02", message: "Quels projets sont en retard ?", user: USERS.user },
  { id: "prj-03", message: "Quels projets nécessitent une attention particulière ?", user: USERS.user, attention: true },
  { id: "prj-04", message: "Quelle est l'étape actuelle du projet Sfax ?", user: USERS.user },
  { id: "prj-05", message: "Qui est le propriétaire du projet Tunis Nord ?", user: USERS.user },
  { id: "prj-06", message: "Déplace le projet Sousse vers l'étape suivante.", user: USERS.admin },
  { id: "prj-07", message: "Assigne-moi comme propriétaire du projet Nabeul.", user: USERS.admin },
  { id: "prj-08", message: "Combien de projets sont actuellement en retard ?", user: USERS.user },
  { id: "prj-09", message: "Quels projets ont un risque prioritaire cette semaine ?", user: USERS.user, attention: true },
  { id: "prj-10", message: "Liste les projets sans propriétaire assigné.", user: USERS.user },
  { id: "prj-11", message: "Y a-t-il des projets urgents à traiter aujourd'hui ?", user: USERS.user, attention: true },
  { id: "prj-12", message: "Quels projets ont dépassé leur étape prévue ?", user: USERS.user },
  { id: "prj-13", message: "Donne-moi le statut du projet Bizerte.", user: USERS.user },
  { id: "prj-14", message: "Combien de projets avons-nous au total ?", user: USERS.user },
  { id: "prj-15", message: "Quels projets sont à surveiller ce mois-ci ?", user: USERS.user, attention: true },
  { id: "prj-16", message: "Change le propriétaire du projet Kelibia pour Amine.", user: USERS.superadmin },
  { id: "prj-17", message: "Un utilisateur standard peut-il changer l'étape d'un projet ?", user: USERS.user, expectedDenied: true, mutation: true },
  { id: "prj-18", message: "Quelles sont toutes les étapes utilisées par nos projets ?", user: USERS.user },
  { id: "prj-19", message: "Quels projets sont prioritaires selon leur niveau de risque ?", user: USERS.user, attention: true },
  { id: "prj-20", message: "Retire le propriétaire du projet Monastir.", user: USERS.admin },
  { id: "prj-21", message: "Quels projets ont une fiche incomplète (données manquantes) ?", user: USERS.user },
  { id: "prj-22", message: "Résumé rapide des projets ouverts par étape.", user: USERS.user },
  { id: "prj-23", message: "Quels projets présentent un risque de blocage ?", user: USERS.user, attention: true },
  { id: "prj-24", message: "Assigne le projet Sfax au propriétaire Rania.", user: USERS.superadmin },
  { id: "prj-25", message: "Quels projets sont sans étape assignée du tout ?", user: USERS.user },
  { id: "prj-26", message: "Filtre-moi les projets en retard qui sont aussi prioritaires.", user: USERS.user, attention: true },
  { id: "prj-27", message: "Quel est le pourcentage d'avancement du projet Gabès ?", user: USERS.user },
  { id: "prj-28", message: "Liste tous les projets archivés ce trimestre.", user: USERS.user },
  { id: "prj-29", message: "Quels projets ont un budget élevé mais peu d'avancement ?", user: USERS.user },
  { id: "prj-30", message: "Le projet Djerba a-t-il une échéance dépassée ?", user: USERS.user },
  { id: "prj-31", message: "Quels projets sont bloqués depuis plus de deux semaines ?", user: USERS.user, attention: true },
  { id: "prj-32", message: "Combien de projets sont sans aucune activité récente ?", user: USERS.user },
  { id: "prj-33", message: "Assigne le projet Mahdia à un nouveau propriétaire.", user: USERS.admin },
  { id: "prj-34", message: "Quelle étape suit le projet Gafsa dans le pipeline ?", user: USERS.user },
  { id: "prj-35", message: "Quels projets ont une date limite ingénieur proche ?", user: USERS.user, attention: true },
  { id: "prj-36", message: "Liste les projets dont le propriétaire a changé récemment.", user: USERS.user },
  { id: "prj-37", message: "Un commercial peut-il déplacer un projet vers une nouvelle étape ?", user: USERS.commercial, expectedDenied: true, mutation: true },
  { id: "prj-38", message: "Quels projets ont un montant de marché supérieur à 100 000 dinars ?", user: USERS.user },
  { id: "prj-39", message: "Fais avancer le projet Zarzis vers l'étape suivante.", user: USERS.admin },
  { id: "prj-40", message: "Combien de projets ont une fiche complète à 100% ?", user: USERS.user },
  // prj-41..45 — régression pour AI-Business-Copilot/09_INCIDENT_KPI_AGENT.md :
  // les 5 questions EXACTES de l'incident (rôle "user", le rôle réellement
  // signalé). "critique"/"critiques" venait de rejoindre ATTENTION_MARKERS
  // (même angle mort déjà connu pour "retard", voir projectAgent.js) —
  // sans ce mot, cette question suivait le chemin par défaut au lieu du
  // classement par attention réel. "Donne-moi les KPI de mes projets."
  // reste volontairement SANS marqueur d'attention (aucun mot de
  // ATTENTION_MARKERS ne correspond) — documente honnêtement que cette
  // question précise suit le chemin tool-calling par défaut de
  // project_agent, pas ProjectAttentionAnalyzer.
  { id: "prj-41", message: "Quels projets sont critiques ?", user: USERS.user, attention: true },
  { id: "prj-42", message: "Quels projets nécessitent mon attention ?", user: USERS.user, attention: true },
  { id: "prj-43", message: "Quels projets sont à risque ?", user: USERS.user, attention: true },
  { id: "prj-44", message: "Donne-moi les KPI de mes projets.", user: USERS.user },
].forEach((s) =>
  SCENARIOS.push(
    scenario({
      id: s.id,
      persona: "Chef de projet",
      message: s.message,
      actingUser: s.user,
      expectedIntent: "projects",
      expectedModuleKey: "projects",
      expectedAgent: "project_agent",
      expectedContext: "tools",
      expectedAgentAllowed: true, // project_agent est ouvert à tout utilisateur authentifié
      expectedTools: s.mutation ? ["move_project_stage"] : ["list_projects"],
      toolCheck: s.mutation ? { tool: "move_project_stage", expectedAllowed: !s.expectedDenied } : null,
      expectedResponseHint: s.attention
        ? "Doit classer les projets par priorité avec des raisons citées (ProjectAttentionAnalyzer), jamais une supposition."
        : "Doit citer des projets réels issus de list_projects, jamais un projet inventé.",
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// RH — intention `hr`, Agent : hr_agent (mission "IMPLÉMENTER HRAgent ET
// PorPromeshAgent" — hr_agent.requiredRoles=[], ouvert à tout authentifié,
// même discipline que maintenance_agent : c'est chaque Tool qui restreint,
// jamais l'Agent). Tool-level : accept/reject/mark_processed exigent
// HR_REVIEWER_ROLES
// ═══════════════════════════════════════════════════════════════════════
[
  { id: "hr-01", message: "Qui est absent aujourd'hui pour cause de congé ?", user: USERS.user },
  { id: "hr-02", message: "Quelle est la demande de congé la plus ancienne encore en attente ?", user: USERS.admin, toolCheck: { tool: "accept_hr_request", expectedAllowed: true } },
  { id: "hr-03", message: "Je veux soumettre une demande de congé pour la semaine prochaine.", user: USERS.user },
  { id: "hr-04", message: "Accepte la demande de congé de Yasmine.", user: USERS.admin, toolCheck: { tool: "accept_hr_request", expectedAllowed: true } },
  { id: "hr-05", message: "Refuse la demande de congé numéro 42.", user: USERS.admin, toolCheck: { tool: "reject_hr_request", expectedAllowed: true } },
  { id: "hr-06", message: "Quel est le détail de ma demande RH en cours ?", user: USERS.user },
  { id: "hr-07", message: "Combien de demandes de congé sont en attente pour l'équipe ?", user: USERS.admin },
  { id: "hr-08", message: "Marque ma demande de congé acceptée comme traitée administrativement.", user: USERS.admin, toolCheck: { tool: "mark_hr_request_processed", expectedAllowed: true } },
  { id: "hr-09", message: "Historique de ma demande de congé du mois dernier.", user: USERS.user },
  { id: "hr-10", message: "Un utilisateur standard peut-il accepter une demande de congé ?", user: USERS.user, toolCheck: { tool: "accept_hr_request", expectedAllowed: false } },
  { id: "hr-11", message: "Supprime ma demande de congé, je me suis trompé.", user: USERS.user },
  { id: "hr-12", message: "Quelle absence est prévue cette semaine dans l'équipe ?", user: USERS.admin },
  { id: "hr-13", message: "Je demande une autorisation de sortie pour demain matin.", user: USERS.user },
  { id: "hr-14", message: "Ajoute un commentaire sur la demande de congé de Karim.", user: USERS.admin },
  { id: "hr-15", message: "Le responsable RH par email peut-il valider une demande de congé ?", user: USERS.hrReviewerByEmail, toolCheck: { tool: "accept_hr_request", expectedAllowed: true } },
  { id: "hr-16", message: "Combien de demandes RH ai-je soumises cette année ?", user: USERS.user },
  { id: "hr-17", message: "Quelles demandes de congé restent en attente depuis plus d'une semaine ?", user: USERS.admin },
  { id: "hr-18", message: "Accepte toutes les demandes en attente pour le service, congé compris.", user: USERS.superadmin, toolCheck: { tool: "accept_hr_request", expectedAllowed: true } },
  { id: "hr-19", message: "Quel collaborateur a le plus de jours d'absence ce mois-ci ?", user: USERS.admin },
  { id: "hr-20", message: "Je veux consulter le statut de ma demande de congé.", user: USERS.user },
  { id: "hr-21", message: "Combien de jours de congé me reste-t-il cette année ?", user: USERS.user },
  { id: "hr-22", message: "Je souhaite annuler ma demande de congé de la semaine prochaine.", user: USERS.user },
  { id: "hr-23", message: "Quelles absences sont prévues pour l'équipe RH ce mois ?", user: USERS.admin },
  { id: "hr-24", message: "Le service RH a-t-il traité ma dernière demande ?", user: USERS.user },
  { id: "hr-25", message: "Combien de demandes de congé ont été refusées ce trimestre ?", user: USERS.admin },
  { id: "hr-26", message: "Modifie les dates de ma demande de congé déjà soumise.", user: USERS.user },
  { id: "hr-27", message: "Quel collègue est en congé cette semaine ?", user: USERS.user },
  { id: "hr-28", message: "Soumets une demande d'absence pour raison médicale.", user: USERS.user },
  { id: "hr-29", message: "Le service RH peut-il me confirmer le solde de mes congés ?", user: USERS.user },
  { id: "hr-30", message: "Combien de demandes de congé sont en attente de validation dans le service RH ?", user: USERS.admin },
  { id: "hr-31", message: "Refuse la demande de congé qui chevauche une période critique.", user: USERS.admin, toolCheck: { tool: "reject_hr_request", expectedAllowed: true } },
  { id: "hr-32", message: "Quelle est la durée moyenne de traitement d'une demande de congé ?", user: USERS.admin },
  { id: "hr-33", message: "Ma demande d'absence de la semaine dernière a-t-elle été acceptée ?", user: USERS.user },
  { id: "hr-34", message: "Liste toutes les demandes de congé de mon équipe ce mois.", user: USERS.admin },
].forEach((s) =>
  SCENARIOS.push(
    scenario({
      id: s.id,
      persona: "RH",
      message: s.message,
      actingUser: s.user,
      expectedIntent: "hr",
      expectedModuleKey: "hr",
      expectedAgent: "hr_agent",
      expectedContext: "tools",
      expectedAgentAllowed: true,
      expectedTools: ["list_hr_requests", "get_hr_request", "create_hr_request", "accept_hr_request"],
      toolCheck: s.toolCheck || null,
      expectedResponseHint: "Doit citer des demandes RH réelles (ou dire clairement qu'aucune n'est en attente), jamais inventer un nom de collaborateur.",
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// DIRECTION — intentions `dashboard` (Agent: kpi_agent) + `reporting`
// (Agent: reporting_agent) — legacy/pro dashboards réservés admin-tier
// ═══════════════════════════════════════════════════════════════════════
const DASHBOARD_TOOLS = ["get_dashboard_kpis", "get_user_dashboard", "get_professional_dashboard", "get_legacy_dashboard_kpis"];
[
  { id: "dir-01", message: "Quel est le tableau de bord des KPI de ce mois ?", user: USERS.admin },
  { id: "dir-02", message: "Affiche le tableau de bord professionnel complet.", user: USERS.admin, tool: "get_professional_dashboard" },
  { id: "dir-03", message: "Quelles sont les statistiques globales du dashboard ce trimestre ?", user: USERS.superadmin },
  { id: "dir-04", message: "Un commercial peut-il consulter le tableau de bord professionnel ?", user: USERS.commercial, expectedDenied: true, tool: "get_professional_dashboard" },
  { id: "dir-05", message: "Montre-moi les KPI historiques (entonnoir de vente) du dashboard.", user: USERS.admin, tool: "get_legacy_dashboard_kpis" },
  { id: "dir-06", message: "Quel est mon tableau de bord personnel aujourd'hui ?", user: USERS.user },
  { id: "dir-07", message: "Statistiques du dashboard par famille de produit.", user: USERS.admin },
  { id: "dir-08", message: "Un rôle standard peut-il voir le tableau de bord des KPI historiques (legacy) ?", user: USERS.user, expectedDenied: true, tool: "get_legacy_dashboard_kpis" },
  { id: "dir-09", message: "Résumé des indicateurs KPI du tableau de bord global.", user: USERS.superadmin },
  { id: "dir-10", message: "Quel est le tableau de bord de la direction ce mois ?", user: USERS.admin, tool: "get_professional_dashboard" },
  { id: "dir-11", message: "Affiche les statistiques du dashboard pour tous les utilisateurs.", user: USERS.admin },
  { id: "dir-12", message: "Donne-moi les KPI consolidés du tableau de bord professionnel.", user: USERS.superadmin, tool: "get_professional_dashboard" },
  { id: "dir-13", message: "Quelles statistiques dashboard suivre pour ce trimestre ?", user: USERS.admin },
  { id: "dir-14", message: "Tableau de bord : quel est le revenu de l'entonnoir de vente ?", user: USERS.admin, tool: "get_legacy_dashboard_kpis" },
  { id: "dir-15", message: "Quel est mon propre tableau de bord (cartes cliquables) ?", user: USERS.user },
  { id: "dir-16", message: "KPI du tableau de bord : répartition par diamètre de produit.", user: USERS.admin },
  { id: "dir-17", message: "Statistiques dashboard globales pour un rôle admin-tier.", user: USERS.superadmin },
  { id: "dir-18", message: "Le tableau de bord professionnel est-il accessible à un responsable logistique ?", user: USERS.logistique, expectedDenied: true, tool: "get_professional_dashboard" },
  // Dashboard intelligent : comparaisons, prévisions, alertes, graphiques,
  // et "pourquoi ce KPI évolue" — voir KPI_AGENT.md.
  { id: "dir-19", message: "Pourquoi le KPI de mon tableau de bord a-t-il augmenté ce mois-ci ?", user: USERS.admin },
  { id: "dir-20", message: "Compare le tableau de bord de ce mois à celui du mois dernier.", user: USERS.admin },
  { id: "dir-21", message: "Quelle est la prévision de mon tableau de bord pour le mois prochain ?", user: USERS.admin },
  { id: "dir-22", message: "Y a-t-il des alertes sur mon tableau de bord ?", user: USERS.admin, tool: "get_professional_dashboard" },
  { id: "dir-23", message: "Montre-moi le graphique d'évolution de mes indicateurs du tableau de bord.", user: USERS.user },
  { id: "dir-24", message: "Quel est le tableau de bord de mon équipe ce mois ?", user: USERS.admin },
  { id: "dir-25", message: "Statistiques du tableau de bord : combien de projets validés au total ?", user: USERS.admin },
  { id: "dir-26", message: "Le tableau de bord montre-t-il une baisse ce trimestre ?", user: USERS.admin },
  { id: "dir-27", message: "Quelles statistiques du tableau de bord sont en hausse cette semaine ?", user: USERS.admin },
  { id: "dir-28", message: "Affiche mon tableau de bord avec les indicateurs de la semaine.", user: USERS.user },
  { id: "dir-29", message: "Statistiques dashboard : répartition des projets par statut.", user: USERS.admin },
  { id: "dir-30", message: "Le tableau de bord professionnel inclut-il les alertes du mois ?", user: USERS.admin, tool: "get_professional_dashboard" },
  { id: "dir-31", message: "Compare mon tableau de bord à celui du trimestre dernier.", user: USERS.admin },
  { id: "dir-32", message: "Quelle est la tendance du tableau de bord sur les 3 derniers mois ?", user: USERS.admin },
  { id: "dir-33", message: "Statistiques du tableau de bord pour un rôle commercial.", user: USERS.commercial },
  { id: "dir-34", message: "Un utilisateur standard peut-il consulter les statistiques historiques du tableau de bord ?", user: USERS.user, expectedDenied: true, tool: "get_legacy_dashboard_kpis" },
  { id: "dir-35", message: "Quel est le graphique d'évolution du tableau de bord professionnel ?", user: USERS.admin, tool: "get_professional_dashboard" },
  { id: "dir-36", message: "Prévision du tableau de bord pour le trimestre prochain.", user: USERS.admin },
  { id: "dir-37", message: "Résumé rapide du tableau de bord : combien d'alertes actives ?", user: USERS.admin, tool: "get_professional_dashboard" },
].forEach((s) =>
  SCENARIOS.push(
    scenario({
      id: s.id,
      persona: "Direction",
      message: s.message,
      actingUser: s.user,
      expectedIntent: "dashboard",
      expectedModuleKey: "dashboard",
      expectedAgent: "kpi_agent",
      expectedContext: "tools",
      expectedAgentAllowed: true, // kpi_agent est ouvert ; c'est le Tool qui restreint
      expectedTools: [s.tool || "get_dashboard_kpis"],
      toolCheck: s.tool ? { tool: s.tool, expectedAllowed: !s.expectedDenied } : null,
      expectedResponseHint: s.expectedDenied
        ? "Doit refuser poliment ce Tool spécifique — pas halluciner un chiffre à la place."
        : "Doit citer des chiffres réels du dashboard, jamais un pourcentage inventé.",
    })
  )
);

// reporting (synthèses narratives) — Agent: reporting_agent, mêmes Tools que kpi_agent
[
  { id: "rpt-01", message: "Compare ce trimestre au précédent en synthèse.", user: USERS.admin },
  { id: "rpt-02", message: "Fais-moi un rapport de synthèse sur les indicateurs clés.", user: USERS.admin },
  { id: "rpt-03", message: "Résumé des tendances principales de ce mois.", user: USERS.superadmin },
  { id: "rpt-04", message: "Quels sont les principaux risques identifiés ce trimestre ? Fais-en un rapport.", user: USERS.admin },
  { id: "rpt-05", message: "Génère un bilan des performances commerciales du mois.", user: USERS.admin },
  { id: "rpt-06", message: "Rapport de synthèse sur l'activité globale de l'entreprise.", user: USERS.superadmin },
  { id: "rpt-07", message: "Peux-tu me faire un résumé synthétique des KPI en rapport ?", user: USERS.admin },
  { id: "rpt-08", message: "Quel bilan tirer de nos indicateurs ce trimestre en rapport détaillé ?", user: USERS.admin },
  { id: "rpt-09", message: "Synthèse des points d'attention pour le comité de direction.", user: USERS.superadmin },
  { id: "rpt-10", message: "Rapport comparatif entre ce trimestre et le précédent.", user: USERS.admin },
  { id: "rpt-11", message: "Fais un rapport de synthèse sur les tendances de production.", user: USERS.admin },
  { id: "rpt-12", message: "Résumé et bilan des risques principaux pour la direction.", user: USERS.superadmin },
  { id: "rpt-13", message: "Génère une synthèse narrative des rapports du mois.", user: USERS.admin },
  { id: "rpt-14", message: "Quel rapport de synthèse pour le conseil d'administration ce trimestre ?", user: USERS.superadmin },
  { id: "rpt-15", message: "Fais-moi un bilan complet de l'activité commerciale du mois.", user: USERS.admin },
  { id: "rpt-16", message: "Rapport de synthèse sur les projets en cours ce trimestre.", user: USERS.admin },
  { id: "rpt-17", message: "Résumé et synthèse des principales tendances de production ce mois.", user: USERS.admin },
  { id: "rpt-18", message: "Peux-tu me faire une synthèse des résultats de l'équipe pour le comité ?", user: USERS.superadmin },
  { id: "rpt-19", message: "Génère un rapport de synthèse détaillé sur les interventions de maintenance.", user: USERS.admin },
  { id: "rpt-20", message: "Quel bilan global tirer de ce trimestre en un rapport ?", user: USERS.admin },
  { id: "rpt-21", message: "Synthèse rapide des points bloquants pour la réunion de direction.", user: USERS.superadmin },
  { id: "rpt-22", message: "Rapport mensuel sur l'avancement des dossiers prioritaires.", user: USERS.admin },
  { id: "rpt-23", message: "Fais un résumé synthétique de la performance globale.", user: USERS.admin },
  { id: "rpt-24", message: "Bilan des risques identifiés ce mois, en rapport détaillé.", user: USERS.admin },
  { id: "rpt-25", message: "Rapport de synthèse comparatif entre les deux derniers trimestres.", user: USERS.superadmin },
  { id: "rpt-26", message: "Génère un résumé pour le conseil d'administration sur l'activité globale.", user: USERS.superadmin },
  { id: "rpt-27", message: "Quelle synthèse proposer pour le bilan annuel de l'entreprise ?", user: USERS.admin },
  { id: "rpt-28", message: "Rapport complet avec bilan et synthèse des indicateurs clés.", user: USERS.admin },
].forEach((s) =>
  SCENARIOS.push(
    scenario({
      id: s.id,
      persona: "Direction",
      message: s.message,
      actingUser: s.user,
      expectedIntent: "reporting",
      expectedModuleKey: "dashboard",
      expectedAgent: "reporting_agent",
      expectedContext: "tools",
      expectedAgentAllowed: true,
      expectedTools: DASHBOARD_TOOLS,
      expectedResponseHint: "Doit être une SYNTHÈSE narrative (pas une simple liste de chiffres bruts) — voir le workflow à 2 étapes de ReportingAgent.",
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// DIRECTION — intention `business_analysis` (Agent: business_analyst_agent)
// Résultat/Causes/Risques/Recommandations sur 8 domaines — voir
// BUSINESS_ANALYST.md
// ═══════════════════════════════════════════════════════════════════════
const BUSINESS_ANALYST_TOOLS = ["get_dashboard_kpis", "get_professional_dashboard", "list_projects", "get_commercial_contact_kpi", "get_commercial_contact_analytics", "get_maintenance_stats"];
[
  { id: "ana-01", message: "Analyse les KPI du mois et donne-moi des recommandations.", user: USERS.admin, tool: "get_dashboard_kpis" },
  { id: "ana-02", message: "Peux-tu analyser les projets en cours et me donner des recommandations sur les risques ?", user: USERS.user, tool: "list_projects" },
  { id: "ana-03", message: "Analyse les ventes de ce trimestre et propose des recommandations.", user: USERS.commercial, tool: "get_commercial_contact_analytics" },
  { id: "ana-04", message: "Peux-tu analyser le pipeline commercial et proposer des recommandations sur les causes de blocage ?", user: USERS.admin, tool: "get_professional_dashboard" },
  { id: "ana-05", message: "Analyse les devis envoyés et leurs risques, avec des recommandations.", user: USERS.admin, tool: null },
  { id: "ana-06", message: "Analyse les activités récentes des projets, avec des recommandations.", user: USERS.user, tool: "list_projects" },
  { id: "ana-07", message: "Peux-tu analyser les interventions de maintenance et proposer des recommandations sur les risques ?", user: USERS.admin, tool: "get_maintenance_stats" },
  { id: "ana-08", message: "Analyse la performance globale du CRM ce mois-ci.", user: USERS.admin, tool: "get_professional_dashboard" },
  { id: "ana-09", message: "Fais une analyse complète avec causes, risques et recommandations.", user: USERS.superadmin, tool: "get_professional_dashboard" },
  { id: "ana-10", message: "Analyse les performances commerciales et les risques associés.", user: USERS.commercial, tool: "get_commercial_contact_analytics" },
  { id: "ana-11", message: "Analyse la performance de l'équipe commerciale et propose des recommandations.", user: USERS.commercial, tool: "get_commercial_contact_analytics" },
  { id: "ana-12", message: "Peux-tu analyser les indicateurs KPI et proposer des recommandations concrètes ?", user: USERS.admin, tool: "get_dashboard_kpis" },
  { id: "ana-13", message: "Analyse les opportunités du pipeline et donne des recommandations sur les blocages.", user: USERS.admin, tool: "get_professional_dashboard" },
  { id: "ana-14", message: "Peux-tu analyser les pannes de maintenance et proposer des recommandations ?", user: USERS.admin, tool: "get_maintenance_stats" },
  { id: "ana-15", message: "Analyse la performance globale et les recommandations pour le trimestre.", user: USERS.admin, tool: "get_professional_dashboard" },
  { id: "ana-16", message: "Analyse les projets prioritaires et propose des recommandations urgentes.", user: USERS.user, tool: "list_projects" },
  { id: "ana-17", message: "Peux-tu analyser les ventes de la région Nord avec des recommandations ?", user: USERS.commercial, tool: "get_commercial_contact_analytics" },
  { id: "ana-18", message: "Analyse les activités des projets et propose des recommandations de suivi.", user: USERS.user, tool: "list_projects" },
  { id: "ana-19", message: "Fais une analyse des KPI commerciaux et propose des recommandations.", user: USERS.admin, tool: "get_dashboard_kpis" },
  { id: "ana-20", message: "Analyse complète du pipeline avec recommandations sur la conversion.", user: USERS.admin, tool: "get_professional_dashboard" },
  { id: "ana-21", message: "Peux-tu analyser les devis en cours et proposer des recommandations ?", user: USERS.admin, tool: null },
  { id: "ana-22", message: "Analyse les interventions critiques et propose des recommandations.", user: USERS.admin, tool: "get_maintenance_stats" },
  { id: "ana-23", message: "Analyse les projets prioritaires et propose des recommandations d'action.", user: USERS.user, tool: "list_projects" },
  { id: "ana-24", message: "Peux-tu analyser mes indicateurs KPI personnels et proposer des recommandations ?", user: USERS.user, tool: "get_dashboard_kpis" },
].forEach((s) =>
  SCENARIOS.push(
    scenario({
      id: s.id,
      persona: "Direction",
      message: s.message,
      actingUser: s.user,
      expectedIntent: "business_analysis",
      expectedModuleKey: null,
      expectedAgent: "business_analyst_agent",
      expectedContext: "tools",
      expectedAgentAllowed: true,
      expectedTools: s.tool ? [s.tool] : [],
      expectedResponseHint: "Doit expliquer le résultat, les causes, les risques puis proposer des recommandations — jamais inventer un chiffre (voir le domaine 'devis', non couvert par un Tool existant).",
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// DIRECTION — intention `recommendation` (Agent: recommendation_agent)
// Priorités/tâches/clients à relancer/projets critiques/risques/anomalies/
// actions recommandées — voir RECOMMENDATION_AGENT.md
// ═══════════════════════════════════════════════════════════════════════
const RECOMMENDATION_TOOLS = ["list_projects", "get_maintenance_stats"];
[
  { id: "rec-01", message: "Conseille-moi sur mes priorités du jour.", user: USERS.user },
  { id: "rec-02", message: "Quelles tâches dois-je prioriser aujourd'hui ?", user: USERS.user },
  { id: "rec-03", message: "Peux-tu me conseiller sur les clients à recontacter en urgence ?", user: USERS.commercial },
  { id: "rec-04", message: "Conseille-moi et priorise ce qui nécessite le plus d'attention en ce moment.", user: USERS.user },
  { id: "rec-05", message: "Peux-tu me conseiller sur les risques à surveiller cette semaine ?", user: USERS.admin },
  { id: "rec-06", message: "Détecte les anomalies dans mes données et conseille-moi.", user: USERS.admin },
  { id: "rec-07", message: "Quelles actions me conseilles-tu de prioriser aujourd'hui ?", user: USERS.admin },
  { id: "rec-08", message: "En tant que conseiller, que dois-je faire en priorité aujourd'hui ?", user: USERS.superadmin },
  { id: "rec-09", message: "Conseille-moi et priorise les projets à traiter cette semaine.", user: USERS.user },
  { id: "rec-10", message: "Quelles anomalies détectes-tu dans mes données actuellement ?", user: USERS.admin },
  { id: "rec-11", message: "Priorise mes tâches de la journée s'il te plaît.", user: USERS.user },
  { id: "rec-12", message: "Peux-tu me conseiller et prioriser les projets critiques à surveiller ?", user: USERS.user },
  { id: "rec-13", message: "Conseille-moi sur les clients à recontacter avant la fin du mois.", user: USERS.commercial },
  { id: "rec-14", message: "Conseille-moi : quelles anomalies as-tu identifiées dans les fiches projet ?", user: USERS.admin },
  { id: "rec-15", message: "En tant que conseiller, priorise mes actions pour demain.", user: USERS.superadmin },
  { id: "rec-16", message: "Conseille-moi sur les risques à anticiper ce mois-ci.", user: USERS.admin },
  { id: "rec-17", message: "Priorise les dossiers qui nécessitent une attention immédiate.", user: USERS.user },
  { id: "rec-18", message: "Peux-tu me conseiller sur les anomalies détectées récemment ?", user: USERS.admin },
  { id: "rec-19", message: "Conseille-moi : quelles tâches importantes ai-je oubliées ?", user: USERS.user },
  { id: "rec-20", message: "Conseille-moi et priorise mes projets critiques pour cette semaine.", user: USERS.user },
  { id: "rec-21", message: "Quels conseils me donnes-tu sur mes priorités du trimestre ?", user: USERS.superadmin },
  { id: "rec-22", message: "Conseille-moi sur les actions recommandées pour ce mois.", user: USERS.admin },
].forEach((s) =>
  SCENARIOS.push(
    scenario({
      id: s.id,
      persona: "Direction",
      message: s.message,
      actingUser: s.user,
      expectedIntent: "recommendation",
      expectedModuleKey: null,
      expectedAgent: "recommendation_agent",
      expectedContext: "tools",
      expectedAgentAllowed: true,
      expectedTools: RECOMMENDATION_TOOLS,
      expectedResponseHint: "Doit proposer priorités/tâches importantes/clients à relancer/projets critiques/risques/anomalies/actions recommandées — chaque élément justifié par une raison réelle, jamais une recommandation générique.",
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// DIRECTION / ADMINISTRATION — intention `data_quality` (Agent: data_quality_agent)
// Doublons/informations manquantes/emails/téléphones invalides/documents
// manquants/incohérences/erreurs de workflow/données orphelines + Score
// Qualité — voir DATA_QUALITY_AGENT.md
// ═══════════════════════════════════════════════════════════════════════
const DATA_QUALITY_TOOLS = ["list_projects"];
[
  { id: "dq-01", message: "Détecte les doublons et incohérences dans mes projets.", user: USERS.admin },
  { id: "dq-02", message: "Quel est le score de qualité de mes données ?", user: USERS.admin },
  { id: "dq-03", message: "Vérifie la qualité : y a-t-il des projets orphelins dans le CRM ?", user: USERS.superadmin },
  { id: "dq-04", message: "Vérifie la qualité des données et propose des corrections.", user: USERS.admin },
  { id: "dq-05", message: "Y a-t-il des incohérences dans mes fiches ?", user: USERS.user },
  { id: "dq-06", message: "Quelle est la qualité des emails et téléphones renseignés ?", user: USERS.admin },
  { id: "dq-07", message: "Fais un audit qualité complet avec un score et des corrections proposées.", user: USERS.superadmin },
  { id: "dq-08", message: "Combien de doublons et incohérences as-tu trouvés parmi mes projets ?", user: USERS.admin },
  { id: "dq-09", message: "Vérifie la qualité : y a-t-il des fiches orphelines dans le CRM ?", user: USERS.admin },
  { id: "dq-10", message: "Quelle est la qualité globale de mes fiches dans le CRM ?", user: USERS.admin },
  { id: "dq-11", message: "Y a-t-il des doublons de noms dans les fiches du CRM ?", user: USERS.admin },
  { id: "dq-12", message: "Détecte les incohérences et la qualité des fiches archivées de l'entreprise.", user: USERS.admin },
  { id: "dq-13", message: "Score de qualité : quelles fiches ont des données manquantes ?", user: USERS.admin },
  { id: "dq-14", message: "Vérifie la qualité des numéros de téléphone renseignés.", user: USERS.admin },
  { id: "dq-15", message: "Quelles incohérences de qualité existent dans le statut des fiches ?", user: USERS.superadmin },
  { id: "dq-16", message: "Audit de qualité : combien de projets sont orphelins ?", user: USERS.admin },
  { id: "dq-17", message: "Détecte les doublons et les données orphelines de ce trimestre.", user: USERS.admin },
  { id: "dq-18", message: "Quel est le score de qualité après les dernières corrections ?", user: USERS.admin },
  { id: "dq-19", message: "Vérifie s'il y a des incohérences dans les montants de marché.", user: USERS.superadmin },
  { id: "dq-20", message: "Propose des corrections pour les doublons détectés.", user: USERS.admin },
  { id: "dq-21", message: "Qualité des données : combien d'emails invalides sont recensés ?", user: USERS.admin },
].forEach((s) =>
  SCENARIOS.push(
    scenario({
      id: s.id,
      persona: "Direction",
      message: s.message,
      actingUser: s.user,
      expectedIntent: "data_quality",
      expectedModuleKey: null,
      expectedAgent: "data_quality_agent",
      expectedContext: "tools",
      expectedAgentAllowed: true,
      expectedTools: DATA_QUALITY_TOOLS,
      expectedResponseHint: "Doit détecter doublons/informations manquantes/emails invalides/téléphones invalides/documents manquants/incohérences/erreurs de workflow/données orphelines, calculer un Score Qualité, et PROPOSER des corrections sans jamais modifier une donnée.",
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// RECHERCHE AVANCÉE — intention `advanced_search` (Agent: advanced_search_agent)
// voir ADVANCED_SEARCH_AGENT.md — "chantiers" plutôt que "projets" dans ces
// messages : le mot "projets" appartient déjà à l'intention `projects`
// (enregistrée plus tôt dans le catalogue) et gagnerait la comparaison de
// score contre le seul mot-clé de recherche, voir ADVANCED_SEARCH_AGENT.md.
// ═══════════════════════════════════════════════════════════════════════
[
  { id: "search-01", message: "Recherche les chantiers créés en juin.", user: USERS.admin, tool: "list_projects" },
  { id: "search-02", message: "Filtre les chantiers créés en mars 2025.", user: USERS.user, tool: "list_projects" },
  { id: "search-03", message: "Trouve les chantiers dont le montant du marché dépasse 50 000 €.", user: USERS.admin, tool: "list_projects" },
  { id: "search-04", message: "Cherche les devis qui dépassent 50 000 €.", user: USERS.admin, tool: "list_projects" },
  { id: "search-05", message: "Trouve les clients qui n'ont jamais acheté.", user: USERS.commercial, tool: null },
  { id: "search-06", message: "Trouve les commerciaux qui n'ont aucune activité cette semaine.", user: USERS.admin, tool: "get_commercial_contact_kpi" },
  { id: "search-07", message: "Cherche les commerciaux sans activité cette semaine.", user: USERS.user, tool: "get_commercial_contact_kpi", expectedDenied: true },
  { id: "search-08", message: "Recherche les chantiers créés en juin dont le montant du marché dépasse 20 000 €.", user: USERS.admin, tool: "list_projects" },
  { id: "search-09", message: "Recherche quelque chose d'improbable dans le CRM.", user: USERS.user, tool: null },
  { id: "search-10", message: "Recherche les chantiers créés en janvier.", user: USERS.admin, tool: "list_projects" },
  { id: "search-11", message: "Trouve les chantiers créés en septembre 2024.", user: USERS.admin, tool: "list_projects" },
  { id: "search-12", message: "Cherche les chantiers dont le montant du marché dépasse 80 000 €.", user: USERS.admin, tool: "list_projects" },
  { id: "search-13", message: "Filtre les chantiers dont le montant est inférieur à 10 000 €.", user: USERS.user, tool: "list_projects" },
  { id: "search-14", message: "Recherche les commerciaux sans activité cette semaine.", user: USERS.admin, tool: "get_commercial_contact_kpi" },
  { id: "search-15", message: "Trouve les clients qui n'ont jamais acheté de produit.", user: USERS.commercial, tool: null },
  { id: "search-16", message: "Cherche les chantiers créés en avril dont le montant dépasse 30 000 €.", user: USERS.admin, tool: "list_projects" },
  { id: "search-17", message: "Recherche les devis qui dépassent 100 000 €.", user: USERS.admin, tool: "list_projects" },
  { id: "search-18", message: "Filtre les chantiers créés en décembre 2023.", user: USERS.user, tool: "list_projects" },
  { id: "search-19", message: "Trouve les chantiers dont le montant du marché est supérieur à 60 000 €.", user: USERS.admin, tool: "list_projects" },
  { id: "search-20", message: "Recherche quelque chose de très spécifique et improbable.", user: USERS.user, tool: null },
  { id: "search-21", message: "Cherche les commerciaux sans activité récente cette semaine.", user: USERS.user, tool: "get_commercial_contact_kpi", expectedDenied: true },
  { id: "search-22", message: "Trouve les chantiers créés en juillet dont le montant dépasse 40 000 €.", user: USERS.admin, tool: "list_projects" },
  { id: "search-23", message: "Recherche les chantiers créés en février 2025.", user: USERS.admin, tool: "list_projects" },
].forEach((s) =>
  SCENARIOS.push(
    scenario({
      id: s.id,
      persona: "Direction",
      message: s.message,
      actingUser: s.user,
      expectedIntent: "advanced_search",
      expectedModuleKey: null,
      expectedAgent: "advanced_search_agent",
      expectedContext: "tools",
      expectedAgentAllowed: true, // advanced_search_agent est ouvert ; c'est le Tool qui restreint
      expectedTools: s.tool ? [s.tool] : [],
      toolCheck: s.expectedDenied ? { tool: s.tool, expectedAllowed: false } : null,
      expectedResponseHint:
        "Doit combiner plusieurs AI Tools pour répondre à un critère de recherche complexe (période, seuil de montant, absence de correspondance), et dire clairement quand une donnée demandée (ex. un montant de devis) n'existe dans aucun Tool plutôt que de l'inventer.",
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// USERS / ADMINISTRATION — intention `users` (pas d'Agent dédié)
// ═══════════════════════════════════════════════════════════════════════
[
  { id: "usr-01", message: "Liste-moi tous les utilisateurs actifs.", user: USERS.admin },
  { id: "usr-02", message: "Je veux désactiver le compte de Karim.", user: USERS.admin },
  { id: "usr-03", message: "Quel est le rôle de Sami dans le système ?", user: USERS.admin },
  { id: "usr-04", message: "Peux-tu activer le compte de la nouvelle recrue ?", user: USERS.admin },
  { id: "usr-05", message: "Montre-moi mon profil utilisateur.", user: USERS.user },
  { id: "usr-06", message: "Combien de comptes utilisateurs avons-nous au total ?", user: USERS.admin },
  { id: "usr-07", message: "Change le rôle de Yasmine en commercial.", user: USERS.superadmin },
  { id: "usr-08", message: "Quels utilisateurs ont le rôle admin actuellement ?", user: USERS.admin },
  { id: "usr-09", message: "Un utilisateur standard peut-il désactiver un autre compte ?", user: USERS.user, expectedDenied: true },
  { id: "usr-10", message: "Mets à jour mon profil utilisateur avec mon nouveau numéro.", user: USERS.user },
  { id: "usr-11", message: "Liste les utilisateurs filtrés par rôle commercial.", user: USERS.admin },
  { id: "usr-12", message: "Un rôle admin simple peut-il changer le rôle d'un compte ?", user: USERS.admin, expectedDenied: true, tool: "set_user_role" },
  { id: "usr-13", message: "Combien de comptes utilisateurs sont actifs actuellement ?", user: USERS.admin },
  { id: "usr-14", message: "Désactive le compte de l'ancien employé Karim.", user: USERS.admin },
  { id: "usr-15", message: "Quel est le profil complet de l'utilisateur Sami ?", user: USERS.admin },
  { id: "usr-16", message: "Qui peut changer mon rôle utilisateur ?", user: USERS.user },
  { id: "usr-17", message: "Active le compte d'un utilisateur récemment créé.", user: USERS.admin },
  { id: "usr-18", message: "Liste tous les comptes utilisateurs avec le rôle superadmin.", user: USERS.superadmin },
  { id: "usr-19", message: "Mets à jour le profil utilisateur de Nadia avec sa nouvelle adresse.", user: USERS.admin },
  { id: "usr-20", message: "Un utilisateur standard peut-il désactiver son propre compte ?", user: USERS.user, expectedDenied: true, tool: "set_user_active" },
  { id: "usr-21", message: "Quels comptes utilisateurs ont été désactivés ce mois ?", user: USERS.admin },
  { id: "usr-22", message: "Le rôle admin peut-il consulter le profil de tous les utilisateurs ?", user: USERS.admin },
  { id: "usr-23", message: "Combien d'utilisateurs ont le rôle commercial dans le système ?", user: USERS.admin },
  { id: "usr-24", message: "Réactive le compte utilisateur qui avait été suspendu.", user: USERS.admin },
  { id: "usr-25", message: "Quel est mon rôle actuel dans le système ?", user: USERS.user },
  { id: "usr-26", message: "Liste les comptes utilisateurs inactifs depuis plus de 6 mois.", user: USERS.admin },
].forEach((s) =>
  SCENARIOS.push(
    scenario({
      id: s.id,
      persona: "Administration",
      message: s.message,
      actingUser: s.user,
      expectedIntent: "users",
      expectedModuleKey: "users",
      expectedAgent: null,
      expectedContext: "tools",
      expectedAgentAllowed: null,
      expectedTools: ["list_users", "get_my_profile", "set_user_active", "set_user_role"],
      toolCheck: s.tool ? { tool: s.tool, expectedAllowed: !s.expectedDenied } : (s.expectedDenied ? { tool: "set_user_active", expectedAllowed: false } : null),
      expectedResponseHint: "Doit citer des utilisateurs/rôles réels, jamais inventer un compte.",
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// PIPELINE COMMERCIAL — intention `pipeline` (Agent: pipeline_agent, ouvert)
// ═══════════════════════════════════════════════════════════════════════
[
  { id: "pip-01", message: "Quel est l'état actuel du pipeline commercial ?", user: USERS.user },
  { id: "pip-02", message: "Liste-moi toutes les étapes du pipeline.", user: USERS.user },
  { id: "pip-03", message: "Crée une nouvelle étape de pipeline nommée 'Négociation avancée'.", user: USERS.admin },
  { id: "pip-04", message: "Réorganise les étapes du pipeline dans le bon ordre.", user: USERS.admin },
  { id: "pip-05", message: "Quelle est la position de l'étape 'Signature' dans le pipeline ?", user: USERS.user },
  { id: "pip-06", message: "Supprime l'étape de pipeline qui n'est plus utilisée.", user: USERS.admin },
  { id: "pip-07", message: "Mets à jour le nom de l'étape 'Prospection' du pipeline.", user: USERS.admin },
  { id: "pip-08", message: "Un utilisateur standard peut-il créer une étape de pipeline ?", user: USERS.user, expectedDenied: true, tool: "create_pipeline_stage" },
  { id: "pip-09", message: "Notre pipeline commercial contient combien d'étape en tout ?", user: USERS.user },
  { id: "pip-10", message: "Détail de l'étape de pipeline 'Qualification'.", user: USERS.user },
  { id: "pip-11", message: "Quelles étapes du pipeline sont marquées comme gagnées ?", user: USERS.user },
  { id: "pip-12", message: "Réordonne les étapes du pipeline commercial selon la nouvelle stratégie.", user: USERS.superadmin },
  { id: "pip-13", message: "Quelle est la prochaine opportunité à traiter dans le pipeline ?", user: USERS.user },
  { id: "pip-14", message: "Ajoute une nouvelle étape au pipeline commercial nommée 'Relance finale'.", user: USERS.admin },
  { id: "pip-15", message: "Combien d'opportunités sont actuellement dans le pipeline ?", user: USERS.user },
  { id: "pip-16", message: "Quel est l'ordre des étapes dans notre pipeline de vente ?", user: USERS.user },
  { id: "pip-17", message: "Supprime l'étape de pipeline devenue obsolète.", user: USERS.admin },
  { id: "pip-18", message: "Quelles opportunités sont bloquées dans le pipeline depuis longtemps ?", user: USERS.user },
  { id: "pip-19", message: "Renomme l'étape 'Contact initial' du pipeline commercial.", user: USERS.admin },
  { id: "pip-20", message: "Le pipeline contient-il une étape de signature finale ?", user: USERS.user },
  { id: "pip-21", message: "Un utilisateur standard peut-il réorganiser l'étape du pipeline commercial ?", user: USERS.user, expectedDenied: true, tool: "reorder_pipeline_stages" },
  { id: "pip-22", message: "Quelle position occupe l'étape 'Négociation' dans le pipeline ?", user: USERS.user },
  { id: "pip-23", message: "Combien d'étapes composent notre pipeline commercial actuel ?", user: USERS.user },
  { id: "pip-24", message: "Crée une étape de pipeline pour les opportunités perdues.", user: USERS.admin },
  { id: "pip-25", message: "Quelles opportunités du pipeline sont marquées comme perdues ?", user: USERS.user },
  { id: "pip-26", message: "Mets à jour la couleur de l'étape 'Qualification' du pipeline.", user: USERS.admin },
].forEach((s) =>
  SCENARIOS.push(
    scenario({
      id: s.id,
      persona: "Commercial",
      message: s.message,
      actingUser: s.user,
      expectedIntent: "pipeline",
      expectedModuleKey: "pipeline",
      expectedAgent: "pipeline_agent",
      expectedContext: "tools",
      expectedAgentAllowed: true,
      expectedTools: [s.tool || "list_pipeline_stages"],
      toolCheck: s.tool ? { tool: s.tool, expectedAllowed: !s.expectedDenied } : null,
      expectedResponseHint: "Doit citer des étapes réelles du pipeline, jamais une étape inventée.",
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// MAINTENANCE — intention `maintenance` (Agent: maintenance_agent, ouvert)
// requiredRoles TOOL-level (manager-tier) : accept/reject/assign/start/complete
// ═══════════════════════════════════════════════════════════════════════
[
  { id: "mnt-01", message: "Il y a une panne sur la machine de production, signale une demande de maintenance.", user: USERS.user },
  { id: "mnt-02", message: "Liste mes demandes de maintenance en cours.", user: USERS.user },
  { id: "mnt-03", message: "Accepte la demande de maintenance numéro 12.", user: USERS.logistique },
  { id: "mnt-04", message: "Affecte un technicien à la demande de maintenance urgente.", user: USERS.admin },
  { id: "mnt-05", message: "Quelles sont les statistiques des demandes de maintenance ce mois ?", user: USERS.admin },
  { id: "mnt-06", message: "Un rôle standard peut-il accepter une demande de maintenance ou de réparation ?", user: USERS.user, expectedDenied: true, tool: "accept_maintenance_request" },
  { id: "mnt-07", message: "Démarre l'intervention sur la demande de maintenance déjà acceptée.", user: USERS.logistique },
  { id: "mnt-08", message: "Marque la demande de maintenance comme terminée.", user: USERS.admin },
  { id: "mnt-09", message: "Refuse la demande de réparation avec le motif 'doublon'.", user: USERS.admin },
  { id: "mnt-10", message: "Liste tous les techniciens de maintenance disponibles.", user: USERS.logistique },
  { id: "mnt-11", message: "Ajoute un commentaire sur la demande de maintenance en cours.", user: USERS.user },
  { id: "mnt-12", message: "L'adresse email du responsable maintenance peut-elle accepter une intervention ?", user: USERS.maintenanceManagerByEmail },
  { id: "mnt-13", message: "Quel est l'historique de la demande de maintenance sur le compresseur ?", user: USERS.user },
  { id: "mnt-14", message: "Liste toutes les demandes de maintenance filtrées par urgence critique.", user: USERS.admin },
  { id: "mnt-15", message: "Signale une panne sur le compresseur de la ligne 3.", user: USERS.user },
  { id: "mnt-16", message: "Combien d'interventions de maintenance sont en attente ?", user: USERS.admin },
  { id: "mnt-17", message: "Quel technicien est disponible pour une intervention urgente ?", user: USERS.logistique },
  { id: "mnt-18", message: "Accepte la demande de réparation numéro 27.", user: USERS.admin },
  { id: "mnt-19", message: "Liste les interventions de maintenance terminées ce mois.", user: USERS.admin },
  { id: "mnt-20", message: "Un technicien peut-il refuser une demande de maintenance ?", user: USERS.logistique },
  { id: "mnt-21", message: "Quelle est la durée moyenne d'une intervention de maintenance ?", user: USERS.admin },
  { id: "mnt-22", message: "Affecte le technicien Karim à la panne signalée hier.", user: USERS.admin },
  { id: "mnt-23", message: "Combien de demandes de maintenance ont été signalées cette semaine ?", user: USERS.admin },
  { id: "mnt-24", message: "Marque la réparation de la machine comme terminée.", user: USERS.admin },
  { id: "mnt-25", message: "Quel est le statut de l'intervention de maintenance sur le site Sfax ?", user: USERS.user },
  { id: "mnt-26", message: "Liste toutes les demandes de maintenance urgentes non traitées.", user: USERS.admin },
  { id: "mnt-27", message: "Un utilisateur standard peut-il accepter une intervention de maintenance urgente ?", user: USERS.user, expectedDenied: true, tool: "accept_maintenance_request" },
  { id: "mnt-28", message: "Quel technicien est affecté aux interventions de maintenance ce mois ?", user: USERS.admin },
].forEach((s) =>
  SCENARIOS.push(
    scenario({
      id: s.id,
      persona: "Maintenance",
      message: s.message,
      actingUser: s.user,
      expectedIntent: "maintenance",
      expectedModuleKey: "maintenance",
      expectedAgent: "maintenance_agent",
      expectedContext: "tools",
      expectedAgentAllowed: true,
      expectedTools: [s.tool || "list_my_maintenance_requests"],
      toolCheck: s.tool ? { tool: s.tool, expectedAllowed: !s.expectedDenied } : null,
      expectedResponseHint: "Doit citer des demandes de maintenance réelles, jamais un statut inventé.",
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// NOTIFICATIONS — intention `notifications` (Agent: notification_agent, ouvert)
// ═══════════════════════════════════════════════════════════════════════
[
  { id: "not-01", message: "Ai-je des notifications non lues ?", user: USERS.user },
  { id: "not-02", message: "Marque toutes mes notifications comme lues.", user: USERS.user },
  { id: "not-03", message: "Supprime la notification liée à l'alerte de retard.", user: USERS.user },
  { id: "not-04", message: "Marque la notification numéro 7 comme lue.", user: USERS.user },
  { id: "not-05", message: "Envoie un email de notification à Karim.", user: USERS.admin },
  { id: "not-06", message: "Un rôle standard peut-il envoyer une alerte de notification par email à un collègue ?", user: USERS.user, expectedDenied: true, tool: "send_notification_email" },
  { id: "not-07", message: "Combien de notifications ai-je reçues aujourd'hui ?", user: USERS.user },
  { id: "not-08", message: "Liste mes notifications les plus récentes.", user: USERS.user },
  { id: "not-09", message: "Supprime toutes mes anciennes notifications d'alerte.", user: USERS.user },
  { id: "not-10", message: "Envoie une notification par email à l'équipe pour l'alerte de retard.", user: USERS.superadmin },
  { id: "not-11", message: "Combien de notifications d'alerte ai-je reçues cette semaine ?", user: USERS.user },
  { id: "not-12", message: "Marque la notification de retard comme lue.", user: USERS.user },
  { id: "not-13", message: "Supprime toutes mes notifications déjà lues.", user: USERS.user },
  { id: "not-14", message: "Ai-je une alerte ou une notification en attente cette semaine ?", user: USERS.user },
  { id: "not-15", message: "Liste mes notifications non lues des dernières 24 heures.", user: USERS.user },
  { id: "not-16", message: "Envoie une alerte par notification à toute l'équipe commerciale.", user: USERS.superadmin, tool: "send_notification_email" },
  { id: "not-17", message: "Combien de notifications ai-je supprimées ce mois ?", user: USERS.user },
  { id: "not-18", message: "Marque ma notification d'alerte comme lue.", user: USERS.user },
  { id: "not-19", message: "Un rôle standard peut-il envoyer une notification d'alerte à un collègue ?", user: USERS.user, expectedDenied: true, tool: "send_notification_email" },
  { id: "not-20", message: "Quelle est ma dernière notification non lue ?", user: USERS.user },
  { id: "not-21", message: "Supprime la notification concernant l'alerte de qualité.", user: USERS.user },
  { id: "not-22", message: "Envoie une notification d'alerte au responsable maintenance.", user: USERS.admin, tool: "send_notification_email" },
  { id: "not-23", message: "Combien de notifications d'alerte actives ai-je actuellement ?", user: USERS.user },
  { id: "not-24", message: "Marque la notification numéro 15 comme lue.", user: USERS.user },
].forEach((s) =>
  SCENARIOS.push(
    scenario({
      id: s.id,
      persona: "Tous rôles",
      message: s.message,
      actingUser: s.user,
      expectedIntent: "notifications",
      expectedModuleKey: "notifications",
      expectedAgent: "notification_agent",
      expectedContext: "tools",
      expectedAgentAllowed: true,
      expectedTools: [s.tool || "list_my_notifications"],
      toolCheck: s.tool ? { tool: s.tool, expectedAllowed: !s.expectedDenied } : null,
      expectedResponseHint: "Doit citer des notifications réelles de l'utilisateur, jamais en inventer une.",
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// INDUSTRIEL — intention `industrial` (Agent: industrial_agent, restreint)
// requiredRoles agent : admin/superadmin/superadmin2/responsable_logistique_achat
// ═══════════════════════════════════════════════════════════════════════
[
  { id: "ind-01", message: "Crée une fiche de production industrielle pour le mélange PROBAR.", user: USERS.logistique },
  { id: "ind-02", message: "Quel est l'état de la fiche de production industrielle de cette semaine ?", user: USERS.admin },
  { id: "ind-03", message: "Détail de la fiche industrielle numéro 88.", user: USERS.logistique },
  { id: "ind-04", message: "Met à jour la fiche industrielle du mélange en cours.", user: USERS.admin },
  { id: "ind-05", message: "Supprime la fiche industrielle erronée.", user: USERS.superadmin },
  { id: "ind-06", message: "Un rôle standard peut-il consulter la fiche de production industrielle ?", user: USERS.user, expectedDenied: true },
  { id: "ind-07", message: "Quel type de fiche industrielle avons-nous créé le plus ce mois ?", user: USERS.admin },
  { id: "ind-08", message: "Un responsable logistique peut-il supprimer une fiche industrielle ?", user: USERS.logistique, expectedDenied: true, tool: "delete_industrial_record" },
  { id: "ind-09", message: "Crée un enregistrement de production industrielle pour la ligne PROMESH.", user: USERS.logistique },
  { id: "ind-10", message: "Montre-moi ma dernière fiche de production industrielle.", user: USERS.logistique },
  { id: "ind-11", message: "Quelle est la quantité de production industrielle enregistrée aujourd'hui ?", user: USERS.admin },
  { id: "ind-12", message: "Crée un enregistrement de production pour la fiche industrielle du jour.", user: USERS.logistique },
  { id: "ind-13", message: "Quelle est la quantité de fiche de production industrielle créée cette semaine ?", user: USERS.admin },
  { id: "ind-14", message: "Modifie l'enregistrement industriel numéro 45.", user: USERS.admin },
  { id: "ind-15", message: "Quel est le volume de production industrielle de ce trimestre ?", user: USERS.admin },
  { id: "ind-16", message: "Supprime l'enregistrement de production industrielle erroné.", user: USERS.superadmin },
  { id: "ind-17", message: "Détail complet de la fiche industrielle de la ligne PROBAR.", user: USERS.logistique },
  { id: "ind-18", message: "Un responsable logistique peut-il créer une fiche industrielle ?", user: USERS.logistique },
  { id: "ind-19", message: "Combien d'enregistrement industriel est lié à la ligne PROBAR ?", user: USERS.admin },
  { id: "ind-20", message: "Un utilisateur standard peut-il modifier une fiche de production industrielle ?", user: USERS.user, expectedDenied: true },
  { id: "ind-21", message: "Quelle fiche industrielle a le plus gros volume de production ce mois ?", user: USERS.admin },
  { id: "ind-22", message: "Crée une fiche industrielle pour le nouvel enregistrement de production.", user: USERS.logistique },
  { id: "ind-23", message: "Historique complet de la fiche industrielle numéro 12.", user: USERS.admin },
  { id: "ind-24", message: "Combien de fiches de production industrielle sont en attente de validation ?", user: USERS.logistique },
].forEach((s) =>
  SCENARIOS.push(
    scenario({
      id: s.id,
      persona: "Industriel",
      message: s.message,
      actingUser: s.user,
      expectedIntent: "industrial",
      expectedModuleKey: "industrial",
      expectedAgent: "industrial_agent",
      expectedContext: "tools",
      expectedAgentAllowed: !(s.user === USERS.user),
      expectedTools: [s.tool || "list_industrial_records"],
      toolCheck: s.tool ? { tool: s.tool, expectedAllowed: !s.expectedDenied } : null,
      expectedResponseHint: "Doit citer des fiches industrielles réelles, jamais un chiffre de production inventé.",
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// POR PROMESH — intention `por_promesh`, Agent : por_promesh_agent (mission
// "IMPLÉMENTER HRAgent ET PorPromeshAgent" — requiredRoles identiques à
// industrial_agent, même ensemble READ_WRITE_ROLES, même formule de calcul
// que le bloc `industrial` ci-dessus)
// ═══════════════════════════════════════════════════════════════════════
[
  { id: "por-01", message: "Crée une fiche POR PROMESH pour le poste ligne 2.", user: USERS.logistique },
  { id: "por-02", message: "Quel est le dashboard du poste POR PROMESH aujourd'hui ?", user: USERS.admin },
  { id: "por-03", message: "Liste les opérateurs éligibles pour une fiche POR PROMESH.", user: USERS.logistique },
  { id: "por-04", message: "Valide définitivement la fiche POR PROMESH numéro 15.", user: USERS.admin },
  { id: "por-05", message: "Un utilisateur standard peut-il valider une fiche POR PROMESH ?", user: USERS.user, expectedDenied: true },
  { id: "por-06", message: "Statistiques de production POR PROMESH des 7 derniers jours.", user: USERS.logistique },
  { id: "por-07", message: "Détail complet de la fiche POR PROMESH en brouillon.", user: USERS.admin },
  { id: "por-08", message: "Supprime la fiche POR PROMESH brouillon erronée.", user: USERS.superadmin },
  { id: "por-09", message: "Ouvre un nouveau brouillon POR PROMESH pour la machine 4.", user: USERS.logistique },
  { id: "por-10", message: "Combien de fiches POR PROMESH ont été validées cette semaine ?", user: USERS.admin },
  { id: "por-11", message: "Combien de fiches POR PROMESH sont en attente de validation ?", user: USERS.admin },
  { id: "por-12", message: "Quel opérateur a créé le plus de fiches POR PROMESH ce mois ?", user: USERS.admin },
  { id: "por-13", message: "Détail du dashboard POR PROMESH pour le poste de nuit.", user: USERS.logistique },
  { id: "por-14", message: "Valide la fiche POR PROMESH numéro 22.", user: USERS.admin },
  { id: "por-15", message: "Liste les fiches POR PROMESH en brouillon depuis plus d'une semaine.", user: USERS.admin },
  { id: "por-16", message: "Un opérateur peut-il valider sa propre fiche POR PROMESH ?", user: USERS.logistique },
  { id: "por-17", message: "Combien de fiches POR PROMESH ont été refusées ce trimestre ?", user: USERS.admin },
  { id: "por-18", message: "Statistiques de non-conformité POR PROMESH de la semaine.", user: USERS.logistique },
  { id: "por-19", message: "Supprime la fiche POR PROMESH en double.", user: USERS.superadmin },
  { id: "por-20", message: "Quels opérateurs sont éligibles pour la fiche POR PROMESH du poste matin ?", user: USERS.logistique },
  { id: "por-21", message: "Détail de la fiche POR PROMESH validée hier.", user: USERS.admin },
  { id: "por-22", message: "Combien de fiches POR PROMESH la machine 2 a-t-elle produit ce mois ?", user: USERS.logistique },
  { id: "por-23", message: "Un utilisateur standard peut-il créer une fiche POR PROMESH ?", user: USERS.user, expectedDenied: true },
  { id: "por-24", message: "Ouvre une nouvelle fiche POR PROMESH pour le poste de nuit.", user: USERS.logistique },
].forEach((s) =>
  SCENARIOS.push(
    scenario({
      id: s.id,
      persona: "Qualité / Production",
      message: s.message,
      actingUser: s.user,
      expectedIntent: "por_promesh",
      expectedModuleKey: "porPromesh",
      expectedAgent: "por_promesh_agent",
      expectedContext: "tools",
      expectedAgentAllowed: !(s.user === USERS.user),
      expectedTools: ["list_por_promesh", "get_por_promesh_dashboard", "validate_por_promesh"],
      toolCheck: { tool: "validate_por_promesh", expectedAllowed: !s.expectedDenied },
      expectedResponseHint: "Doit citer des fiches POR PROMESH réelles, jamais un taux de conformité inventé.",
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// AUTOMATISATION — intention `automation` (Agent: automation_agent, admin-tier)
// ═══════════════════════════════════════════════════════════════════════
[
  { id: "aut-01", message: "Peux-tu automatiser en une séquence la création d'un rappel dès qu'un dossier est en retard ?", user: USERS.admin },
  { id: "aut-02", message: "Mets en place un workflow pour enchaîner automatiquement la création d'une demande de maintenance et une notification.", user: USERS.superadmin },
  { id: "aut-03", message: "Est-ce qu'un rôle standard peut déclencher une automatisation ou un workflow en plusieurs étapes ?", user: USERS.user, expectedDenied: true },
  { id: "aut-04", message: "Peux-tu planifier une séquence d'actions récurrente chaque lundi pour automatiser le suivi ?", user: USERS.admin },
  { id: "aut-05", message: "Mets en place un workflow pour automatiser l'envoi mensuel d'un résumé.", user: USERS.superadmin },
  { id: "aut-06", message: "Crée un workflow pour enchaîner automatiquement le traitement des dossiers en attente.", user: USERS.admin },
  { id: "aut-07", message: "Quelles étapes automatiser pour le workflow de maintenance ?", user: USERS.admin },
  { id: "aut-08", message: "Peux-tu déclencher une automatisation en plusieurs étapes pour moi ?", user: USERS.commercial, expectedDenied: true },
  { id: "aut-09", message: "Mets en place une séquence automatique en plusieurs étapes pour le suivi qualité.", user: USERS.superadmin },
  { id: "aut-10", message: "Automatiser en une séquence l'assignation des responsables non affectés.", user: USERS.admin },
  // Les 5 actions demandées — voir AUTOMATION_WORKFLOWS.md. "workflow" +
  // "automatiser" (2 mots-clés) plutôt que "projet"/"rapport" seuls : ces
  // derniers appartiennent déjà à `projects`/`reporting` (enregistrées plus
  // tôt dans le catalogue, gagneraient toute égalité de score).
  { id: "aut-11", message: "Mets en place un workflow pour automatiser la création d'une activité sur ce projet.", user: USERS.admin },
  { id: "aut-12", message: "Mets en place un workflow pour automatiser la création d'un rappel sur le projet Alpha.", user: USERS.admin },
  { id: "aut-13", message: "Mets en place un workflow pour automatiser la planification d'un rendez-vous avec le client.", user: USERS.superadmin },
  { id: "aut-14", message: "Mets en place un workflow pour automatiser la préparation d'un email pour ce client.", user: USERS.admin },
  { id: "aut-15", message: "Mets en place un workflow pour automatiser la génération d'un rapport mensuel.", user: USERS.superadmin },
  // Tour 2 (confirmer/annuler) : ne teste que le ROUTAGE ici (Tier 1 est
  // strictement mono-tour) — le cycle complet propose→confirme/annule est
  // couvert par test/ai.automation.confirmationFlow.test.js.
  { id: "aut-16", message: "Confirme.", user: USERS.admin },
  { id: "aut-17", message: "Annule.", user: USERS.admin },
  { id: "aut-18", message: "Mets en place un workflow en plusieurs étapes pour automatiser la relance des contacts commerciaux en retard.", user: USERS.admin },
  { id: "aut-19", message: "Mets en place un workflow avec une séquence automatique pour enchaîner les étapes de validation POR PROMESH.", user: USERS.superadmin },
  { id: "aut-20", message: "Mets en place un workflow pour automatiser l'envoi de notifications aux techniciens de maintenance.", user: USERS.admin },
  { id: "aut-21", message: "Mets en place un workflow pour automatiser la création de fiches industrielles récurrentes.", user: USERS.admin },
  { id: "aut-22", message: "Peux-tu planifier un workflow qui automatise le suivi des demandes RH ?", user: USERS.superadmin },
  { id: "aut-23", message: "Mets en place un workflow en plusieurs étapes pour enchaîner, en une séquence, la validation des fiches POR PROMESH.", user: USERS.admin },
  { id: "aut-24", message: "Mets en place un workflow pour automatiser, en séquence, la mise à jour hebdomadaire du pipeline commercial.", user: USERS.admin },
  { id: "aut-25", message: "Mets en place un workflow pour automatiser la génération du rapport mensuel de KPI.", user: USERS.superadmin },
  { id: "aut-26", message: "Planifie une séquence d'étapes pour automatiser les relances clients chaque vendredi.", user: USERS.admin },
  { id: "aut-27", message: "Confirme.", user: USERS.superadmin },
  { id: "aut-28", message: "Annule.", user: USERS.superadmin },
  { id: "aut-29", message: "Confirmer cette action maintenant.", user: USERS.admin },
  { id: "aut-30", message: "Annuler la dernière proposition.", user: USERS.admin },
  { id: "aut-31", message: "Mets en place un workflow pour automatiser l'archivage des projets terminés.", user: USERS.admin },
].forEach((s) =>
  SCENARIOS.push(
    scenario({
      id: s.id,
      persona: "Direction / Administration",
      message: s.message,
      actingUser: s.user,
      expectedIntent: "automation",
      expectedModuleKey: null,
      expectedAgent: "automation_agent",
      expectedContext: "tools",
      expectedAgentAllowed: !s.expectedDenied,
      expectedTools: [],
      expectedResponseHint:
        "Doit décomposer la demande en étapes exécutables réelles et les PROPOSER, jamais les exécuter dans ce même tour — l'exécution réelle n'a lieu qu'après une confirmation explicite (« confirme »/« annule ») au tour suivant.",
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// DOCUMENTATION / AIDE GÉNÉRALE — intention `documentation_question`
// (Agent: crm_assistant_agent, RAG uniquement — voir CRM_ASSISTANT.md)
// ═══════════════════════════════════════════════════════════════════════
[
  "Peux-tu m'expliquer l'architecture générale du CRM ?",
  "Comment fonctionne le calcul du pourcentage de réussite d'un projet ? Explique-moi.",
  "Quelle procédure suivre pour signaler une panne, peux-tu m'expliquer ?",
  "J'ai besoin d'aide, peux-tu m'expliquer comment fonctionne le circuit RH ?",
  "Où puis-je trouver un guide sur les rôles utilisateurs ? Explique-moi.",
  "Comment fonctionne le système de notifications, peux-tu expliquer la procédure ?",
  "Pourquoi une demande passe-t-elle par plusieurs étapes ? Aide-moi à comprendre.",
  "Peux-tu m'expliquer comment fonctionne l'architecture technique derrière le tableau de bord ?",
  "Comment fonctionne la procédure de validation POR PROMESH, un guide ?",
  "Peux-tu expliquer pourquoi et comment fonctionne le classement des projets prioritaires ?",
  "Comment fonctionne le système de validation des devis, peux-tu expliquer ?",
  "Quelle est la procédure à suivre, peux-tu m'expliquer comment créer une intervention de maintenance ?",
  "Peux-tu m'expliquer comment fonctionne le classement des projets par retard ?",
  "J'ai besoin d'aide : comment fonctionne le module POR PROMESH ?",
  "Pourquoi certains projets nécessitent-ils une validation supplémentaire ? Explique-moi.",
  "Comment fonctionne la procédure d'assignation d'un propriétaire de projet ?",
  "Peux-tu m'expliquer l'architecture du système de notifications ?",
  "Quel guide suivre pour comprendre le calcul du Score Qualité ?",
  "Comment fonctionne le processus d'automatisation, peux-tu expliquer la procédure ?",
  "Pourquoi le tableau de bord affiche-t-il des KPI différents selon le rôle ? Peux-tu m'expliquer, aide-moi à comprendre.",
  "Peux-tu m'expliquer comment fonctionne la recherche avancée dans le CRM ?",
  "Quelle est la procédure pour signaler une anomalie de qualité des données ?",
  "Comment fonctionne l'architecture générale du Copilot IA ? Explique-moi simplement.",
  "J'ai besoin d'un guide : comment fonctionne le système de recommandations ?",
].forEach((message, i) =>
  SCENARIOS.push(
    scenario({
      id: `doc-${String(i + 1).padStart(2, "0")}`,
      persona: "Tous rôles",
      message,
      actingUser: USERS.user,
      expectedIntent: "documentation_question",
      expectedModuleKey: null,
      expectedAgent: "crm_assistant_agent",
      expectedContext: "rag",
      expectedAgentAllowed: true,
      expectedTools: [],
      expectedResponseHint: "Doit citer ses sources documentaires (citations), et dire clairement s'il ne trouve pas l'information plutôt que de l'inventer.",
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// AI-Business-Copilot/10_INTENT_ROUTING_FIX.md — RÉGRESSION OBLIGATOIRE
// (étape 13) + les formes courtes "Comment ... ?" listées à l'étape 12,
// jamais couvertes par les phrasés plus élaborés de la section
// DOCUMENTATION ci-dessus. Chaque message est envoyé SEUL (sans préfixe de
// contexte d'écran) — voir aiCopilotBridge.service.test.js pour la
// couverture ÉCRAN (dashboard/projet/commercial), qui exerce le VRAI
// bridge plutôt que ce Tier 1 (IntentDetector seul).
// ═══════════════════════════════════════════════════════════════════════
[
  {
    id: "reg-01",
    message: "donne-moi les instructions comment je peux créer un projet",
    note: "LE test de régression obligatoire de l'incident : route vers documentation_question/crm_assistant_agent, JAMAIS dashboard/kpi_agent.",
  },
  { id: "reg-02", message: "Comment créer un projet ?" },
  { id: "reg-03", message: "Comment modifier un projet ?" },
  { id: "reg-04", message: "Comment ajouter un client ?" },
  { id: "reg-05", message: "Comment créer une activité ?" },
  { id: "reg-06", message: "Comment créer un rendez-vous ?" },
  { id: "reg-07", message: "Comment ajouter un contact ?" },
  { id: "reg-08", message: "Comment envoyer un devis ?" },
  { id: "reg-09", message: "Comment fonctionne le pipeline ?" },
].forEach((s) =>
  SCENARIOS.push(
    scenario({
      id: s.id,
      persona: "Tous rôles",
      message: s.message,
      actingUser: USERS.user,
      expectedIntent: "documentation_question",
      expectedModuleKey: null,
      expectedAgent: "crm_assistant_agent",
      expectedContext: "rag",
      expectedAgentAllowed: true,
      expectedTools: [],
      expectedResponseHint: s.note || "Question procédurale (« comment... ? ») : doit TOUJOURS être traitée comme une demande d'aide (CRM Assistant), jamais comme une analyse KPI — même quand le message contient aussi un nom de domaine métier (« projet », « contact »...).",
    })
  )
);

// Le reste des exemples de l'étape 12 qui ne sont PAS des questions
// procédurales — chacun vers son intention/Agent réel, jamais fabriqué.
[
  { id: "reg-10", message: "Montre-moi mes projets.", intent: "projects", moduleKey: "projects", agent: "project_agent", context: "tools", tools: ["list_projects"] },
  { id: "reg-11", message: "Résume ce projet.", intent: "projects", moduleKey: "projects", agent: "project_agent", context: "tools", tools: ["list_projects"] },
  {
    id: "reg-12",
    message: "Pourquoi mes projets sont en retard ?",
    intent: "projects",
    moduleKey: "projects",
    agent: "project_agent",
    context: "tools",
    tools: ["list_projects"],
    attention: true,
  },
  {
    id: "reg-13",
    message: "Quels clients dois-je relancer ?",
    intent: "commercial_contacts",
    moduleKey: "commercialContacts",
    agent: "commercial_agent",
    context: "tools",
    tools: ["get_commercial_contact_analytics", "get_commercial_contact_kpi", "get_commercial_personal_kpi_summary"],
    user: USERS.commercial, // commercial_agent exige ce rôle (requiredRoles restreint, pas ouvert comme les autres agents de ce lot)
    note: "Mission 'CORRIGER LE COPILOT POUR LE RÔLE COMMERCIAL' — corrigée : 'relancer' (verbe) est désormais un mot-clé réel de commercial_contacts (voir intentCatalog.js), vérifié sans collision contre tout le corpus. N'utilisait auparavant que le RAG documentaire pour une question de données CRM réelles.",
  },
  { id: "reg-14", message: "Donne-moi les statistiques du mois.", intent: "dashboard", moduleKey: "dashboard", agent: "kpi_agent", context: "tools", tools: ["get_dashboard_kpis"] },
].forEach((s) =>
  SCENARIOS.push(
    scenario({
      id: s.id,
      persona: "Tous rôles",
      message: s.message,
      // Par défaut USERS.user (rôle "user", ouvert à tous les Agents de ce
      // lot — tous à requiredRoles:[]) — s.user permet un override explicite
      // quand l'Agent attendu ne l'est pas (ex. reg-13 -> commercial_agent,
      // requiredRoles restreint) : expectedAgentAllowed reste alors correct
      // sans casser les autres scénarios de ce même lot.
      actingUser: s.user || USERS.user,
      expectedIntent: s.intent,
      expectedModuleKey: s.moduleKey,
      expectedAgent: s.agent,
      expectedContext: s.context,
      expectedAgentAllowed: true,
      expectedTools: s.tools,
      expectedResponseHint: s.note || (s.attention
        ? "Doit classer les projets par priorité avec des raisons citées (ProjectAttentionAnalyzer), jamais une supposition."
        : "Réponse cohérente avec l'intention réelle du message, jamais une intention inventée pour satisfaire un exemple."),
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// AI-Business-Copilot/11_MEETING_AGENT_FIX.md — les deux régressions
// obligatoires de CET incident (bug 1 : project_agent au lieu de
// crm_assistant_agent ; bug 2 : dashboard/kpi_agent au lieu de
// meeting_agent) + le reste des exemples de l'étape 15 non déjà couverts
// plus haut. Chaque message est envoyé SEUL (sans contexte d'écran) —
// voir aiCopilotBridge.service.test.js pour la couverture ÉCRAN dédiée à
// "Programmer une réunion".
// ═══════════════════════════════════════════════════════════════════════
[
  {
    id: "reg-15",
    message: "d'accord pour créer un projet comment",
    intent: "documentation_question",
    moduleKey: null,
    agent: "crm_assistant_agent",
    context: "rag",
    tools: [],
    note: "RÉGRESSION OBLIGATOIRE (bug 1) : ne doit JAMAIS sélectionner project_agent (qui échouerait, aucun de ses Tools ne répond à une question procédurale) — une question procédurale l'emporte toujours, même formulée de façon informelle.",
  },
  {
    id: "reg-16",
    message: "Programmer une réunion",
    intent: "meetings",
    moduleKey: "googleCalendar",
    agent: "meeting_agent",
    context: "tools",
    tools: ["get_calendar_status"],
    note: "RÉGRESSION OBLIGATOIRE (bug 2) : ne doit JAMAIS sélectionner dashboard/kpi_agent (qui répondait à tort par une analyse KPI) — une demande d'action sur une réunion n'a AUCUN rapport avec les indicateurs.",
  },
  { id: "reg-17", message: "Comment programmer une réunion ?", intent: "documentation_question", moduleKey: null, agent: "crm_assistant_agent", context: "rag", tools: [] },
  { id: "reg-18", message: "Créer une réunion", intent: "meetings", moduleKey: "googleCalendar", agent: "meeting_agent", context: "tools", tools: ["get_calendar_status"] },
  { id: "reg-19", message: "Planifier un rendez-vous", intent: "meetings", moduleKey: "googleCalendar", agent: "meeting_agent", context: "tools", tools: ["get_calendar_status"] },
  { id: "reg-19b", message: "Réserver un rendez-vous", intent: "meetings", moduleKey: "googleCalendar", agent: "meeting_agent", context: "tools", tools: ["get_calendar_status"] },
  { id: "reg-20", message: "Je veux créer un projet", intent: "projects", moduleKey: "projects", agent: "project_agent", context: "tools", tools: ["list_projects"] },
  { id: "reg-21", message: "Crée un projet", intent: "projects", moduleKey: "projects", agent: "project_agent", context: "tools", tools: ["list_projects"] },
  { id: "reg-22", message: "Modifier ce projet", intent: "projects", moduleKey: "projects", agent: "project_agent", context: "tools", tools: ["list_projects"] },
  { id: "reg-23", message: "Quels sont mes projets ?", intent: "projects", moduleKey: "projects", agent: "project_agent", context: "tools", tools: ["list_projects"] },
  { id: "reg-24", message: "Comment ajouter un client ?", intent: "documentation_question", moduleKey: null, agent: "crm_assistant_agent", context: "rag", tools: [] },
  {
    id: "reg-25",
    message: "Ajouter un client",
    intent: "general_chat",
    moduleKey: null,
    agent: "assistant_agent",
    context: "rag",
    tools: [],
    note: "Lacune lexicale réelle et honnête (même famille que reg-13/smart-04) : le catalogue ne connaît que 'contact'/'contacts', jamais 'client' — repli general_chat, jamais un intent inventé pour faire joli. Hors périmètre de cet incident (ne concerne ni bug 1 ni bug 2).",
  },
].forEach((s) =>
  SCENARIOS.push(
    scenario({
      id: s.id,
      persona: "Tous rôles",
      message: s.message,
      actingUser: USERS.user,
      expectedIntent: s.intent,
      expectedModuleKey: s.moduleKey,
      expectedAgent: s.agent,
      expectedContext: s.context,
      expectedAgentAllowed: true,
      expectedTools: s.tools,
      expectedResponseHint: s.note || "Réponse cohérente avec l'intention réelle du message, jamais une intention inventée pour satisfaire un exemple.",
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// AI-Business-Copilot/14_PROJECT_ANALYSIS_ROUTING.md — RÉGRESSION
// OBLIGATOIRE : "pourquoi projet depot SBF est critique" routait à tort
// vers documentation_question/crm_assistant_agent (bug rapporté). Corrigé
// par un override étroit (projectAnalysisOverride.js), jamais un mot-clé
// de catalogue global — voir ce fichier pour la preuve que ça aurait cassé
// rec-12/rec-20/mnt-14 (re-testés explicitement ci-dessous aussi).
// ═══════════════════════════════════════════════════════════════════════
[
  {
    id: "reg-26",
    message: "pourquoi projet depot SBF est critique",
    intent: "projects",
    moduleKey: "projects",
    agent: "project_agent",
    context: "tools",
    tools: ["list_projects"],
    note: "RÉGRESSION OBLIGATOIRE : ne doit JAMAIS sélectionner crm_assistant_agent — 'pourquoi' + 'projet' + un mot d'état réel (ici 'critique') l'emporte sur la priorité procédurale, jamais l'inverse.",
  },
  { id: "reg-27", message: "Pourquoi le projet Depot SBF est critique ?", intent: "projects", moduleKey: "projects", agent: "project_agent", context: "tools", tools: ["list_projects"] },
  { id: "reg-28", message: "Pourquoi ce projet est bloqué ?", intent: "projects", moduleKey: "projects", agent: "project_agent", context: "tools", tools: ["list_projects"] },
  { id: "reg-29", message: "Pourquoi ce projet est à risque ?", intent: "projects", moduleKey: "projects", agent: "project_agent", context: "tools", tools: ["list_projects"] },
  {
    id: "reg-30",
    message: "Quel est mon taux de réussite ?",
    intent: "dashboard",
    moduleKey: "dashboard",
    agent: "kpi_agent",
    context: "tools",
    tools: ["get_dashboard_kpis"],
    note: "Lacune corrigée (étape 9) : 'taux'/'réussite' ajoutés aux mots-clés de `dashboard`, vérifié sans régression contre le corpus entier (com-04/com-14/com-24, qui mentionnent aussi 'taux', restent commercial_contacts).",
  },
  {
    id: "reg-31",
    message: "Pourquoi certains projets nécessitent-ils une validation supplémentaire ? Explique-moi.",
    intent: "documentation_question",
    moduleKey: null,
    agent: "crm_assistant_agent",
    context: "rag",
    tools: [],
    note: "Non-régression : une question de RÈGLE générale (aucun mot d'état de projet réel) reste documentation_question — l'override ne s'applique qu'à 'pourquoi'+'projet'+un état réel (critique/bloqué/risque), jamais à toute mention de 'projet'.",
  },
].forEach((s) =>
  SCENARIOS.push(
    scenario({
      id: s.id,
      persona: "Tous rôles",
      message: s.message,
      actingUser: USERS.user,
      expectedIntent: s.intent,
      expectedModuleKey: s.moduleKey,
      expectedAgent: s.agent,
      expectedContext: s.context,
      expectedAgentAllowed: true,
      expectedTools: s.tools,
      expectedResponseHint: s.note || "Doit classer les projets par priorité avec des raisons citées (ProjectAttentionAnalyzer), jamais une supposition.",
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// AI-Business-Copilot/16_REMINDER_ROUTING.md — RÉGRESSION OBLIGATOIRE :
// "Créer un rappel" retombait sur general_chat (0 mot-clé), puis se
// faisait absorber par le contexte d'écran Dashboard → dashboard/kpi_agent,
// qui répond TOUJOURS par la même analyse KPI déterministe quel que soit
// le message (kpiAgent.js::_run ne lit jamais vraiment `message`). Corrigé
// par une nouvelle intention réelle `reminders`, réutilisant le MÊME
// `meeting_agent`/les 4 mêmes Tools googleCalendar que `meetings` — jamais
// un second Agent (voir meetingAgent.js).
// ═══════════════════════════════════════════════════════════════════════
[
  {
    id: "reg-32",
    message: "Créer un rappel",
    intent: "reminders",
    moduleKey: "googleCalendar",
    agent: "meeting_agent",
    context: "tools",
    tools: ["get_calendar_status"],
    note: "RÉGRESSION OBLIGATOIRE : ne doit JAMAIS sélectionner dashboard/kpi_agent (qui répondait à tort par une analyse KPI générique, '17 projets personnels...') — une demande de rappel n'a AUCUN rapport avec les indicateurs.",
  },
  { id: "reg-33", message: "Ajoute-moi un rappel", intent: "reminders", moduleKey: "googleCalendar", agent: "meeting_agent", context: "tools", tools: ["get_calendar_status"] },
  { id: "reg-34", message: "Rappelle-moi demain", intent: "reminders", moduleKey: "googleCalendar", agent: "meeting_agent", context: "tools", tools: ["get_calendar_status"] },
  { id: "reg-35", message: "Je veux créer un rappel pour demain", intent: "reminders", moduleKey: "googleCalendar", agent: "meeting_agent", context: "tools", tools: ["get_calendar_status"] },
  { id: "reg-36", message: "Comment créer un rappel ?", intent: "documentation_question", moduleKey: null, agent: "crm_assistant_agent", context: "rag", tools: [] },
  { id: "reg-37", message: "Quels sont mes rappels ?", intent: "reminders", moduleKey: "googleCalendar", agent: "meeting_agent", context: "tools", tools: ["get_calendar_status"] },
  { id: "reg-38", message: "Montre-moi mes rappels", intent: "reminders", moduleKey: "googleCalendar", agent: "meeting_agent", context: "tools", tools: ["get_calendar_status"] },
  { id: "reg-39", message: "Supprime mon rappel", intent: "reminders", moduleKey: "googleCalendar", agent: "meeting_agent", context: "tools", tools: ["delete_calendar_event"] },
  {
    id: "reg-40",
    message: "Quels contacts commerciaux nécessitent un rappel dans les prochains jours ?",
    intent: "commercial_contacts",
    moduleKey: "commercialContacts",
    agent: "commercial_agent",
    context: "tools",
    tools: ["get_commercial_contact_kpi"],
    note: "Non-régression : la nouvelle intention 'reminders' ne doit JAMAIS détourner une question commerciale déjà validée (com-40) — 'contacts' l'emporte sur l'égalité avec 'rappel' par ordre du catalogue.",
  },
].forEach((s) =>
  SCENARIOS.push(
    scenario({
      id: s.id,
      persona: "Tous rôles",
      message: s.message,
      actingUser: s.id === "reg-40" ? USERS.commercial : USERS.user,
      expectedIntent: s.intent,
      expectedModuleKey: s.moduleKey,
      expectedAgent: s.agent,
      expectedContext: s.context,
      expectedAgentAllowed: true,
      expectedTools: s.tools,
      expectedResponseHint: s.note || "Réponse cohérente avec l'intention réelle du message, jamais une intention inventée pour satisfaire un exemple.",
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// CONVERSATION GÉNÉRALE — intention `general_chat` (Agent: assistant_agent)
// ═══════════════════════════════════════════════════════════════════════
[
  "Bonjour, j'espère que tu vas bien aujourd'hui !",
  "Merci beaucoup, à bientôt !",
  "Salut, j'ai une question générale.",
  "Bonsoir, es-tu disponible pour discuter ?",
  "Peux-tu te présenter rapidement ?",
  "Quelle est la météo aujourd'hui ?",
  "Raconte-moi une blague pour détendre l'atmosphère.",
  "Merci, à bientôt !",
  "Bonjour, que peux-tu faire pour moi globalement ?",
  "Bonjour, j'espère que tout va bien de ton côté.",
  "Bonjour, tu vas bien ce matin ?",
  "Merci beaucoup, excellente journée à toi !",
  "Salut, es-tu opérationnel maintenant ?",
  "Bonsoir, j'aimerais juste discuter un instant.",
  "Peux-tu me dire ton nom ?",
  "Quel temps fait-il dehors aujourd'hui ?",
  "As-tu une citation motivante à me partager ?",
  "Merci infiniment, à la prochaine !",
  "Bonjour, peux-tu me dire ce que tu sais faire en général ?",
  "Coucou, j'espère que ta journée se passe bien.",
  "Bonjour, es-tu toujours disponible à cette heure ?",
  "Merci beaucoup pour ta réponse rapide.",
  "Salut, juste pour te dire bonjour.",
  "Peux-tu me raconter quelque chose d'amusant ?",
].forEach((message, i) =>
  SCENARIOS.push(
    scenario({
      id: `gen-${String(i + 1).padStart(2, "0")}`,
      persona: "Tous rôles",
      message,
      actingUser: USERS.user,
      expectedIntent: "general_chat",
      expectedModuleKey: null,
      expectedAgent: "assistant_agent",
      expectedContext: "rag",
      expectedAgentAllowed: true,
      expectedTools: [],
      expectedResponseHint: "Doit rester professionnel et courtois, réorienter vers le bon module si la question sort du cadre du CRM.",
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// SMART SUGGESTIONS — les 17 questions de démarrage réelles
// (Dash Master Toolkit/lib/ai/services/copilot_suggestion_engine.dart),
// chacune associée à l'écran qui la propose. En production,
// CopilotController.sendSuggestion() passe TOUJOURS par send() ->
// _runAssistantTurn(), qui joint le pageContext actif au tour — une
// suggestion n'est donc jamais classée seule, sauf les 4 par défaut
// (aucun écran compatible ouvert). Le message ci-dessous est donc déjà la
// combinaison réelle prefix+"\n\n"+suggestion (voir CONTEXTE ci-dessous),
// jamais la suggestion seule, pour tester ce que le routeur voit VRAIMENT.
//
// Découverte en construisant ce corpus (voir pageContextFormatter.js) :
// le préfixe de contexte contenait autrefois "l'utilisateur consulte
// actuellement", un mot-clé EXACT de l'intention `users` — assez pour
// détourner le classement lexical sur écran projet/client dans la majorité
// des cas. Corrigé (formule de préfixe + libellés d'écran reformulés) —
// voir Context Awareness ci-dessous pour la régression correspondante.
// ═══════════════════════════════════════════════════════════════════════
function contextScenario({ id, screen, label, data, suggestion, expected, actingUser = USERS.user }) {
  const prefix = screen ? formatPageContext({ screen, label, data }) : null;
  const message = prefix ? `${prefix}\n\n${suggestion}` : suggestion;
  return scenario({
    id,
    persona: "Tous rôles",
    message,
    actingUser,
    ...expected,
  });
}

const INTENT_EXPECTATIONS = {
  projects: { expectedIntent: "projects", expectedModuleKey: "projects", expectedAgent: "project_agent", expectedContext: "tools", expectedAgentAllowed: true, expectedTools: ["list_projects"] },
  dashboard: { expectedIntent: "dashboard", expectedModuleKey: "dashboard", expectedAgent: "kpi_agent", expectedContext: "tools", expectedAgentAllowed: true, expectedTools: ["get_dashboard_kpis"] },
  reporting: { expectedIntent: "reporting", expectedModuleKey: "dashboard", expectedAgent: "reporting_agent", expectedContext: "tools", expectedAgentAllowed: true, expectedTools: DASHBOARD_TOOLS },
  recommendation: { expectedIntent: "recommendation", expectedModuleKey: null, expectedAgent: "recommendation_agent", expectedContext: "tools", expectedAgentAllowed: true, expectedTools: RECOMMENDATION_TOOLS },
  commercial_contacts: { expectedIntent: "commercial_contacts", expectedModuleKey: "commercialContacts", expectedAgent: "commercial_agent", expectedContext: "tools", expectedAgentAllowed: true, expectedTools: [COMMERCIAL_TOOLS[0]] },
  pipeline: { expectedIntent: "pipeline", expectedModuleKey: "pipeline", expectedAgent: "pipeline_agent", expectedContext: "tools", expectedAgentAllowed: true, expectedTools: ["list_pipeline_stages"] },
  industrial: { expectedIntent: "industrial", expectedModuleKey: "industrial", expectedAgent: "industrial_agent", expectedContext: "tools", expectedAgentAllowed: true, expectedTools: ["list_industrial_records"] },
  data_quality: { expectedIntent: "data_quality", expectedModuleKey: null, expectedAgent: "data_quality_agent", expectedContext: "tools", expectedAgentAllowed: true, expectedTools: DATA_QUALITY_TOOLS },
  general_chat: { expectedIntent: "general_chat", expectedModuleKey: null, expectedAgent: "assistant_agent", expectedContext: "rag", expectedAgentAllowed: true, expectedTools: [] },
};

[
  // Défaut (aucun écran compatible actif) — kDefaultCopilotSuggestions.
  { id: "smart-01", screen: null, suggestion: "Quels projets sont en retard ?", expected: "projects" },
  { id: "smart-02", screen: null, suggestion: "Conseille-moi sur mes priorités du jour", expected: "recommendation" },
  { id: "smart-03", screen: null, suggestion: "Fais-moi un rapport de synthèse sur les indicateurs clés", expected: "reporting" },
  {
    id: "smart-04",
    screen: null,
    suggestion: "Quels clients dois-je relancer cette semaine ?",
    expected: "commercial_contacts",
    actingUser: USERS.commercial,
    note: "Mission 'CORRIGER LE COPILOT POUR LE RÔLE COMMERCIAL' — corrigée : 'relancer' (verbe) est désormais un mot-clé réel de commercial_contacts (voir intentCatalog.js).",
  },
  // Dashboard — _dashboardSuggestions.
  { id: "smart-05", screen: "dashboard", suggestion: "Quels sont mes KPI ?", expected: "dashboard" },
  { id: "smart-06", screen: "dashboard", suggestion: "Quels projets sont critiques ?", expected: "dashboard" },
  {
    id: "smart-07",
    screen: "dashboard",
    suggestion: "Montre les ventes.",
    expected: "dashboard",
    note: "'ventes' seul ne recoupe aucun mot-clé — c'est le préfixe de contexte ('tableau'/'bord') qui porte tout le score ici, jamais le message.",
  },
  // Fiche projet — _projectSuggestions.
  { id: "smart-08", screen: "project", label: "Villa Sfax", suggestion: "Résume le projet.", expected: "projects" },
  {
    id: "smart-09",
    screen: "project",
    label: "Villa Sfax",
    suggestion: "Analyse les risques.",
    expected: "projects",
    note: "Sans contexte, 'Analyse les risques.' route vers business_analysis (voir corpus principal) — le contexte d'écran fait pencher l'égalité vers l'intention du module déjà ouvert, un comportement voulu de Context Awareness.",
  },
  {
    id: "smart-10",
    screen: "project",
    label: "Villa Sfax",
    suggestion: "Créer une activité.",
    expected: "projects",
    note: "Lacune réelle : aucune intention dédiée 'activités' n'existe dans le catalogue — le message retombe sur le module déjà ouvert (projects) grâce au contexte, jamais sur une action inventée.",
  },
  { id: "smart-11", screen: "project", label: "Villa Sfax", suggestion: "Créer un rapport.", expected: "projects", note: "Égalité de score avec reporting, tranchée par l'ordre du catalogue (projects avant reporting) — reste correct : un rapport demandé depuis une fiche projet a du sens pour project_agent." },
  // Fiche client — _clientSuggestions.
  {
    id: "smart-12",
    screen: "client",
    label: "STE Delta",
    suggestion: "Montre les devis.",
    expected: "general_chat",
    note: "Lacune lexicale réelle et honnête : 'devis' n'est un mot-clé d'aucune intention du catalogue aujourd'hui — repli general_chat, documenté ici plutôt que masqué.",
  },
  { id: "smart-13", screen: "client", label: "STE Delta", suggestion: "Relance les clients.", expected: "commercial_contacts", actingUser: USERS.commercial },
  { id: "smart-14", screen: "client", label: "STE Delta", suggestion: "Créer une opportunité.", expected: "pipeline" },
  // Fiche industrielle — _industrialSuggestions.
  { id: "smart-15", screen: "industrial", label: "Fiche Probar #12", suggestion: "Résume la fiche.", expected: "industrial", actingUser: USERS.admin },
  {
    id: "smart-16",
    screen: "industrial",
    label: "Fiche Probar #12",
    suggestion: "Vérifie la conformité.",
    expected: "industrial",
    actingUser: USERS.admin,
    note: "'conformité' seul ne recoupe aucun mot-clé — c'est le préfixe de contexte ('fiche industrielle') qui porte le score ici, jamais le message : la suggestion seule (sans contexte actif) retomberait sur general_chat.",
  },
  {
    id: "smart-17",
    screen: "industrial",
    label: "Fiche Probar #12",
    suggestion: "Analyse les diamètres.",
    expected: "industrial",
    actingUser: USERS.admin,
    note: "Sans contexte, 'Analyse les diamètres.' route vers business_analysis (voir corpus principal) — le contexte d'écran industriel l'emporte nettement (2 mots-clés contre 1), pas seulement par égalité.",
  },
].forEach((s) =>
  SCENARIOS.push(
    contextScenario({
      id: s.id,
      screen: s.screen,
      label: s.label,
      suggestion: s.suggestion,
      expected: { ...INTENT_EXPECTATIONS[s.expected], expectedResponseHint: s.note || "Doit répondre dans le module réellement sélectionné, jamais inventer une réponse hors de ce module." },
      actingUser: s.actingUser,
    })
  )
);

// ═══════════════════════════════════════════════════════════════════════
// CONTEXT AWARENESS — le VRAI pageContext (formatPageContext réel, voir
// pageContextFormatter.js) préfixé à un message déjà validé ailleurs dans
// ce corpus, pour vérifier qu'un contexte d'écran actif ne CORROMPT jamais
// le routage — et documenter honnêtement les quelques cas où le contexte
// déplace le score (parfois pour le mieux, une fois — voir smart-09/17 plus
// haut et ctx-03/ctx-05 ci-dessous pour le cas inverse, absorbé par
// `dashboard`).
// ═══════════════════════════════════════════════════════════════════════
[
  { id: "ctx-01", screen: "dashboard", suggestion: "Quels projets sont en retard ?", expected: "projects" },
  { id: "ctx-02", screen: "dashboard", suggestion: "Quels sont mes indicateurs KPI aujourd'hui ?", expected: "dashboard" },
  {
    id: "ctx-03",
    screen: "dashboard",
    suggestion: "Quels risques dois-je surveiller ?",
    expected: "dashboard",
    note: "Le préfixe de contexte ('tableau'/'bord', 2 mots-clés) l'emporte sur le seul mot 'risques' (aucun mot-clé nulle part) — absorbé par dashboard plutôt que de retomber sur general_chat, un effet secondaire positif de Context Awareness.",
  },
  {
    id: "ctx-04",
    screen: "dashboard",
    suggestion: "Prépare-moi un rapport de synthèse.",
    expected: "dashboard",
    note: "Sans contexte, ce message route vers reporting (voir smart-03, message identique en substance) — avec le contexte tableau de bord actif, égalité 2-2 tranchée par l'ordre du catalogue (dashboard avant reporting). Cas limite documenté honnêtement, pas corrigé : reste dans le bon module (dashboard), jamais une intention hors sujet.",
  },
  {
    id: "ctx-05",
    screen: "dashboard",
    suggestion: "Quelles anomalies détectes-tu dans les données ?",
    expected: "dashboard",
    note: "Sans contexte, 'anomalies' route vers recommendation (1 mot-clé) — le préfixe dashboard (2 mots-clés) l'emporte. Reste un module KPI/qualité pertinent, jamais hors sujet.",
  },
  {
    id: "ctx-06",
    screen: "project",
    label: "Villa Sfax",
    data: { statut: "en_cours" },
    suggestion: "Quel est le statut de ce projet ?",
    expected: "projects",
    note: "RÉGRESSION documentée : avant la correction de pageContextFormatter.js, ce scénario exact routait vers `users` (mot-clé 'utilisateur' présent dans l'ancien préfixe fixe) — voir l'en-tête de section Smart Suggestions plus haut.",
  },
  { id: "ctx-07", screen: "project", label: "Villa Sfax", suggestion: "Résume ce projet pour moi.", expected: "projects" },
  {
    id: "ctx-08",
    screen: "project",
    label: "Villa Sfax",
    suggestion: "Analyse les risques de ce projet.",
    expected: "projects",
    note: "Sans contexte, ce message est ambigu (business_analysis, 'analyse' contre projects, 'projet' — égalité) ; le contexte d'écran tranche en faveur du module déjà ouvert.",
  },
  { id: "ctx-09", screen: "project", label: "Villa Sfax", suggestion: "Prépare une réunion pour ce projet, quelle étape est en retard ?", expected: "projects" },
  {
    id: "ctx-10",
    screen: "project",
    label: "Villa Sfax",
    suggestion: "Ce projet a-t-il des doublons ou des incohérences de qualité ?",
    expected: "data_quality",
    note: "Un signal net (3 mots-clés data_quality) l'emporte sur le contexte projet (1 mot-clé) — Context Awareness ne masque jamais une intention clairement plus spécifique.",
  },
  { id: "ctx-11", screen: "client", label: "STE Delta", suggestion: "Relance ce client.", expected: "commercial_contacts", actingUser: USERS.commercial },
  { id: "ctx-12", screen: "client", label: "STE Delta", suggestion: "Prépare un email de relance pour ce contact commercial.", expected: "commercial_contacts", actingUser: USERS.commercial },
  {
    id: "ctx-13",
    screen: "client",
    label: "STE Delta",
    suggestion: "Quelles sont les opportunités liées à ce client ?",
    expected: "general_chat",
    note: "Lacune lexicale réelle et honnête : le catalogue ne connaît que les formes singulières 'opportunite'/'opportunité' (voir intentCatalog.js, intention pipeline) — le pluriel 'opportunités' n'est reconnu nulle part, contexte actif ou non.",
  },
  { id: "ctx-14", screen: "industrial", label: "Fiche Probar #12", suggestion: "Cette fiche est-elle conforme ?", expected: "industrial", actingUser: USERS.admin },
  {
    id: "ctx-15",
    screen: "industrial",
    label: "Fiche Probar #12",
    suggestion: "Analyse les diamètres de cette fiche.",
    expected: "industrial",
    actingUser: USERS.admin,
    note: "Sans contexte, ce message route vers business_analysis — le contexte industriel l'emporte nettement (2 mots-clés contre 1).",
  },
].forEach((s) =>
  SCENARIOS.push(
    contextScenario({
      id: s.id,
      screen: s.screen,
      label: s.label,
      data: s.data,
      suggestion: s.suggestion,
      expected: { ...INTENT_EXPECTATIONS[s.expected], expectedResponseHint: s.note || "Un contexte d'écran actif ne doit jamais faire dévier le routage d'un message déjà sans ambiguïté." },
      actingUser: s.actingUser,
    })
  )
);

module.exports = { SCENARIOS, USERS };
