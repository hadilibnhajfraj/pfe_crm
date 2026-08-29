import 'package:flutter_test/flutter_test.dart';

import 'package:dash_master_toolkit/ai/models/copilot_dashboard_briefing.dart';

void main() {
  group('CopilotGreeting', () {
    test('parses firstName/fullName', () {
      final g = CopilotGreeting.fromJson({'firstName': 'Khalil', 'fullName': 'Khalil Ben Ali'});
      expect(g.firstName, 'Khalil');
      expect(g.fullName, 'Khalil Ben Ali');
    });

    test('firstName reste null (jamais une chaîne vide) quand absent — jamais fabriqué', () {
      final g = CopilotGreeting.fromJson({'firstName': null, 'fullName': 'khalil@cbi.tn'});
      expect(g.firstName, isNull);
      expect(g.fullName, 'khalil@cbi.tn');
    });
  });

  group('CopilotDashboardCounts', () {
    test('parses les 4 compteurs', () {
      final c = CopilotDashboardCounts.fromJson({'criticalProjects': 5, 'expiringQuotes': 3, 'urgentInterventions': 2, 'clientsToFollowUp': 4});
      expect(c.criticalProjects, 5);
      expect(c.expiringQuotes, 3);
      expect(c.urgentInterventions, 2);
      expect(c.clientsToFollowUp, 4);
    });

    test('urgentInterventions reste null (jamais 0) quand le backend l\'omet — rôle non autorisé à le voir', () {
      final c = CopilotDashboardCounts.fromJson({'criticalProjects': 0, 'expiringQuotes': 0, 'urgentInterventions': null, 'clientsToFollowUp': 0});
      expect(c.urgentInterventions, isNull);
    });

    test('zéro est une vraie valeur pour les autres compteurs, jamais confondu avec "absent"', () {
      final c = CopilotDashboardCounts.fromJson({'criticalProjects': 0, 'expiringQuotes': 0, 'urgentInterventions': 0, 'clientsToFollowUp': 0});
      expect(c.criticalProjects, 0);
      expect(c.urgentInterventions, 0);
    });
  });

  group('CopilotCrmQuality', () {
    test('parses le score', () {
      expect(CopilotCrmQuality.fromJson({'score': 96}).score, 96);
    });
  });

  group('CopilotRiskCard', () {
    test('parses tous les champs', () {
      final card = CopilotRiskCard.fromJson({
        'projectId': 'p1',
        'projectName': 'Villa Sfax',
        'score': 24,
        'priority': 'critique',
        'topReason': 'Relance en retard de 12 jour(s)',
      });
      expect(card.projectId, 'p1');
      expect(card.projectName, 'Villa Sfax');
      expect(card.score, 24);
      expect(card.priority, 'critique');
      expect(card.topReason, 'Relance en retard de 12 jour(s)');
    });

    test('topReason null quand absent, jamais une chaîne vide fabriquée', () {
      final card = CopilotRiskCard.fromJson({'projectId': 'p1', 'projectName': 'Villa Sfax', 'score': 0, 'priority': 'faible'});
      expect(card.topReason, isNull);
    });
  });

  group('CopilotTimelineItem', () {
    test('parses type/bucket/label/refId/date', () {
      final item = CopilotTimelineItem.fromJson({'type': 'quote', 'bucket': 'week', 'label': 'Devis "X" expire dans 5 jour(s)', 'refId': 'd1', 'date': '2026-08-12'});
      expect(item.type, 'quote');
      expect(item.bucket, 'week');
      expect(item.label, 'Devis "X" expire dans 5 jour(s)');
      expect(item.refId, 'd1');
      expect(item.date, DateTime.parse('2026-08-12'));
    });

    test('date null (jamais une exception) quand absente ou invalide', () {
      expect(CopilotTimelineItem.fromJson({'type': 'project', 'bucket': 'today', 'label': 'x'}).date, isNull);
      expect(CopilotTimelineItem.fromJson({'type': 'project', 'bucket': 'today', 'label': 'x', 'date': 'not-a-date'}).date, isNull);
    });
  });

  group('CopilotChartData', () {
    test('parses labels/values', () {
      final chart = CopilotChartData.fromJson({
        'labels': ['Projets critiques', 'Devis expirants'],
        'values': [5, 3],
      });
      expect(chart.labels, ['Projets critiques', 'Devis expirants']);
      expect(chart.values, [5, 3]);
    });

    test('listes vides (jamais une exception) quand les champs sont absents', () {
      final chart = CopilotChartData.fromJson({});
      expect(chart.labels, isEmpty);
      expect(chart.values, isEmpty);
    });
  });

  group('CopilotDashboardBriefing — l\'enveloppe complète', () {
    final fullJson = {
      'generatedAt': '2026-08-07T08:00:00.000Z',
      'greeting': {'firstName': 'Khalil', 'fullName': 'Khalil Ben Ali'},
      'today': {'criticalProjects': 5, 'expiringQuotes': 3, 'urgentInterventions': 2, 'clientsToFollowUp': 4},
      'crmQuality': {'score': 96},
      'riskCards': [
        {'projectId': 'p1', 'projectName': 'Villa Sfax', 'score': 24, 'priority': 'critique', 'topReason': 'x'},
      ],
      'recommendationCards': [
        {'id': 'create_activity', 'label': 'Créer une activité', 'reason': 'x'},
      ],
      'timeline': [
        {'type': 'project', 'bucket': 'today', 'label': 'Projet critique : Villa Sfax'},
      ],
      'chart': {
        'labels': ['Projets critiques'],
        'values': [5],
      },
    };

    test('assemble toutes les sections depuis une réponse réelle', () {
      final b = CopilotDashboardBriefing.fromJson(fullJson);
      expect(b.generatedAt, DateTime.parse('2026-08-07T08:00:00.000Z'));
      expect(b.greeting.firstName, 'Khalil');
      expect(b.today.criticalProjects, 5);
      expect(b.crmQuality.score, 96);
      expect(b.riskCards, hasLength(1));
      expect(b.riskCards.first.projectName, 'Villa Sfax');
      expect(b.timeline, hasLength(1));
      expect(b.chart.values, [5]);
    });

    test('recommendationCards réutilise CopilotSuggestion tel quel (même forme {id,label,reason})', () {
      final b = CopilotDashboardBriefing.fromJson(fullJson);
      expect(b.recommendationCards, hasLength(1));
      expect(b.recommendationCards.first.id, 'create_activity');
      expect(b.recommendationCards.first.label, 'Créer une activité');
    });

    test('des sections absentes deviennent des listes vides, jamais une exception', () {
      final b = CopilotDashboardBriefing.fromJson({
        'greeting': {'fullName': 'x'},
        'today': {'criticalProjects': 0, 'expiringQuotes': 0, 'urgentInterventions': null, 'clientsToFollowUp': 0},
        'crmQuality': {'score': 100},
      });
      expect(b.riskCards, isEmpty);
      expect(b.recommendationCards, isEmpty);
      expect(b.timeline, isEmpty);
      expect(b.chart.labels, isEmpty);
      expect(b.generatedAt, isNull);
    });
  });
}
