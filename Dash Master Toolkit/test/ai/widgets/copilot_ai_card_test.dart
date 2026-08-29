import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dash_master_toolkit/ai/widgets/copilot_ai_card.dart';

void main() {
  testWidgets('renders the icon, value and label', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: CopilotAiCard(isDark: false, icon: Icons.warning_amber_rounded, label: 'Projets critiques', value: '5'),
      ),
    ));

    expect(find.text('5'), findsOneWidget);
    expect(find.text('Projets critiques'), findsOneWidget);
    expect(find.byIcon(Icons.warning_amber_rounded), findsOneWidget);
  });

  testWidgets('a tap fires onTap when provided', (tester) async {
    var tapped = false;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: CopilotAiCard(isDark: false, icon: Icons.warning_amber_rounded, label: 'x', value: '1', onTap: () => tapped = true),
      ),
    ));

    await tester.tap(find.byType(CopilotAiCard));
    expect(tapped, isTrue);
  });
}
