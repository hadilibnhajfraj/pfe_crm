// lib/ai/models/copilot_suggestion.dart
//
// Une action suggérée par le Copilot après sa réponse — purement
// descriptive côté backend (`{id, label, reason}`, voir SmartSuggestions/
// SuggestionEngine) : le Copilot ne l'exécute JAMAIS lui-même, il ne fait
// que la proposer. Un tap dessus, côté Flutter, doit renvoyer le libellé
// comme nouveau message utilisateur (voir CopilotController.sendSuggestion)
// — jamais déclencher une action directement, exactement comme le backend.
class CopilotSuggestion {
  final String id;
  final String label;
  final String reason;

  const CopilotSuggestion({
    required this.id,
    required this.label,
    required this.reason,
  });

  factory CopilotSuggestion.fromJson(Map<String, dynamic> j) {
    return CopilotSuggestion(
      id: _str(j['id']),
      label: _str(j['label'], fallback: 'Suggestion'),
      reason: _str(j['reason']),
    );
  }

  static String _str(dynamic v, {String fallback = ''}) =>
      (v == null || v.toString().trim().isEmpty) ? fallback : v.toString().trim();
}
