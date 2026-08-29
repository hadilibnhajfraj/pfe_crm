import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dash_master_toolkit/ai/models/copilot_dashboard_briefing.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_risk_card.dart';

void main() {
  testWidgets('renders project name, priority label and the real topReason', (tester) async {
    const card = CopilotRiskCard(projectId: 'p1', projectName: 'Villa Sfax', score: 24, priority: 'critique', topReason: 'Relance en retard de 12 jour(s)');
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotRiskCardWidget(card: card, isDark: false))));

    expect(find.text('Villa Sfax'), findsOneWidget);
    expect(find.text('Critique'), findsOneWidget);
    expect(find.text('Relance en retard de 12 jour(s)'), findsOneWidget);
  });

  testWidgets('renders without a reason line when topReason is null', (tester) async {
    const card = CopilotRiskCard(projectId: 'p1', projectName: 'Villa Sfax', score: 0, priority: 'faible');
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotRiskCardWidget(card: card, isDark: false))));

    expect(find.text('Villa Sfax'), findsOneWidget);
    expect(find.text('Faible'), findsOneWidget);
  });

  test('copilotPriorityColor/copilotPriorityLabel cover all 4 real priority bands', () {
    expect(copilotPriorityLabel('critique'), 'Critique');
    expect(copilotPriorityLabel('elevee'), 'Élevée');
    expect(copilotPriorityLabel('moyenne'), 'Moyenne');
    expect(copilotPriorityLabel('faible'), 'Faible');
    expect(copilotPriorityColor('critique'), isNot(copilotPriorityColor('faible')));
  });
}
