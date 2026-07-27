class TaskModel {
  final String id;
  final String title;
  final String description;
  final DateTime startAt;
  final String status;
  final String? creatorEmail;

  // ✅ NEW
  final String? projectId;
  final String? projectName;

  // ── Ajoutés pour les événements issus des actions Timeline (voir
  // projectActionCalendarSync.service.js) — nullable : les Task créées
  // manuellement avant cette colonne retombent sur le fallback +30min.
  final DateTime? endAt;
  final String? priority;

  TaskModel({
    required this.id,
    required this.title,
    required this.description,
    required this.startAt,
    required this.status,
    this.creatorEmail,
    this.projectId,
    this.projectName,
    this.endAt,
    this.priority,
  });

  /// Fin réelle de l'événement si renseignée, sinon fallback historique
  /// (comportement inchangé pour les Task créées avant l'ajout d'`endAt`).
  DateTime get effectiveEndAt => endAt ?? startAt.add(const Duration(minutes: 30));

  factory TaskModel.fromJson(Map<String, dynamic> json) {
    return TaskModel(
      id: (json["id"] ?? "").toString(),
      title: (json["title"] ?? "").toString(),
      description: (json["description"] ?? "").toString(),
      startAt: DateTime.tryParse((json["startAt"] ?? "").toString()) ?? DateTime.now(),
      status: (json["status"] ?? "planned").toString(),
      creatorEmail: json["creatorEmail"]?.toString(),

      // ✅ NEW
      projectId: json["projectId"]?.toString(),
      projectName: json["projectName"]?.toString(),

      endAt: json["endAt"] != null ? DateTime.tryParse(json["endAt"].toString()) : null,
      priority: json["priority"]?.toString(),
    );
  }
}
