import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dash_master_toolkit/ai/models/copilot_dashboard_briefing.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_timeline_view.dart';

void main() {
  testWidgets('groups items by bucket, in Aujourd\'hui/Cette semaine/Plus tard order', (tester) async {
    const items = [
      CopilotTimelineItem(type: 'quote', bucket: 'later', label: 'Devis lointain'),
      CopilotTimelineItem(type: 'project', bucket: 'today', label: 'Projet critique : Villa Sfax'),
      CopilotTimelineItem(type: 'relance', bucket: 'week', label: 'Relancer un client'),
    ];
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotTimelineView(items: items, isDark: false))));

    expect(find.text("Aujourd'hui"), findsOneWidget);
    expect(find.text('Cette semaine'), findsOneWidget);
    expect(find.text('Plus tard'), findsOneWidget);
    expect(find.text('Projet critique : Villa Sfax'), findsOneWidget);
    expect(find.text('Relancer un client'), findsOneWidget);
    expect(find.text('Devis lointain'), findsOneWidget);

    // "Aujourd'hui" doit apparaître avant "Plus tard" dans l'arbre de widgets.
    final todayPos = tester.getTopLeft(find.text("Aujourd'hui")).dy;
    final laterPos = tester.getTopLeft(find.text('Plus tard')).dy;
    expect(todayPos, lessThan(laterPos));
  });

  testWidgets('shows a neutral empty message when there is nothing upcoming', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotTimelineView(items: [], isDark: false))));
    expect(find.text('Aucune échéance à venir.'), findsOneWidget);
  });
}
