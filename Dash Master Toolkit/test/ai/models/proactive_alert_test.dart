import 'package:flutter_test/flutter_test.dart';

import 'package:dash_master_toolkit/ai/models/proactive_alert.dart';

void main() {
  group('ProactiveWorkflow', () {
    test('parses id/label/reason/status', () {
      final w = ProactiveWorkflow.fromJson({'id': 'w1', 'label': 'Créer un rappel', 'reason': 'x', 'status': 'pending_confirmation'});
      expect(w.id, 'w1');
      expect(w.label, 'Créer un rappel');
      expect(w.reason, 'x');
      expect(w.status, 'pending_confirmation');
    });
  });

  group('ProactiveAlert — reflète 1:1 le payload proactive-ai-alert du backend', () {
    test('parses toutes les sections depuis un payload réel (avec workflow)', () {
      final alert = ProactiveAlert.fromJson({
        'domain': 'projects',
        'subject': 'Projet "Villa Sfax" — priorité critique',
        'severity': 'critique',
        'analysis': {'score': 24, 'priority': 'critique'},
        'explanation': 'Relance en retard de 12 jour(s).',
        'suggestion': 'Programmer une relance.',
        'suggestedActions': ['Créer un rappel'],
        'workflow': {'id': 'w1', 'label': 'Créer un rappel', 'reason': 'x', 'status': 'pending_confirmation'},
        'context': {'projectId': 'p1'},
      });

      expect(alert.domain, 'projects');
      expect(alert.severity, 'critique');
      expect(alert.analysis['score'], 24);
      expect(alert.explanation, 'Relance en retard de 12 jour(s).');
      expect(alert.suggestion, 'Programmer une relance.');
      expect(alert.suggestedActions, ['Créer un rappel']);
      expect(alert.workflow?.id, 'w1');
      expect(alert.workflow?.label, 'Créer un rappel');
      expect(alert.context['projectId'], 'p1');
    });

    test('parses un alert de domaine Dashboard IA (sans workflow, jamais un bouton Confirmer fabriqué)', () {
      final alert = ProactiveAlert.fromJson({
        'domain': 'hr',
        'subject': 'Alerte — hr',
        'severity': 'alerte',
        'analysis': {'type': 'x', 'metric': null, 'value': null, 'category': 'alerts'},
        'explanation': 'Trop de demandes RH en attente.',
        'suggestion': 'Revue manuelle nécessaire.',
        'suggestedActions': [],
        'workflow': null,
        'context': {},
      });

      expect(alert.domain, 'hr');
      expect(alert.workflow, isNull);
      expect(alert.suggestedActions, isEmpty);
    });

    test('des champs absents deviennent des valeurs vides, jamais une exception', () {
      final alert = ProactiveAlert.fromJson({});
      expect(alert.domain, '');
      expect(alert.explanation, '');
      expect(alert.suggestedActions, isEmpty);
      expect(alert.analysis, isEmpty);
      expect(alert.context, isEmpty);
      expect(alert.workflow, isNull);
    });

    test('receivedAt est renseigné automatiquement (jamais envoyé par le backend)', () {
      final before = DateTime.now().subtract(const Duration(seconds: 1));
      final alert = ProactiveAlert.fromJson({'domain': 'sales', 'subject': 'x', 'severity': 'alerte', 'explanation': 'x', 'suggestion': 'x'});
      expect(alert.receivedAt.isAfter(before), isTrue);
    });
  });
}
