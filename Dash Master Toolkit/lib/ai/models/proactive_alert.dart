// lib/ai/models/proactive_alert.dart
//
// Reflète 1:1 le payload de l'événement WebSocket `proactive-ai-alert` (voir
// Backend Master/src/ai/proactive/PROACTIVE_AI.md et
// AI_COPILOT_HTTP.md, section "proactive-ai-alert") — le Copilot ne surveille
// plus seulement à la demande : Projets, Pipeline, Ventes, Maintenance, RH,
// Industrial, Dashboard (KPI). `workflow` reste `null` la plupart du temps :
// un Tool exécutable n'est proposé QUE quand le backend peut le construire
// sans deviner de données — jamais un bouton "Confirmer" affiché pour une
// action que le backend ne peut pas réellement exécuter.
class ProactiveWorkflow {
  final String id;
  final String label;
  final String reason;
  final String status;

  const ProactiveWorkflow({required this.id, required this.label, required this.reason, required this.status});

  factory ProactiveWorkflow.fromJson(Map<String, dynamic> j) {
    return ProactiveWorkflow(
      id: (j['id'] ?? '').toString(),
      label: (j['label'] ?? '').toString(),
      reason: (j['reason'] ?? '').toString(),
      status: (j['status'] ?? '').toString(),
    );
  }
}

class ProactiveAlert {
  final String domain;
  final String subject;
  final String severity;
  final Map<String, dynamic> analysis;
  final String explanation;
  final String suggestion;
  final List<String> suggestedActions;
  final ProactiveWorkflow? workflow;
  final Map<String, dynamic> context;

  /// Horodatage de réception côté client — le backend n'envoie pas de date
  /// sur l'alerte elle-même ; sert uniquement à trier/afficher côté UI.
  final DateTime receivedAt;

  ProactiveAlert({
    required this.domain,
    required this.subject,
    required this.severity,
    required this.analysis,
    required this.explanation,
    required this.suggestion,
    required this.suggestedActions,
    required this.workflow,
    required this.context,
    DateTime? receivedAt,
  }) : receivedAt = receivedAt ?? DateTime.now();

  factory ProactiveAlert.fromJson(Map<String, dynamic> j) {
    final rawActions = j['suggestedActions'];
    final rawWorkflow = j['workflow'];

    return ProactiveAlert(
      domain: (j['domain'] ?? '').toString(),
      subject: (j['subject'] ?? '').toString(),
      severity: (j['severity'] ?? '').toString(),
      analysis: j['analysis'] is Map ? Map<String, dynamic>.from(j['analysis'] as Map) : const {},
      explanation: (j['explanation'] ?? '').toString(),
      suggestion: (j['suggestion'] ?? '').toString(),
      suggestedActions: rawActions is List ? rawActions.map((e) => e.toString()).toList() : const [],
      workflow: rawWorkflow is Map ? ProactiveWorkflow.fromJson(Map<String, dynamic>.from(rawWorkflow)) : null,
      context: j['context'] is Map ? Map<String, dynamic>.from(j['context'] as Map) : const {},
    );
  }
}
