import 'package:flutter_test/flutter_test.dart';
import 'package:dash_master_toolkit/ai/models/copilot_response.dart';

void main() {
  group('CopilotResponse.fromJson', () {
    test('parses a full, real-shaped envelope (matches responseBuilder.js)', () {
      final json = {
        'conversationId': 'c1',
        'intent': 'projects',
        'mode': 'agent',
        'answer': 'Trois projets sont en retard.',
        'explanation': 'Basé sur les dates limites ingénieur.',
        'explainability': {'stepsUsed': 2},
        'pendingAction': null,
        'citations': [
          {'index': 1, 'title': 'Guide projet', 'sourceType': 'doc', 'path': 'docs/x.md', 'excerpt': 'extrait', 'score': 0.8},
        ],
        'toolCalls': [
          {'tool': 'list_projects', 'input': {'status': 'late'}, 'output': []},
        ],
        'suggestions': [
          {'id': 's1', 'label': 'Créer un rappel', 'reason': 'projet en retard'},
        ],
        'dataQuality': [
          {'projectId': 'p1', 'projectName': 'Sfax', 'warnings': ['champ manquant']},
        ],
        'followUpQuestion': null,
        'agent': 'project_agent',
        'generatedAt': '2026-01-01T10:00:00.000Z',
      };

      final response = CopilotResponse.fromJson(json);

      expect(response.conversationId, 'c1');
      expect(response.intent, 'projects');
      expect(response.mode, 'agent');
      expect(response.answer, 'Trois projets sont en retard.');
      expect(response.explanation, 'Basé sur les dates limites ingénieur.');
      expect(response.citations, hasLength(1));
      expect(response.citations.first.title, 'Guide projet');
      expect(response.toolCalls, hasLength(1));
      expect(response.toolCalls.first.tool, 'list_projects');
      expect(response.suggestions, hasLength(1));
      expect(response.suggestions.first.label, 'Créer un rappel');
      expect(response.dataQuality, hasLength(1));
      expect(response.dataQuality.first.warnings, ['champ manquant']);
      expect(response.agent, 'project_agent');
      expect(response.generatedAt, DateTime.parse('2026-01-01T10:00:00.000Z'));
      expect(response.isError, isFalse);
      expect(response.isClarification, isFalse);
      expect(response.hasPendingAction, isFalse);
    });

    test('mode: "error" — isError true, errorMessage extracted from error.message', () {
      final response = CopilotResponse.fromJson({
        'conversationId': 'c1',
        'mode': 'error',
        'answer': null,
        'error': {'message': "Le rôle n'est pas autorisé."},
      });

      expect(response.isError, isTrue);
      expect(response.errorMessage, "Le rôle n'est pas autorisé.");
      expect(response.answer, isNull);
    });

    test('mode: "clarification" — isClarification true', () {
      final response = CopilotResponse.fromJson({'mode': 'clarification', 'answer': 'Pouvez-vous préciser ?'});
      expect(response.isClarification, isTrue);
    });

    test('a pendingAction with steps sets hasPendingAction', () {
      final response = CopilotResponse.fromJson({
        'mode': 'agent',
        'pendingAction': {
          'id': 'pa1',
          'steps': [
            {'tool': 'create_activity', 'input': {}, 'reason': 'projet en retard'},
          ],
        },
      });

      expect(response.hasPendingAction, isTrue);
      expect(response.pendingAction!.steps.single.tool, 'create_activity');
    });

    test('a pendingAction with an empty steps list does NOT set hasPendingAction', () {
      final response = CopilotResponse.fromJson({
        'mode': 'agent',
        'pendingAction': {'id': 'pa1', 'steps': []},
      });
      expect(response.hasPendingAction, isFalse);
    });

    test('missing optional fields never throw — every list defaults to empty', () {
      final response = CopilotResponse.fromJson({'mode': 'agent'});

      expect(response.citations, isEmpty);
      expect(response.toolCalls, isEmpty);
      expect(response.suggestions, isEmpty);
      expect(response.dataQuality, isEmpty);
      expect(response.pendingAction, isNull);
      expect(response.generatedAt, isNull);
    });

    test('an unparsable generatedAt does not throw, resolves to null', () {
      final response = CopilotResponse.fromJson({'mode': 'agent', 'generatedAt': 'not-a-date'});
      expect(response.generatedAt, isNull);
    });
  });
}
