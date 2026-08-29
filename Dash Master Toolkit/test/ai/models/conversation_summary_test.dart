import 'package:flutter_test/flutter_test.dart';
import 'package:dash_master_toolkit/ai/models/conversation_summary.dart';

void main() {
  test('parses a real conversation index entry (conversationIndex.service.js shape)', () {
    final s = ConversationSummary.fromJson({
      'conversationId': 'c1',
      'updatedAt': '2026-01-01T10:00:00.000Z',
      'preview': 'Trois projets sont en retard.',
      'intent': 'projects',
    });

    expect(s.conversationId, 'c1');
    expect(s.updatedAt, DateTime.parse('2026-01-01T10:00:00.000Z'));
    expect(s.preview, 'Trois projets sont en retard.');
    expect(s.intent, 'projects');
  });

  test('an unparsable updatedAt falls back to "now" rather than throwing', () {
    final before = DateTime.now();
    final s = ConversationSummary.fromJson({'conversationId': 'c1', 'updatedAt': 'garbage'});
    final after = DateTime.now();

    expect(s.updatedAt.isAfter(before.subtract(const Duration(seconds: 1))), isTrue);
    expect(s.updatedAt.isBefore(after.add(const Duration(seconds: 1))), isTrue);
  });
}
