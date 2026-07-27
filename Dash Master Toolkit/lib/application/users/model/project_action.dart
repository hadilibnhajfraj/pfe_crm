class ProjectAction {

  final String id;
  final String typeAction;
  final String commentaire;
  final String dateAction;
  final String createdBy;

  /// ✅ NEW
  final String? fileUrl;

  // ── Calendrier CRM + Google Calendar (voir projectActionCalendarSync.service.js) ──
  final String? priorite;
  final String? dateFin;
  final String? calendarEventId;
  final bool googleCalendarSynced;
  final String? googleCalendarError;
  final String? googleEventLink;

  ProjectAction({
    required this.id,
    required this.typeAction,
    required this.commentaire,
    required this.dateAction,
    required this.createdBy,
    this.fileUrl, // ✅ NEW
    this.priorite,
    this.dateFin,
    this.calendarEventId,
    this.googleCalendarSynced = false,
    this.googleCalendarError,
    this.googleEventLink,
  });

  /// L'action est synchronisée dans le calendrier CRM personnel de l'agent
  /// (Task) dès que calendarEventId est renseigné — indépendamment de Google.
  bool get isCalendarSynced => calendarEventId != null;

  /// "✓ Synchronisé" ne doit s'afficher que si Google a réellement confirmé
  /// la création/mise à jour de l'événement (point 11).
  bool get isGoogleSynced => googleCalendarSynced == true;

  factory ProjectAction.fromJson(Map<String, dynamic> json) {

    return ProjectAction(
      id: json["id"].toString(),
      typeAction: json["typeAction"] ?? "",
      commentaire: json["commentaire"] ?? "",
      dateAction: json["dateAction"] ?? json["createdAt"],
      createdBy: json["createdBy"] ?? "",

      /// ✅ NEW
      fileUrl: json["fileUrl"],

      priorite: json["priorite"]?.toString(),
      dateFin: json["dateFin"]?.toString(),
      calendarEventId: json["calendarEventId"]?.toString(),
      googleCalendarSynced: json["googleCalendarSynced"] == true,
      googleCalendarError: json["googleCalendarError"]?.toString(),
      googleEventLink: json["googleEventLink"]?.toString(),
    );

  }

}