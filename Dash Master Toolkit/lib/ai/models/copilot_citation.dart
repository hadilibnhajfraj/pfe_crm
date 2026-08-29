// lib/ai/models/copilot_citation.dart
//
// Une source documentaire citée par le Copilot (RAG) — voir l'enveloppe
// `citations` retournée par POST /ai-copilot/chat côté backend
// (src/ai/orchestrator/responseBuilder.js).
class CopilotCitation {
  final int index;
  final String title;
  final String sourceType;
  final String path;
  final String excerpt;
  final double score;

  const CopilotCitation({
    required this.index,
    required this.title,
    required this.sourceType,
    required this.path,
    required this.excerpt,
    required this.score,
  });

  factory CopilotCitation.fromJson(Map<String, dynamic> j) {
    return CopilotCitation(
      index: _int(j['index']),
      title: _str(j['title'], fallback: 'Source'),
      sourceType: _str(j['sourceType']),
      path: _str(j['path']),
      excerpt: _str(j['excerpt']),
      score: _double(j['score']),
    );
  }

  static int _int(dynamic v) => v is num ? v.toInt() : int.tryParse(v?.toString() ?? '') ?? 0;
  static double _double(dynamic v) => v is num ? v.toDouble() : double.tryParse(v?.toString() ?? '') ?? 0.0;
  static String _str(dynamic v, {String fallback = ''}) =>
      (v == null || v.toString().trim().isEmpty) ? fallback : v.toString().trim();
}
