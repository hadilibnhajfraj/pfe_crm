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
const List<String> kDefaultCopilotSuggestions = [
  'Quels projets sont en retard ?',
  'Conseille-moi sur mes priorités du jour',
  'Fais-moi un rapport de synthèse sur les indicateurs clés',
  'Quels clients dois-je relancer cette semaine ?',
];

const List<String> _dashboardSuggestions = ['Quels sont mes KPI ?', 'Quels projets sont critiques ?', 'Montre les ventes.'];

const List<String> _projectSuggestions = ['Résume le projet.', 'Analyse les risques.', 'Créer une activité.', 'Créer un rapport.'];

const List<String> _clientSuggestions = ['Montre les devis.', 'Relance les clients.', 'Créer une opportunité.'];

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

class CopilotQuickPrompt {
  const CopilotQuickPrompt({required this.label, required this.message, this.action = CopilotQuickPromptAction.send});

  final String label;
  final String message;

  /// `attachDocument` : ouvre le sélecteur de fichier ; `message` est alors
  /// proposé dans le champ de saisie une fois le document prêt.
  final CopilotQuickPromptAction action;
}

const List<CopilotQuickPrompt> kCopilotQuickPrompts = [
  CopilotQuickPrompt(label: '📊 Analyse mes projets', message: 'Analyse mes projets.'),
  CopilotQuickPrompt(label: '👥 Montre mes contacts', message: 'Montre mes contacts commerciaux.'),
  CopilotQuickPrompt(label: '📄 Analyse un document', message: 'Résume ce document.', action: CopilotQuickPromptAction.attachDocument),
  CopilotQuickPrompt(label: '🔎 Trouve les projets sans relance', message: "Quels projets n'ont pas été relancés depuis 30 jours ?"),
  CopilotQuickPrompt(label: '🤖 Que peux-tu faire ?', message: 'Quelles sont mes capacités dans le Copilot ?'),
];
