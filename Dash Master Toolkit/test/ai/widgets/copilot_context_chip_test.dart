import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/ai/models/copilot_page_context.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_context_controller.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_context_chip.dart';

void main() {
  setUp(() => Get.reset());
  tearDown(() => Get.reset());

  testWidgets('renders nothing when no context is active', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotContextChip(isDark: false))));
    expect(find.byType(SizedBox), findsOneWidget);
    expect(find.byIcon(Icons.my_location_rounded), findsNothing);
  });

  testWidgets('shows the active context label once set', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotContextChip(isDark: false))));

    CopilotContextController.to.setContext(CopilotPageContext.project(name: 'Villa Sfax'));
    await tester.pump();

    expect(find.text('Villa Sfax'), findsOneWidget);
    expect(find.byIcon(Icons.my_location_rounded), findsOneWidget);
  });

  testWidgets('disappears again once the context is cleared', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotContextChip(isDark: false))));
    CopilotContextController.to.setContext(CopilotPageContext.project(name: 'Villa Sfax'));
    await tester.pump();

    CopilotContextController.to.clearContext();
    await tester.pump();

    expect(find.text('Villa Sfax'), findsNothing);
  });
}
