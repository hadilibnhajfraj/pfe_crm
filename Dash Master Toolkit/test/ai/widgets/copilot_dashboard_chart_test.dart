import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dash_master_toolkit/ai/models/copilot_dashboard_briefing.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_dashboard_chart.dart';
import 'package:fl_chart/fl_chart.dart';

void main() {
  testWidgets('renders a BarChart when at least one value is non-zero', (tester) async {
    const chart = CopilotChartData(labels: ['Projets critiques', 'Devis expirants'], values: [5, 3]);
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotDashboardChart(chart: chart, isDark: false))));

    expect(find.byType(BarChart), findsOneWidget);
  });

  testWidgets('renders nothing when every value is 0 (never an empty/broken chart)', (tester) async {
    const chart = CopilotChartData(labels: ['Projets critiques'], values: [0]);
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotDashboardChart(chart: chart, isDark: false))));

    expect(find.byType(BarChart), findsNothing);
    expect(find.byType(SizedBox), findsWidgets);
  });

  testWidgets('renders nothing when values is empty', (tester) async {
    const chart = CopilotChartData(labels: [], values: []);
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotDashboardChart(chart: chart, isDark: false))));

    expect(find.byType(BarChart), findsNothing);
  });
}
