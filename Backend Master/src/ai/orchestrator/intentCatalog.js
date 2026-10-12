"use strict";

// Data, not code (SOLID-OCP): the default mapping from "what the user
// probably wants" to "which MCP tool module (if any) and whether RAG
// grounding applies". One entry per Tool module already built in mcp/tools/
// (see Backend Master/src/ai/README.md, "69 Tools sur 10 modules") plus two
// module-less intents (documentation questions, and an unrecognized-intent
// fallback). Callers may swap this catalog entirely (IntentDetector accepts
// any catalog shaped like this) — this default is CRM-specific, the
// mechanism (IntentDetector + IRouter) is not.
//
// `moduleKey` must match a key of `byModule` in ../mcp/tools/index.js
// exactly — that's the join key ToolRouter uses to restrict candidate tools
// to the right module (see orchestrator/pipeline.js::buildToolModuleIndex).
//
// `requiredRoles`/`allowedEmails` (optional, omitted = open to any
// authenticated actor) are the coarse, EARLY permission check requested by
// the workflow spec ("vérifier les permissions" before building context or
// selecting Tools — see AIManager.handleMessage) — same
// utils/authorization.js::isAuthorized predicate already used by
// PermissionManager (Tools) and BaseAgent (Agents), so this is a third,
// consistent use of the ONE existing authorization mechanism, never a
// parallel one. Deliberately left unset on every entry below: this kernel's
// own rule (see mcp/permissionManager.js) is that the real authorization
// boundary lives at the Tool/Agent level, not a coarser intent-level guess —
// this field exists so a caller CAN restrict an intent (e.g. a future
// "administration" intent) without inventing a new mechanism, not so this
// catalog invents restrictions it has no CRM route to verify against.
const DEFAULT_INTENT_CATALOG = [
  {
    // DÉLIBÉRÉMENT LA PREMIÈRE ENTRÉE DU CATALOGUE — voir
    // AI-Business-Copilot/10_INTENT_ROUTING_FIX.md, étape 3 : "une question
    // procédurale doit toujours être traitée comme une demande d'aide".
    // `LexicalIntentRouter` (langchain/router/lexicalIntentRouter.js)
    // départage une égalité de score par ordre d'enregistrement dans ce
    // tableau — un message comme "Comment créer un projet ?" obtient
    // TOUJOURS 1 point ici ("comment") ET 1 point pour `projects`
    // ("projet") : une vraie égalité. Garder cette entrée en tête est ce
    // qui fait gagner l'aide procédurale sur l'intention métier — jamais un
    // hasard d'ordre de tableau à corriger, une règle explicite que
    // `test/ai.intentRouting.priority.test.js` verrouille : si un futur
    // changement déplace cette entrée plus bas dans le tableau, ce test
    // casse immédiatement au lieu de régresser silencieusement. Voir aussi
    // `orchestrator/intentConfidence.js` (palier de confiance 0.95 "PRIORITÉ
    // PROCÉDURALE DÉLIBÉRÉE", qui documente et s'appuie sur ce même fait).
    key: "documentation_question",
    moduleKey: null,
    requiresRag: true,
    requiresTools: false,
    keywords: ["comment", "pourquoi", "documentation", "guide", "expliquer", "fonctionne", "architecture", "aide", "procedure", "procédure"],
    description: "Question sur le fonctionnement du CRM, une procédure, ou la documentation.",
  },
  {
    key: "users",
    moduleKey: "users",
    requiresRag: false,
    requiresTools: true,
    keywords: ["utilisateur", "utilisateurs", "compte", "comptes", "role", "rôle", "profil", "desactiver", "désactiver", "activer"],
    description: "Gestion des comptes utilisateurs : liste, rôle, activation/désactivation, profil.",
  },
  {
    key: "projects",
    moduleKey: "projects",
    // Une question projet ("quels projets sont en retard ?") ne trouve pas
    // toujours sa réponse dans le seul module `projects` (list/move-stage/
    // assign-owner) — les indicateurs agrégés (retard, avancement) vivent
    // dans le module `dashboard`. `relatedModules` élargit le pool de Tools
    // candidats du ToolRouter SANS changer `moduleKey` (qui reste la classe
    // "propriétaire" de cette intention) — voir orchestrator/toolRouter.js
    // et TOOL_ROUTER.md pour l'exemple complet (Tool Router).
    relatedModules: ["dashboard"],
    requiresRag: false,
    requiresTools: true,
    keywords: ["projet", "projets", "etape", "étape", "proprietaire", "propriétaire", "owner", "retard", "retards"],
    description: "Gestion des projets : liste, changement d'étape, propriétaire, et indicateurs associés (retard, avancement).",
  },
  {
    key: "pipeline",
    moduleKey: "pipeline",
    requiresRag: false,
    requiresTools: true,
    keywords: ["pipeline", "opportunite", "opportunité", "stage", "etape", "étape"],
    description: "Gestion des étapes du pipeline commercial.",
  },
  {
    // AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission
    // "CORRIGER LE COPILOT POUR LE RÔLE COMMERCIAL" : "relance" (déjà présent)
    // ne couvre littéralement QUE le nom singulier — "Quels clients dois-je
    // relancer ?"/"...relancer cette semaine ?" (verbe) et "Montre-moi mes
    // relances prioritaires"/"...automatiser les relances clients..."
    // (pluriel) ne matchaient aucun mot-clé (tokenize() ne fait aucune
    // racinisation) et retombaient sur `general_chat` (RAG documentaire),
    // confirmé en exécutant le vrai routeur. "relancer"/"relances"/
    // "rappeler" ajoutés — vérifiés SANS collision contre le corpus de
    // validation entier : "relancer" et "rappeler" n'apparaissent dans
    // AUCUN autre scénario existant ; "relances" apparaît une fois dans un
    // scénario `automation` ("...automatiser les relances clients..."), qui
    // reste net gagnant sur SES PROPRES mots-clés forts (automatiser +
    // séquence + étapes = 3 points, contre 1 seul point ici) — jamais une
    // coïncidence de score. "rappel"/"rappels"/"rappelle" (mots-clés de
    // `reminders`) volontairement NON touchés : "rappeler" (verbe) en est
    // lexicalement distinct, aucune racinisation n'existe dans ce routeur.
    key: "commercial_contacts",
    moduleKey: "commercialContacts",
    requiresRag: false,
    requiresTools: true,
    keywords: ["contact", "contacts", "commercial", "kpi", "relance", "relancer", "relances", "rappeler"],
    description: "Contacts commerciaux et leurs indicateurs (KPI), y compris les relances/rappels clients.",
    // AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission
    // "CORRIGER LES ACTIONS COMMERCIALES DEPUIS LA LISTE DES CONTACTS" :
    // même mécanisme exact que `meetings`/`reminders` (voir leurs
    // commentaires respectifs) — CommercialAgent porte désormais, lui aussi,
    // un vrai cycle PendingAction multi-tours (propose une relance/une
    // affectation -> attend "oui"/"confirme"/"non"/"annule"). Sans ce
    // marqueur, un simple "confirme" au tour suivant (mot-clé RÉEL de
    // l'intention `automation`, sans concurrent) se faisait reclasser vers
    // `automation_agent` — refusé pour un rôle "commercial" — au lieu de
    // rester sur `commercial_agent`, qui a la proposition réellement en
    // attente (voir conversationContinuityResolver.js, `looksLikeBareConfirmation`).
    conversational: true,
  },
  {
    key: "maintenance",
    moduleKey: "maintenance",
    requiresRag: false,
    requiresTools: true,
    keywords: ["maintenance", "panne", "technicien", "intervention", "reparation", "réparation"],
    description: "Demandes de maintenance : création, suivi, affectation d'un technicien.",
  },
  {
    key: "notifications",
    moduleKey: "notifications",
    requiresRag: false,
    requiresTools: true,
    keywords: ["notification", "notifications", "alerte", "lu", "lue"],
    description: "Notifications de l'utilisateur : liste, marquage lu, suppression.",
  },
  {
    key: "industrial",
    moduleKey: "industrial",
    requiresRag: false,
    requiresTools: true,
    // Mission "CORRIGER DÉFINITIVEMENT LES REQUÊTES FICHES PRO PROMESH / PRO
    // PROBAR" — "probar"/"melange"/"mélange" ajoutés : ce sont les 3 VRAIES
    // valeurs de l'ENUM IndustrialRecord.module (voir
    // src/models/IndustrialRecord.js), jamais inventées. Sans eux, "donne-moi
    // les fiches PROBAR" (aucun mot-clé industrial ne matchait "fiches" au
    // pluriel, ni "PROBAR") retombait sur `general_chat`. "fiches" (pluriel)
    // a été VOLONTAIREMENT écarté d'ici (essayé puis retiré) : il collisionne
    // avec `data_quality` (garde son propre mot-clé "qualité"/"doublon(s)"/
    // "incohérence(s)" sur des messages qui mentionnent aussi "fiches" —
    // "Quelle est la qualité globale de mes fiches ?" par ex., voir
    // test/fixtures/copilotValidationScenarios.js scénarios dq-05/dq-10/dq-11/
    // dq-13) — régression détectée et corrigée en retirant "fiches" plutôt
    // qu'en la gardant. "maintenance" est DÉLIBÉRÉMENT absent d'ici : mot-clé
    // RÉEL et distinct de l'intention `maintenance` (demandes CRM/
    // techniciens, plus haut dans ce fichier) — l'ajouter ici créerait une
    // collision avec CETTE intention. Voir industrialPromeshOverride.js pour
    // la garde qui empêche "fiche"(singulier)+"promesh" de retomber sur
    // `industrial` au lieu de `por_promesh` sur une VRAIE égalité de score.
    keywords: ["industriel", "industrielle", "production", "fiche", "enregistrement", "probar", "melange", "mélange"],
    description: "Fiches industrielles : création, consultation, mise à jour.",
  },
  {
    key: "por_promesh",
    moduleKey: "porPromesh",
    requiresRag: false,
    requiresTools: true,
    keywords: ["por", "promesh", "validation", "operateur", "opérateur"],
    description: "Dossiers POR PROMESH : création, validation, statistiques.",
  },
  {
    // "taux"/"reussite"/"réussite" ajoutés (AI-Business-Copilot/14_PROJECT_ANALYSIS_ROUTING.md,
    // étape 9 — "Quel est mon taux de réussite ?" retombait sur
    // `general_chat`, 0 mot-clé) : vérifié SANS régression contre le corpus
    // entier — "taux" apparaît aussi dans des messages `commercial_contacts`
    // (ex. "Quel est mon taux de validation sur mes contacts commerciaux ?"),
    // mais `commercial_contacts` est enregistrée AVANT `dashboard` dans ce
    // tableau et gagne déjà sur son propre mot-clé "contacts" — une égalité
    // ajoutée par "taux" ne change jamais ce gagnant.
    key: "dashboard",
    moduleKey: "dashboard",
    requiresRag: false,
    requiresTools: true,
    keywords: ["dashboard", "tableau", "bord", "kpi", "statistique", "statistiques", "stats", "taux", "reussite", "réussite"],
    description: "Tableaux de bord et indicateurs clés (KPI).",
  },
  {
    key: "hr",
    moduleKey: "hr",
    requiresRag: false,
    requiresTools: true,
    keywords: ["rh", "conge", "congé", "demande", "absence"],
    description: "Demandes RH : congés, absences, suivi.",
  },
  {
    key: "reporting",
    moduleKey: "dashboard",
    requiresRag: false,
    requiresTools: true,
    keywords: ["rapport", "rapports", "synthese", "synthèse", "bilan", "resume", "résumé", "reporting"],
    description: "Génération d'un rapport ou d'une synthèse à partir des indicateurs disponibles.",
  },
  {
    // AI-Business-Copilot/11_MEETING_AGENT_FIX.md — intention réelle
    // manquante, découverte en diagnostiquant "Programmer une réunion" qui
    // retombait sur `general_chat` (0 mot-clé) puis se faisait absorber à
    // tort par le contexte d'écran Dashboard (voir aiCopilotBridge.service.js,
    // la garde "intention > contexte" — conçue pour un message FAIBLE mais
    // pertinent au contexte, pas pour une demande hors-sujet comme celle-ci).
    // `moduleKey: "googleCalendar"` — le SEUL module Tool déjà réel pour ce
    // domaine (`mcp/tools/googleCalendar/`, 4 Tools déjà construits pour
    // AutomationAgent : `create_calendar_event`/`update_calendar_event`/
    // `delete_calendar_event`/`get_calendar_status`) — aucun Tool créé pour
    // cette passe, seulement un Agent dédié qui les utilise en premier
    // rôle plutôt qu'en second rôle d'automatisation (voir meetingAgent.js).
    // Enregistrée AVANT `automation` : "planifier" est un mot-clé partagé
    // ("Planifier une réunion" doit aller vers ce module dédié aux
    // réunions, pas vers l'automatisation générique multi-étapes) — un
    // gagnant par ORDRE explicite, même discipline que `documentation_question`
    // en tête de catalogue.
    key: "meetings",
    moduleKey: "googleCalendar",
    requiresRag: false,
    requiresTools: true,
    keywords: ["reunion", "réunion", "rendez", "rdv", "meeting"],
    description: "Réunions et rendez-vous : création, modification, annulation sur le calendrier Google de l'utilisateur.",
    // AI-Business-Copilot/26_MEETING_AGENT_CONTINUITY.md — reproduit en
    // direct : au tour 2 d'une collecte d'informations pour une réunion,
    // un message comme "...pour le projet cbi10 le 17/08/2026 à 12h"
    // contient le mot "projet" et se fait reclasser vers `projects` —
    // IntentDetector reclasse CHAQUE message indépendamment, sans savoir
    // qu'une collecte meeting_agent est en cours. `conversational: true`
    // marque les intentions qui portent un VRAI workflow multi-tours (une
    // suite de questions/réponses avant une action réelle) — consommé
    // uniquement par `ConversationContinuityResolver` (voir ce fichier),
    // jamais par IntentDetector/AgentRouter eux-mêmes (comportement
    // inchangé pour toute intention qui ne porte pas ce marqueur).
    conversational: true,
  },
  {
    // AI-Business-Copilot/16_REMINDER_ROUTING.md — même famille de bug que
    // `meetings` (11_MEETING_AGENT_FIX.md) : "Créer un rappel" n'avait
    // AUCUN mot-clé de catalogue (0 point), retombait sur `general_chat`,
    // puis se faisait absorber par le contexte d'écran Dashboard →
    // `dashboard`/`kpi_agent`, qui répond TOUJOURS par la même analyse KPI
    // déterministe quel que soit le message (voir kpiAgent.js::_run — ne
    // lit jamais vraiment `message`, sauf pour LEGACY_MARKERS). Recherché
    // AVANT toute implémentation (voir le rapport) : ce CRM n'a PAS de
    // rappel autonome/personnel — `ProjectReminder` exige un `projectId` ET
    // un `actionId` (jamais un enregistrement indépendant, par conception
    // — voir le commentaire de `createProjectActionTool.js`). Le seul
    // mécanisme RÉEL, déjà construit, déjà testé, capable d'un rappel SANS
    // projet (date + heure + sujet, rien d'autre requis) est le calendrier
    // Google — les 4 MÊMES Tools que `meetings`, le MÊME `meeting_agent`
    // (voir `agents/manifest.js` — `intentNames: ["meetings", "reminders"]`,
    // jamais un second Agent). Enregistrée APRÈS `commercial_contacts` :
    // "Quels contacts commerciaux nécessitent un rappel ?" (corpus, `com-40`)
    // doit rester `commercial_contacts` sur une égalité avec "contacts".
    key: "reminders",
    moduleKey: "googleCalendar",
    requiresRag: false,
    requiresTools: true,
    keywords: ["rappel", "rappels", "rappelle"],
    description: "Rappels personnels : création, modification, annulation — même mécanisme que les réunions (calendrier Google), sans projet requis.",
    // Même workflow multi-tours que "meetings" (même Agent, mêmes 4 Tools
    // googleCalendar — voir meetingAgent.js) — voir le commentaire sur
    // "meetings" ci-dessus pour la justification complète.
    conversational: true,
  },
  {
    // moduleKey: null on purpose — an automation may need a Tool from ANY
    // module (see ReportingAgent vs AutomationAgent in
    // Backend Master/src/ai/README.md). ToolRouter already treats a null
    // moduleKey as "search across every module" (no filtering, only the
    // lexical ranking pass) — see toolRouter.js — so this is a legitimate,
    // intentional exception to the "moduleKey implies a single module"
    // pattern every other requiresTools:true entry follows here.
    key: "automation",
    moduleKey: null,
    requiresRag: false,
    requiresTools: true,
    // "confirme"/"confirmer"/"annule"/"annuler" ajoutés pour le cycle
    // proposer → confirmer/annuler d'AutomationAgent (voir
    // AUTOMATION_WORKFLOWS.md) : ce sont EXACTEMENT les mots que le Copilot
    // demande lui-même à l'utilisateur de répondre
    // (automationAnswerBuilder.js::buildProposalAnswer), donc garantis de
    // router vers cet Agent au tour suivant — jamais "oui"/"non", trop
    // génériques pour un mot-clé global (auraient capturé une immense partie
    // de la conversation courante, sans rapport avec une automatisation).
    keywords: [
      "automatiser", "automatisation", "enchainer", "enchaîner", "sequence", "séquence", "workflow", "planifier", "etapes", "étapes",
      "confirme", "confirmer", "annule", "annuler",
    ],
    description: "Enchaînement automatisé de plusieurs actions à travers différents modules — chaque action est PROPOSÉE puis exécutée seulement après confirmation explicite (« confirme »/« annule »).",
  },
  {
    // Comme "automation" : traverse délibérément plusieurs modules (KPI,
    // projets, ventes, pipeline, interventions, ...), moduleKey: null.
    // Mots-clés volontairement EXCLUSIFS à cette intention ("analyse(r)",
    // "performance(s)", "recommandation(s)") — jamais "risque"/"cause", trop
    // génériques et déjà utilisés comme marqueurs LOCAUX ailleurs (ex.
    // ATTENTION_MARKERS de ProjectAgent) : les ajouter ici casserait le
    // routage déjà validé de messages existants (voir
    // BUSINESS_ANALYST.md, section "Sécurité des mots-clés"). Placée en
    // AVANT-DERNIÈRE position du catalogue (juste avant "general_chat") :
    // en cas d'égalité de score avec une intention plus ancienne
    // (ex. "performance" apparaît aussi dans une question purement
    // commerciale), c'est TOUJOURS l'intention la plus spécifique déjà
    // enregistrée qui gagne — cette intention ne l'emporte que sur un
    // signal net, jamais par coïncidence.
    key: "business_analysis",
    moduleKey: null,
    requiresRag: false,
    requiresTools: true,
    keywords: ["analyse", "analyser", "analytique", "performance", "performances", "recommandation", "recommandations"],
    description: "Analyse transversale des données CRM (KPI, projets, ventes, pipeline, devis, activités, interventions, performance) avec causes, risques et recommandations.",
  },
  {
    // Distinct de "business_analysis" : celle-ci EXPLIQUE des données déjà
    // choisies par l'utilisateur ("analyse les projets"), celle-ci CONSEILLE
    // sans qu'un domaine précis soit nommé ("conseille-moi", "priorise mes
    // tâches") — voir RECOMMENDATION_AGENT.md, "Recommendation Agent vs
    // Business Analyst Agent". Mots-clés à nouveau volontairement EXCLUSIFS
    // ("conseiller/conseille/conseils", "prioriser/priorise/priorises",
    // "anomalie(s)") — jamais "priorité"/"risque"/"important", trop
    // génériques et déjà utilisés comme marqueurs LOCAUX ailleurs (les
    // ATTENTION_MARKERS de ProjectAgent incluent "priorité"/"risque"), donc
    // déjà présents dans des messages "projects" existants du corpus de
    // validation — les ajouter ICI, au niveau du catalogue, casserait leur
    // routage déjà validé. Placée juste avant "general_chat", même
    // discipline de sécurité des mots-clés que "business_analysis".
    key: "recommendation",
    moduleKey: null,
    requiresRag: false,
    requiresTools: true,
    keywords: ["conseiller", "conseille", "conseils", "prioriser", "priorise", "priorises", "anomalie", "anomalies"],
    description: "Conseil proactif : priorités, tâches importantes, clients à relancer, projets critiques, risques, anomalies et actions recommandées — chaque recommandation justifiée.",
  },
  {
    // Distinct de "recommendation" (qui conseille sur l'URGENCE métier) et
    // de "business_analysis" (qui explique un domaine choisi) : celle-ci
    // audite la FIABILITÉ des données elles-mêmes — doublons, champs
    // manquants, emails/téléphones invalides, documents manquants,
    // incohérences, erreurs de workflow, données orphelines — voir
    // DATA_QUALITY_AGENT.md. Mots-clés à nouveau EXCLUSIFS ("doublon(s)",
    // "orphelin(e/s)", "incohérence(s)", "qualité") — jamais "manquant"/
    // "invalide", trop génériques (apparaîtraient dans des messages métier
    // sans rapport, ex. "champ obligatoire manquant" dans un tout autre
    // contexte). Placée juste avant "general_chat", même discipline de
    // sécurité des mots-clés que "business_analysis"/"recommendation".
    key: "data_quality",
    moduleKey: null,
    requiresRag: false,
    requiresTools: true,
    keywords: ["doublon", "doublons", "orphelin", "orpheline", "orphelins", "orphelines", "incohérence", "incohérences", "qualité"],
    description: "Audit de la fiabilité des données CRM : doublons, informations manquantes, emails/téléphones invalides, documents manquants, incohérences, erreurs de workflow, données orphelines — avec un score qualité et des corrections proposées, jamais appliquées automatiquement.",
  },
  {
    // Recherches complexes multi-critères (date, seuil de montant, absence
    // de correspondance) traversant plusieurs modules — voir
    // ADVANCED_SEARCH_AGENT.md. Mots-clés EXCLUSIFS de vocabulaire de
    // recherche ("recherche(s)", "rechercher", "trouve(r)", "cherche(r)",
    // "filtrer", "filtre") — jamais "projet"/"client"/"montant" etc., déjà
    // pris par d'autres intentions. Placée juste avant "general_chat", même
    // discipline que "business_analysis"/"recommendation"/"data_quality" —
    // enregistrée EN DERNIER : en cas d'égalité de score avec une intention
    // existante, elle perd toujours (jamais un détournement accidentel d'un
    // scénario déjà couvert ailleurs).
    key: "advanced_search",
    moduleKey: null,
    requiresRag: false,
    requiresTools: true,
    keywords: ["recherche", "recherches", "rechercher", "trouve", "trouver", "cherche", "chercher", "filtrer", "filtre"],
    description: "Recherches complexes multi-critères à travers plusieurs modules du CRM (période, seuil de montant, absence de correspondance), en combinant plusieurs AI Tools.",
  },
  {
    // AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — le Copilot doit
    // pouvoir répondre honnêtement à "qu'est-ce que je peux faire ?"/"pourquoi
    // c'est refusé ?" en LISANT les mécanismes RBAC déjà en place (jamais un
    // second système — voir reasoning/capabilityMatrixService.js, qui réutilise
    // AgentRegistry.findHandler()/isAuthorized() tels quels). `moduleKey: null`,
    // `requiresTools: false` : cet Agent n'appelle JAMAIS un Tool MCP — il
    // n'interroge que des registres déjà en mémoire (catalogue, agents),
    // jamais une donnée métier.
    //
    // Enregistrée EN TOUTE DERNIÈRE position avant `general_chat` — même
    // discipline que business_analysis/recommendation/data_quality/
    // advanced_search (voir leurs commentaires respectifs) : sur une égalité
    // de score avec N'IMPORTE QUELLE intention plus ancienne du catalogue,
    // `LexicalIntentRouter` garde TOUJOURS le premier gagnant trouvé (`score >
    // bestScore`, jamais `>=` — voir langchain/router/lexicalIntentRouter.js) —
    // cette intention ne l'emporte donc que sur un signal NET, jamais par
    // coïncidence, et ne peut RÉGRESSER aucun scénario déjà validé
    // (test/fixtures/copilotValidationScenarios.js) : vérifié un par un contre
    // chaque occurrence existante de ces mots-clés dans le corpus avant ajout
    // (ex. "Refuse la demande de congé..." reste `hr` : 2 mots-clés hr contre 1
    // ici, gagne net ; "...techniciens... disponibles" reste `maintenance` :
    // égalité 1-1, `maintenance` déjà enregistrée avant, gagne le départage).
    // "disponible"/"disponibles" délibérément ABSENTS malgré leur pertinence
    // apparente ("Quels agents sont disponibles ?") : reproduit en exécutant
    // le corpus existant — "Bonsoir, es-tu disponible pour discuter ?"/"...es-tu
    // toujours disponible à cette heure ?" (gen-04/gen-21, `general_chat`
    // légitime, aucun autre mot-clé present) auraient basculé à tort vers
    // cette intention : "disponible" est un mot de conversation courante, pas
    // un signal métier exclusif — même discipline que "priorité"/"risque"
    // déjà exclus ailleurs dans ce fichier pour la même raison.
    key: "capability_audit",
    moduleKey: null,
    requiresRag: false,
    requiresTools: false,
    keywords: [
      "capacités", "capacité",
      "permissions", "permission",
      "autorisations", "autorisation", "autorisé", "autorisée", "autorisés", "autorisées",
      "accessible", "accessibles",
      "intentions", "intention",
      "refusé", "refuse", "refusée", "refusee", "refusés", "refuses", "refusées", "refusees",
    ],
    description: "Ce que votre compte permet réellement de faire dans le Copilot : agents, intentions et modules accessibles à votre rôle, et pourquoi une action précise serait refusée.",
  },
  // Phase 2 — assistant documentaire : questions sur les documents que
  // l'utilisateur a lui-même téléversés dans le Copilot (DocumentAgent).
  // `keywords: []` DÉLIBÉRÉMENT : jamais atteinte par la détection lexicale
  // (aucun des 577 scénarios validés ne peut basculer ici) — uniquement par
  // SemanticIntentResolver.resolveDocumentFocus(), quand un document est
  // réellement joint à la conversation.
  {
    // Ingénieurs du CRM (table `engineers`) : liste des ingénieurs référencés,
    // ou ingénieur d'un projet précis. Aucun mot-clé : choisie par le parseur
    // déterministe (analytics/analyticsQueryParser.js) ou par le repli
    // sémantique LLM grâce à cette description — jamais un comptage/classement
    // (→ crm_analytics).
    key: "engineers",
    moduleKey: null,
    requiresRag: false,
    requiresTools: true,
    keywords: [],
    description: "Ingénieurs du CRM : liste des ingénieurs référencés (responsables techniques des projets), ou ingénieur affecté à un projet précis.",
  },
  {
    // Une personne, une société ou un promoteur PRÉCIS (« Qui est Zakariah
    // Derbel ? », « informations sur CBI Tunisia », « promoteur de ce
    // projet ») : fiche CRM et/ou informations publiques du Web, sources
    // citées. Aucun mot-clé : choisie uniquement par le QueryRouter
    // (routing/queryRouter.js, voir aiManager.js), jamais par la détection
    // lexicale — aucun parcours existant n'est détourné.
    key: "entity_lookup",
    moduleKey: null,
    requiresRag: false,
    requiresTools: true,
    keywords: [],
    description: "Fiche d'un ingénieur, d'une personne ou d'une société précise (données CRM, projets associés) et informations publiques trouvées sur le Web, ou promoteur d'un projet.",
  },
  {
    // Analytique CRM (PROBAR ASSISTANT) — comptages, classements et
    // répartitions sur les DONNÉES du CRM (« quel ingénieur a le plus de
    // projets ? », « combien de relances ce mois-ci ? », FR/EN/RU). Aucun
    // mot-clé : choisie uniquement par AnalyticsQueryParser (voir
    // aiManager.js), jamais par la détection lexicale ; les chiffres viennent
    // toujours d'un Tool statistique, jamais de la documentation.
    key: "crm_analytics",
    moduleKey: null,
    requiresRag: false,
    requiresTools: true,
    keywords: [],
    description: "Statistiques du CRM : nombre, classement et répartition des projets (par ingénieur, commercial, statut, client, famille, mois), des contacts et relances, et des fiches industrielles (par machine, module, opérateur).",
  },
  {
    // Phase 3 — demande composée (« trouve mes projets … et prépare une
    // relance pour chacun ») : lecture → analyse → écritures préparées puis
    // exécutées après « confirme ». Aucun mot-clé : choisie uniquement par
    // TaskPlanner.detect() (voir aiManager.js), jamais par la détection
    // lexicale ; aucun parcours existant n'est donc détourné.
    key: "multi_step_task",
    moduleKey: null,
    requiresRag: false,
    requiresTools: true,
    keywords: [],
    description: "Tâche en plusieurs étapes sur vos projets ou contacts (rechercher, analyser, puis préparer une action pour chacun) — exécutée seulement après votre confirmation.",
  },
  {
    key: "document_question",
    moduleKey: null,
    requiresRag: true,
    requiresTools: false,
    keywords: [],
    description: "Questions sur un document que vous avez joint au Copilot : résumé, recherche d'informations, problèmes mentionnés, comparaison avec le CRM.",
  },
  {
    key: "general_chat",
    moduleKey: null,
    requiresRag: true,
    requiresTools: false,
    keywords: [],
    description: "Message sans intention métier précise identifiée — repli par défaut.",
  },
];

module.exports = { DEFAULT_INTENT_CATALOG };
