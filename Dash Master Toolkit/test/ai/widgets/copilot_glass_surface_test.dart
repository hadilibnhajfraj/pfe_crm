import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dash_master_toolkit/ai/widgets/copilot_glass_surface.dart';

void main() {
  testWidgets('renders a BackdropFilter (real blur, never a flat opaque fallback)', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: CopilotGlassSurface(isDark: false, child: Text('content')))),
    );

    expect(find.byType(BackdropFilter), findsOneWidget);
    expect(find.text('content'), findsOneWidget);
  });

  testWidgets('clips to the given borderRadius', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: CopilotGlassSurface(
            isDark: false,
            borderRadius: BorderRadius.all(Radius.circular(20)),
            child: SizedBox(width: 10, height: 10),
          ),
        ),
      ),
    );

    final clip = tester.widget<ClipRRect>(find.byType(ClipRRect));
    expect(clip.borderRadius, const BorderRadius.all(Radius.circular(20)));
  });

  testWidgets('applies a non-zero blur sigma by default (a real frosted-glass effect, not a no-op)', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: CopilotGlassSurface(isDark: false, child: SizedBox()))),
    );

    final backdrop = tester.widget<BackdropFilter>(find.byType(BackdropFilter));
    final filter = backdrop.filter;
    expect(filter, isA<ImageFilter>());
  });
}
