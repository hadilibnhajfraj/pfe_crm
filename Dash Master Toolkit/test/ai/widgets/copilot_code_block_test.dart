import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_highlight/flutter_highlight.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dash_master_toolkit/ai/widgets/copilot_code_block.dart';

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  group('CopilotCodeBlock', () {
    testWidgets('renders the language label and a highlighted code view', (tester) async {
      await tester.pumpWidget(_wrap(const CopilotCodeBlock(code: 'final x = 1;', language: 'dart', isDark: false)));

      expect(find.text('dart'), findsOneWidget);
      expect(find.byType(HighlightView), findsOneWidget);
    });

    testWidgets('an unspecified language shows "texte" and still renders', (tester) async {
      await tester.pumpWidget(_wrap(const CopilotCodeBlock(code: 'plain output', language: null, isDark: false)));

      expect(find.text('texte'), findsOneWidget);
      expect(find.byType(HighlightView), findsOneWidget);
    });

    testWidgets('tapping "Copier" copies the raw code to the clipboard', (tester) async {
      final calls = <MethodCall>[];
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
        calls.add(call);
        return null;
      });
      const MethodChannel('PonnamKarthik/fluttertoast').setMockMethodCallHandler((call) async => null);
      addTearDown(() {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null);
        const MethodChannel('PonnamKarthik/fluttertoast').setMockMethodCallHandler(null);
      });

      await tester.pumpWidget(_wrap(const CopilotCodeBlock(code: 'print("hi");', language: 'dart', isDark: true)));
      await tester.tap(find.text('Copier'));
      await tester.pump();

      final setDataCall = calls.firstWhere((c) => c.method == 'Clipboard.setData');
      expect((setDataCall.arguments as Map)['text'], 'print("hi");');
    });
  });

  group('CopilotCodeBlockBuilder — via MarkdownBody', () {
    testWidgets('a fenced code block in markdown renders as CopilotCodeBlock with the fence language', (tester) async {
      const markdown = '```dart\nfinal x = 1;\n```';
      await tester.pumpWidget(
        _wrap(MarkdownBody(data: markdown, builders: {'pre': CopilotCodeBlockBuilder(isDark: false)})),
      );

      expect(find.byType(CopilotCodeBlock), findsOneWidget);
      final block = tester.widget<CopilotCodeBlock>(find.byType(CopilotCodeBlock));
      expect(block.language, 'dart');
      expect(block.code, 'final x = 1;');
    });

    testWidgets('a fenced code block with no language still renders, with a null language', (tester) async {
      const markdown = '```\nplain\n```';
      await tester.pumpWidget(
        _wrap(MarkdownBody(data: markdown, builders: {'pre': CopilotCodeBlockBuilder(isDark: false)})),
      );

      final block = tester.widget<CopilotCodeBlock>(find.byType(CopilotCodeBlock));
      expect(block.language, isNull);
      expect(block.code, 'plain');
    });
  });
}
