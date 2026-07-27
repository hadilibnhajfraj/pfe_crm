// lib/forms/controller/project_timeline_controller.dart

import 'package:get/get.dart';
import '../../providers/api_client.dart';

// ── Reminder model ────────────────────────────────────────────────────────────

class ReminderModel {
  final String id;
  final String dateRelance;
  final String? message;

  const ReminderModel({
    required this.id,
    required this.dateRelance,
    this.message,
  });

  factory ReminderModel.fromJson(Map<String, dynamic> j) => ReminderModel(
        id: j['id']?.toString() ?? '',
        dateRelance: j['dateRelance']?.toString() ?? '',
        message: j['message']?.toString(),
      );
}

// ── Action model ──────────────────────────────────────────────────────────────

class ProjectActionModel {
  final String id;
  final String typeAction;
  final String? commentaire;
  final String? statut;
  final String dateAction;
  final String? fileUrl;
  final List<ReminderModel> reminders;

  // ── Calendrier CRM + Google Calendar (voir projectActionCalendarSync.service.js) ──
  final String? calendarEventId;
  final bool googleCalendarSynced;
  final String? googleCalendarError;
  final String? googleEventLink;

  const ProjectActionModel({
    required this.id,
    required this.typeAction,
    this.commentaire,
    this.statut,
    required this.dateAction,
    this.fileUrl,
    required this.reminders,
    this.calendarEventId,
    this.googleCalendarSynced = false,
    this.googleCalendarError,
    this.googleEventLink,
  });

  /// Synchronisé dans le calendrier CRM personnel de l'agent (Task) —
  /// indépendant de Google Calendar (voir googleCalendarSynced).
  bool get isCalendarSynced => calendarEventId != null;

  /// Point 11 : "✓ Synchronisé" ne doit s'afficher QUE si googleEventId
  /// existe ET Google a confirmé la création/mise à jour (HTTP 200/201) —
  /// googleCalendarSynced n'est jamais mis à true côté backend sans ce
  /// succès confirmé (voir projectActionGoogleSync.service.js).
  bool get isGoogleSynced => googleCalendarSynced == true;

  factory ProjectActionModel.fromJson(Map<String, dynamic> j) {
    // Backend uses typeAction_legacy as the canonical field name.
    // Fall back to typeAction if present for forward compatibility.
    final type = (j['typeAction_legacy'] ?? j['typeAction'] ?? '').toString();

    // dateAction may not be set on older records — fall back to createdAt.
    final date = (j['dateAction'] ?? j['createdAt'] ?? '').toString();

    final remindersRaw = j['reminders'];
    final reminders = remindersRaw is List
        ? remindersRaw
            .map((r) => ReminderModel.fromJson(Map<String, dynamic>.from(r as Map)))
            .toList()
        : <ReminderModel>[];

    return ProjectActionModel(
      id: j['id']?.toString() ?? '',
      typeAction: type,
      commentaire: j['commentaire']?.toString(),
      statut: j['statut']?.toString(),
      dateAction: date,
      fileUrl: j['fileUrl']?.toString(),
      reminders: reminders,
      calendarEventId: j['calendarEventId']?.toString(),
      googleCalendarSynced: j['googleCalendarSynced'] == true,
      googleCalendarError: j['googleCalendarError']?.toString(),
      googleEventLink: j['googleEventLink']?.toString(),
    );
  }
}

// ── Controller ────────────────────────────────────────────────────────────────

class ProjectTimelineController extends GetxController {
  final actions = <ProjectActionModel>[].obs;
  final loading = false.obs;
  final error = RxnString();

  /// Loads all actions across every project — admin-only mode.
  Future<void> loadAllActions() async {
    loading.value = true;
    error.value = null;
    try {
      final res = await ApiClient.instance.dio.get('/projects/actions');
      final raw = res.data;
      final List dataList;
      if (raw is Map && raw.containsKey('data')) {
        final d = raw['data'];
        dataList = d is List ? d : [];
      } else if (raw is List) {
        dataList = raw;
      } else {
        dataList = [];
      }
      actions.value = dataList
          .map((e) => ProjectActionModel.fromJson(
              Map<String, dynamic>.from(e as Map)))
          .toList();
      actions.sort((a, b) =>
          _parseDate(b.dateAction).compareTo(_parseDate(a.dateAction)));
    } catch (e) {
      error.value = e.toString();
      actions.clear();
    } finally {
      loading.value = false;
    }
  }

  Future<void> loadActions(String projectId) async {
    loading.value = true;
    error.value = null;

    try {
      final res = await ApiClient.instance.dio.get(
        '/projects/$projectId/actions',
      );

      // The backend wraps its response: { success: true, data: [...] }
      // Handle both the envelope form and a bare list for resilience.
      final raw = res.data;
      final List dataList;
      if (raw is Map && raw.containsKey('data')) {
        final d = raw['data'];
        dataList = d is List ? d : [];
      } else if (raw is List) {
        dataList = raw;
      } else {
        dataList = [];
      }

      actions.value = dataList
          .map((e) => ProjectActionModel.fromJson(
              Map<String, dynamic>.from(e as Map)))
          .toList();

      // Most recent action first.
      actions.sort((a, b) => _parseDate(b.dateAction)
          .compareTo(_parseDate(a.dateAction)));
    } catch (e) {
      error.value = e.toString();
      actions.clear();
    } finally {
      loading.value = false;
    }
  }

  static DateTime _parseDate(String s) {
    if (s.isEmpty) return DateTime.fromMillisecondsSinceEpoch(0);
    try {
      return DateTime.parse(s).toLocal();
    } catch (_) {
      return DateTime.fromMillisecondsSinceEpoch(0);
    }
  }
}
