// lib/ai/models/conversation_summary.dart
//
// Une entrée de la liste "Historique des conversations" — reflète
// GET /ai-copilot/conversations (voir conversationIndex.service.js côté
// backend : id, aperçu, intention, date de mise à jour ; jamais le contenu
// complet des messages, récupéré séparément à l'ouverture via
// GET /ai-copilot/conversations/:id).
class ConversationSummary {
  final String conversationId;
  final DateTime updatedAt;
  final String? preview;
  final String? intent;

  const ConversationSummary({
    required this.conversationId,
    required this.updatedAt,
    this.preview,
    this.intent,
  });

  factory ConversationSummary.fromJson(Map<String, dynamic> j) {
    return ConversationSummary(
      conversationId: (j['conversationId'] ?? '').toString(),
      updatedAt: _date(j['updatedAt']),
      preview: j['preview']?.toString(),
      intent: j['intent']?.toString(),
    );
  }

  static DateTime _date(dynamic v) {
    if (v == null) return DateTime.now();
    try {
      return DateTime.parse(v.toString());
    } catch (_) {
      return DateTime.now();
    }
  }
}
