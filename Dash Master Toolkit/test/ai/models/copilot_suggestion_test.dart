import 'package:flutter_test/flutter_test.dart';
import 'package:dash_master_toolkit/ai/models/copilot_suggestion.dart';

void main() {
  test('parses a real suggestion shape', () {
    final s = CopilotSuggestion.fromJson({'id': 's1', 'label': 'Créer un rappel', 'reason': 'projet en retard'});
    expect(s.id, 's1');
    expect(s.label, 'Créer un rappel');
    expect(s.reason, 'projet en retard');
  });

  test('missing label falls back to "Suggestion"', () {
    final s = CopilotSuggestion.fromJson({});
    expect(s.label, 'Suggestion');
  });
}
