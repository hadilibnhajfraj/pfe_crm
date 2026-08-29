// lib/ai/models/copilot_dashboard_briefing.dart
//
// Reflète 1:1 GET /ai-copilot/dashboard (voir
// Backend Master/src/modules/ai-copilot/services/dashboardBriefing.service.js)
// — le briefing "AI Dashboard" affiché à l'ouverture du Copilot : greeting,
// compteurs du jour, qualité CRM, cartes de risque/recommandation, timeline,
// graphique. `recommendationCards` réutilise CopilotSuggestion tel quel : le
// backend renvoie EXACTEMENT la même forme `{id, label, reason}` que les
// suggestions post-réponse (même SuggestionEngine, voir
// dashboardBriefing.service.js) — jamais un deuxième modèle pour la même
// forme.
import 'copilot_suggestion.dart';

class CopilotGreeting {
  final String? firstName;
  final String fullName;

  const CopilotGreeting({this.firstName, required this.fullName});

  factory CopilotGreeting.fromJson(Map<String, dynamic> j) {
    final firstName = j['firstName']?.toString().trim();
    return CopilotGreeting(
      firstName: (firstName == null || firstName.isEmpty) ? null : firstName,
      fullName: (j['fullName'] ?? '').toString(),
    );
  }
}

// `urgentInterventions` reste `null` (jamais 0) quand le rôle de
// l'utilisateur n'est pas autorisé à voir ce chiffre côté backend (voir
// isMaintenanceManager côté dashboardBriefing.service.js) — l'UI doit
// distinguer "aucune intervention urgente" de "vous n'avez pas accès à
// cette donnée", jamais confondre les deux.
class CopilotDashboardCounts {
  final int criticalProjects;
  final int expiringQuotes;
  final int? urgentInterventions;
  final int clientsToFollowUp;

  const CopilotDashboardCounts({
    required this.criticalProjects,
    required this.expiringQuotes,
    required this.urgentInterventions,
    required this.clientsToFollowUp,
  });

  factory CopilotDashboardCounts.fromJson(Map<String, dynamic> j) {
    return CopilotDashboardCounts(
      criticalProjects: _int(j['criticalProjects']),
      expiringQuotes: _int(j['expiringQuotes']),
      urgentInterventions: j['urgentInterventions'] == null ? null : _int(j['urgentInterventions']),
      clientsToFollowUp: _int(j['clientsToFollowUp']),
    );
  }
}

class CopilotCrmQuality {
  final int score;

  const CopilotCrmQuality({required this.score});

  factory CopilotCrmQuality.fromJson(Map<String, dynamic> j) => CopilotCrmQuality(score: _int(j['score']));
}

class CopilotRiskCard {
  final String projectId;
  final String projectName;
  final int score;
  final String priority; // "critique" | "elevee" | "moyenne" | "faible"
  final String? topReason;

  const CopilotRiskCard({
    required this.projectId,
    required this.projectName,
    required this.score,
    required this.priority,
    this.topReason,
  });

  factory CopilotRiskCard.fromJson(Map<String, dynamic> j) {
    final topReason = j['topReason']?.toString().trim();
    return CopilotRiskCard(
      projectId: (j['projectId'] ?? '').toString(),
      projectName: (j['projectName'] ?? 'Projet').toString(),
      score: _int(j['score']),
      priority: (j['priority'] ?? 'faible').toString(),
      topReason: (topReason == null || topReason.isEmpty) ? null : topReason,
    );
  }
}

class CopilotTimelineItem {
  final String type; // project | quote | intervention | relance
  final String bucket; // today | week | later
  final String label;
  final String? refId;
  final DateTime? date;

  const CopilotTimelineItem({
    required this.type,
    required this.bucket,
    required this.label,
    this.refId,
    this.date,
  });

  factory CopilotTimelineItem.fromJson(Map<String, dynamic> j) {
    return CopilotTimelineItem(
      type: (j['type'] ?? '').toString(),
      bucket: (j['bucket'] ?? 'later').toString(),
      label: (j['label'] ?? '').toString(),
      refId: j['refId']?.toString(),
      date: _dateOrNull(j['date']),
    );
  }
}

class CopilotChartData {
  final List<String> labels;
  final List<int> values;

  const CopilotChartData({required this.labels, required this.values});

  factory CopilotChartData.fromJson(Map<String, dynamic> j) {
    final rawLabels = j['labels'];
    final rawValues = j['values'];
    return CopilotChartData(
      labels: rawLabels is List ? rawLabels.map((e) => e.toString()).toList() : const [],
      values: rawValues is List ? rawValues.map(_int).toList() : const [],
    );
  }
}

class CopilotDashboardBriefing {
  final DateTime? generatedAt;
  final CopilotGreeting greeting;
  final CopilotDashboardCounts today;
  final CopilotCrmQuality crmQuality;
  final List<CopilotRiskCard> riskCards;
  final List<CopilotSuggestion> recommendationCards;
  final List<CopilotTimelineItem> timeline;
  final CopilotChartData chart;

  const CopilotDashboardBriefing({
    this.generatedAt,
    required this.greeting,
    required this.today,
    required this.crmQuality,
    required this.riskCards,
    required this.recommendationCards,
    required this.timeline,
    required this.chart,
  });

  factory CopilotDashboardBriefing.fromJson(Map<String, dynamic> j) {
    return CopilotDashboardBriefing(
      generatedAt: _dateOrNull(j['generatedAt']),
      greeting: CopilotGreeting.fromJson(_map(j['greeting'])),
      today: CopilotDashboardCounts.fromJson(_map(j['today'])),
      crmQuality: CopilotCrmQuality.fromJson(_map(j['crmQuality'])),
      riskCards: _list(j['riskCards']).map((e) => CopilotRiskCard.fromJson(e)).toList(),
      recommendationCards: _list(j['recommendationCards']).map((e) => CopilotSuggestion.fromJson(e)).toList(),
      timeline: _list(j['timeline']).map((e) => CopilotTimelineItem.fromJson(e)).toList(),
      chart: CopilotChartData.fromJson(_map(j['chart'])),
    );
  }
}

int _int(dynamic v) => v is num ? v.toInt() : 0;

Map<String, dynamic> _map(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : const {};

List<Map<String, dynamic>> _list(dynamic v) => v is List ? v.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() : const [];

DateTime? _dateOrNull(dynamic v) {
  if (v == null) return null;
  try {
    return DateTime.parse(v.toString());
  } catch (_) {
    return null;
  }
}
