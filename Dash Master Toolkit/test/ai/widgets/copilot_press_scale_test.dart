import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dash_master_toolkit/ai/widgets/copilot_press_scale.dart';

void main() {
  testWidgets('scales down while pressed, back to 1.0 on release', (tester) async {
    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: CopilotPressScale(scale: 0.9, onTap: () {}, child: const Icon(Icons.star)))),
    );

    AnimatedScale scaleWidget() => tester.widget<AnimatedScale>(find.byType(AnimatedScale));
    expect(scaleWidget().scale, 1.0);

    final gesture = await tester.startGesture(tester.getCenter(find.byType(CopilotPressScale)));
    await tester.pump();
    expect(scaleWidget().scale, 0.9);

    await gesture.up();
    await tester.pump();
    expect(scaleWidget().scale, 1.0);
  });

  testWidgets('a tap fires onTap exactly once', (tester) async {
    var taps = 0;
    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: CopilotPressScale(onTap: () => taps++, child: const Icon(Icons.star)))),
    );

    await tester.tap(find.byType(CopilotPressScale));
    expect(taps, 1);
  });

  testWidgets('never scales when the system "reduce motion" preference is set', (tester) async {
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(disableAnimations: true),
        child: MaterialApp(home: Scaffold(body: CopilotPressScale(scale: 0.9, onTap: () {}, child: const Icon(Icons.star)))),
      ),
    );

    final gesture = await tester.startGesture(tester.getCenter(find.byType(CopilotPressScale)));
    await tester.pump();

    final scaleWidget = tester.widget<AnimatedScale>(find.byType(AnimatedScale));
    expect(scaleWidget.scale, 1.0);

    await gesture.up();
  });

  testWidgets('a cancelled gesture (drag away) also resets the scale', (tester) async {
    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: CopilotPressScale(scale: 0.9, onTap: () {}, child: const Icon(Icons.star)))),
    );

    final gesture = await tester.startGesture(tester.getCenter(find.byType(CopilotPressScale)));
    await tester.pump();
    await gesture.cancel();
    await tester.pump();

    final scaleWidget = tester.widget<AnimatedScale>(find.byType(AnimatedScale));
    expect(scaleWidget.scale, 1.0);
  });
}
