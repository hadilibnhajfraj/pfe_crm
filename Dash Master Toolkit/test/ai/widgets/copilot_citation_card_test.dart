import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dash_master_toolkit/ai/models/copilot_citation.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_citation_card.dart';

void main() {
  testWidgets('renders the title and excerpt', (tester) async {
    const citation = CopilotCitation(
      index: 1,
      title: 'Guide Copilot',
      sourceType: 'markdown',
      path: 'docs/x.md',
      excerpt: 'Un extrait pertinent.',
      score: 0.9,
    );

    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotCitationCard(citation: citation))));

    expect(find.text('Guide Copilot'), findsOneWidget);
    expect(find.text('Un extrait pertinent.'), findsOneWidget);
  });

  testWidgets('an empty excerpt is simply omitted, never an empty line', (tester) async {
    const citation = CopilotCitation(index: 1, title: 'Guide', sourceType: 'markdown', path: 'x.md', excerpt: '', score: 0.5);
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotCitationCard(citation: citation))));
    expect(find.text('Guide'), findsOneWidget);
  });
}
