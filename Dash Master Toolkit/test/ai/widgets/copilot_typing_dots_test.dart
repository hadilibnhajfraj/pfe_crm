import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dash_master_toolkit/ai/animations/copilot_typing_dots.dart';

void main() {
  testWidgets('renders exactly 3 dots and animates without throwing (repeating animation — never pumpAndSettle)', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotTypingDots())));

    final containers = find.descendant(
      of: find.byType(CopilotTypingDots),
      matching: find.byWidgetPredicate((w) => w is Container && w.decoration is BoxDecoration && (w.decoration as BoxDecoration).shape == BoxShape.circle),
    );
    expect(containers, findsNWidgets(3));

    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));
  });
}
