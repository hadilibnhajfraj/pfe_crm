import 'package:flutter_test/flutter_test.dart';
import 'package:dash_master_toolkit/ai/models/copilot_citation.dart';

void main() {
  test('parses a real citation shape', () {
    final citation = CopilotCitation.fromJson({
      'index': 1,
      'title': 'Guide Copilot',
      'sourceType': 'markdown',
      'path': 'docs/user-guide/06-utiliser-le-copilot-ia.md',
      'excerpt': 'Le Copilot classe chaque message...',
      'score': 0.92,
    });

    expect(citation.index, 1);
    expect(citation.title, 'Guide Copilot');
    expect(citation.sourceType, 'markdown');
    expect(citation.score, 0.92);
  });

  test('missing title falls back to "Source", never an empty title', () {
    final citation = CopilotCitation.fromJson({});
    expect(citation.title, 'Source');
    expect(citation.index, 0);
    expect(citation.score, 0.0);
  });

  test('a numeric-string score/index is still parsed', () {
    final citation = CopilotCitation.fromJson({'index': '3', 'score': '0.5'});
    expect(citation.index, 3);
    expect(citation.score, 0.5);
  });
}
