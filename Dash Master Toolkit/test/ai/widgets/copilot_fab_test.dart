import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/ai/providers/copilot_ui_controller.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_fab.dart';

void main() {
  setUp(() => Get.reset());
  tearDown(() => Get.reset());

  testWidgets('is visible when the panel is closed', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(floatingActionButton: CopilotFab())));
    expect(find.byType(FloatingActionButton), findsOneWidget);
  });

  testWidgets('disappears once CopilotUiController.isOpen becomes true — never two entry points stacked', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(floatingActionButton: CopilotFab())));
    expect(find.byType(FloatingActionButton), findsOneWidget);

    CopilotUiController.to.open();
    await tester.pump();

    expect(find.byType(FloatingActionButton), findsNothing);
  });

  testWidgets('reappears once the panel is closed again', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(floatingActionButton: CopilotFab())));
    CopilotUiController.to.open();
    await tester.pump();
    CopilotUiController.to.close();
    await tester.pump();

    expect(find.byType(FloatingActionButton), findsOneWidget);
  });
}
