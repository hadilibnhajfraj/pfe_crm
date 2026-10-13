// lib/ai/services/copilot_suggestion_engine.dart
//
// Smart Suggestions — questions de démarrage proposées automatiquement
// selon l'écran affiché (voir CopilotPageContext/CopilotContextController),
// avant même que l'utilisateur ait tapé quoi que ce soit. À ne pas
// confondre avec CopilotSuggestion (models/copilot_suggestion.dart) : celles-
// là sont des actions POST-réponse renvoyées par le backend
// (src/ai/orchestrator/suggestionEngine.js, uniquement sur le chemin
// d'analyse d'attention de ProjectAgent aujourd'hui) ; celles-ci sont des
// questions PRÉ-conversation, calculées 100% côté client à partir du
// contexte d'écran déjà envoyé au backend (voir Context Awareness) — aucun
// aller-retour réseau nécessaire pour les afficher.
//
// Fonction pure, aucune dépendance réseau/GetX — testable isolément.
import '../models/copilot_page_context.dart';

/// Utilisées quand aucun contexte d'écran n'est actif (écran non encore
/// intégré à Context Awareness, ou aucun écran compatible ouvert).
// Chaque question ci-dessous a été posée au backend réel (compte commercial,
// base de démonstration, 12/10/2026) : toutes déclenchent un outil MCP et
// répondent en moins de 5 secondes. Écartées parce qu'elles n'atteignaient
// aucun outil, renvoyaient un contenu sans rapport avec leur libellé ou
// passaient par le modèle seul (60 à 160 s) : « Quels sont mes KPI ? »,
// « Montre les ventes. », « Montre les devis. », « Créer une opportunité. »,
// « Créer une activité. », « Créer un rapport. », « Analyse les risques. »
// (réservée aux administrateurs), « Fais-moi un rapport de synthèse… ».
const List<String> kDefaultCopilotSuggestions = [
  'Quels projets sont en retard ?',
  'Conseille-moi sur mes priorités du jour.',
  'Combien de projets par statut ?',
  'Quels clients dois-je relancer cette semaine ?',
];

const List<String> _dashboardSuggestions = ['Combien de projets par statut ?', 'Quels projets sont critiques ?', 'Analyse mes contacts commerciaux.'];

const List<String> _projectSuggestions = ['Analyse mes projets.', 'Quels projets sont en retard ?', "Quels projets n'ont pas été relancés depuis 30 jours ?"];

const List<String> _clientSuggestions = ['Analyse mes contacts commerciaux.', 'Relance les clients.', 'Quels clients dois-je relancer cette semaine ?'];

const List<String> _industrialSuggestions = ['Résume la fiche.', 'Vérifie la conformité.', 'Analyse les diamètres.'];

/// Questions de démarrage adaptées à l'écran actuellement affiché.
/// `screenType == null` retombe sur [kDefaultCopilotSuggestions].
List<String> starterSuggestionsFor(CopilotScreenType? screenType) {
  switch (screenType) {
    case CopilotScreenType.dashboard:
      return _dashboardSuggestions;
    case CopilotScreenType.project:
      return _projectSuggestions;
    case CopilotScreenType.client:
      return _clientSuggestions;
    case CopilotScreenType.industrial:
      return _industrialSuggestions;
    case null:
      return kDefaultCopilotSuggestions;
  }
}

/// Suggestions de prompts de l'écran d'accueil du Copilot. `label` est ce
/// qui est affiché ; `message` est la question réellement envoyée — formulée
/// pour atteindre l'Agent backend approprié (vérifié contre le détecteur
/// d'intentions : projects, commercial_contacts, capability_audit).
enum CopilotQuickPromptAction { send, attachDocument }

/// Pictogramme d'une suggestion — une clé, pas un `IconData` : ce fichier
/// reste sans dépendance Flutter (le widget fait la correspondance).
enum CopilotQuickPromptIcon { projects, followUp, activity, attention, overdue, pipeline, document, capabilities }

class CopilotQuickPrompt {
  const CopilotQuickPrompt({required this.label, required this.message, required this.icon, this.action = CopilotQuickPromptAction.send});

  final String label;
  final String message;
  final CopilotQuickPromptIcon icon;

  /// `attachDocument` : ouvre le sélecteur de fichier ; `message` est alors
  /// proposé dans le champ de saisie une fois le document prêt.
  final CopilotQuickPromptAction action;
}

//
// Quand `message` diffère de `label`, c'est que le libellé, envoyé tel
// quel, n'atteignait pas l'outil attendu (constaté sur le backend réel) :
// - « Quels projets nécessitent une relance ? » partait vers les contacts ;
// - « Résume l'activité commerciale… » et « Analyse le pipeline commercial. »
//   n'appelaient aucun outil de données et attendaient le modèle 100 à 160 s ;
// - il n'existe pas d'outil « actions en retard » : la réponse vient de
//   l'analyse d'attention des projets, qui liste les actions bloquées.
// La question réellement envoyée s'affiche dans la conversation.
const List<CopilotQuickPrompt> kCopilotQuickPrompts = [
  CopilotQuickPrompt(
    label: 'Combien de projets sont enregistrés dans le CRM ?',
    message: 'Combien de projets sont enregistrés dans le CRM ?',
    icon: CopilotQuickPromptIcon.projects,
  ),
  CopilotQuickPrompt(
    label: 'Quels projets nécessitent une relance ?',
    message: "Quels projets n'ont pas été relancés depuis 30 jours ?",
    icon: CopilotQuickPromptIcon.followUp,
  ),
  CopilotQuickPrompt(
    label: "Résume l'activité commerciale sur la période disponible.",
    message: 'Analyse mes contacts commerciaux.',
    icon: CopilotQuickPromptIcon.activity,
  ),
  CopilotQuickPrompt(
    label: 'Quels dossiers nécessitent une attention particulière ?',
    message: 'Quels dossiers nécessitent une attention particulière ?',
    icon: CopilotQuickPromptIcon.attention,
  ),
  CopilotQuickPrompt(
    label: 'Affiche les actions en retard.',
    message: 'Quels projets sont en retard ?',
    icon: CopilotQuickPromptIcon.overdue,
  ),
  CopilotQuickPrompt(
    label: 'Analyse le pipeline commercial.',
    message: 'Combien de projets par statut ?',
    icon: CopilotQuickPromptIcon.pipeline,
  ),
  CopilotQuickPrompt(
    label: 'Analyse un document',
    message: 'Résume ce document.',
    icon: CopilotQuickPromptIcon.document,
    action: CopilotQuickPromptAction.attachDocument,
  ),
  CopilotQuickPrompt(
    label: 'Que peux-tu faire ?',
    message: 'Quelles sont mes capacités dans le Copilot ?',
    icon: CopilotQuickPromptIcon.capabilities,
  ),
];
