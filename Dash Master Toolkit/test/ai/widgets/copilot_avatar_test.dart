import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dash_master_toolkit/ai/widgets/copilot_avatar.dart';
import 'package:dash_master_toolkit/ai/animations/copilot_pulse_glow.dart';

void main() {
  testWidgets('renders the gradient orb icon', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotAvatar())));
    expect(find.byIcon(Icons.auto_awesome_rounded), findsOneWidget);
  });

  testWidgets('thinking: false never mounts the pulse glow', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotAvatar(thinking: false))));
    expect(find.byType(CopilotPulseGlow), findsNothing);
  });

  testWidgets('thinking: true mounts the pulse glow (repeating animation — pump a bounded duration, never pumpAndSettle)', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotAvatar(thinking: true))));
    expect(find.byType(CopilotPulseGlow), findsOneWidget);
    // CopilotPulseGlow repeats indefinitely (..repeat(reverse: true)) —
    // pumpAndSettle would hang forever waiting for it to stop animating.
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(milliseconds: 500));
  });
}
