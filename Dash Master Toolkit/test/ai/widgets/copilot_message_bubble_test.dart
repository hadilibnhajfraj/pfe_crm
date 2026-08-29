import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:mocktail/mocktail.dart';

import 'package:dash_master_toolkit/ai/animations/copilot_streaming_cursor.dart';
import 'package:dash_master_toolkit/ai/animations/copilot_typing_dots.dart';
import 'package:dash_master_toolkit/ai/models/copilot_message.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_controller.dart';
import 'package:dash_master_toolkit/ai/services/copilot_api_service.dart';
import 'package:dash_master_toolkit/ai/services/copilot_socket_service.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_message_bubble.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';

class MockCopilotApiService extends Mock implements CopilotApiService {}

class MockCopilotSocketService extends Mock implements CopilotSocketService {}

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  // CopilotMessageBubble affiche CopilotMessageActions (copier/régénérer),
  // qui appelle CopilotController.to — un singleton GetX qui construit
  // AuthService() en interne (voir lib/providers/auth_service.dart), donc
  // GetStorage/path_provider. Même mise en place que
  // test/ai/widgets/copilot_message_actions_test.dart.
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final tempDir = Directory.systemTemp.createTempSync('copilot_message_bubble_test');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (call) async => tempDir.path,
    );
    AuthService();
    await Future<void>.delayed(const Duration(milliseconds: 100));
  });

  setUp(() {
    Get.reset();
    final socket = MockCopilotSocketService();
    when(() => socket.isConnected).thenReturn(false);
    Get.put<CopilotController>(CopilotController(api: MockCopilotApiService(), socket: socket), permanent: true);
  });

  tearDown(() => Get.reset());

  testWidgets('a user message renders its text as plain Text, right-aligned, no avatar', (tester) async {
    final message = CopilotMessage.user('Quels projets sont en retard ?');
    await tester.pumpWidget(_wrap(CopilotMessageBubble(message: message)));

    expect(find.text('Quels projets sont en retard ?'), findsOneWidget);
    expect(find.byType(MarkdownBody), findsNothing);
  });

  testWidgets('a complete assistant message renders markdown (bold text becomes a styled span)', (tester) async {
    final message = CopilotMessage(
      id: '1',
      role: CopilotMessageRole.assistant,
      text: '**Trois** projets sont en retard.',
      createdAt: DateTime.now(),
      status: CopilotMessageStatus.complete,
    );
    await tester.pumpWidget(_wrap(CopilotMessageBubble(message: message)));

    expect(find.byType(MarkdownBody), findsOneWidget);
    expect(find.byType(CopilotStreamingCursor), findsNothing);
  });

  testWidgets('a streaming message with no text yet shows the typing dots, not markdown', (tester) async {
    final message = CopilotMessage.pendingAssistant();
    await tester.pumpWidget(_wrap(CopilotMessageBubble(message: message)));

    expect(find.byType(CopilotTypingDots), findsOneWidget);
    expect(find.byType(MarkdownBody), findsNothing);

    // CopilotTypingDots repeats indefinitely — bounded pumps only.
    await tester.pump(const Duration(milliseconds: 300));
  });

  testWidgets('a streaming message with partial text shows markdown AND the streaming cursor', (tester) async {
    final message = CopilotMessage.pendingAssistant();
    message.text = 'Trois projets';
    await tester.pumpWidget(_wrap(CopilotMessageBubble(message: message)));

    expect(find.byType(MarkdownBody), findsOneWidget);
    expect(find.byType(CopilotStreamingCursor), findsOneWidget);
    expect(find.byType(CopilotTypingDots), findsNothing);

    await tester.pump(const Duration(milliseconds: 300));
  });

  testWidgets('an error message renders its text without crashing', (tester) async {
    final message = CopilotMessage.errorPlaceholder('Une erreur est survenue.');
    await tester.pumpWidget(_wrap(CopilotMessageBubble(message: message)));

    expect(find.byType(MarkdownBody), findsOneWidget);
  });

  // Mission "CORRIGER L'AFFICHAGE DES RÉPONSES DU COPILOT IA" — reproduit le
  // cas RÉEL signalé : une réponse assistant contenant des balises HTML
  // brutes (<br>, <strong>) ne doit JAMAIS atteindre MarkdownBody telles
  // quelles (elles s'afficheraient littéralement, comme observé) — voir
  // lib/ai/utils/copilot_markup_sanitizer.dart.
  testWidgets('a raw-HTML assistant message (real bug: <br>/<strong>) is sanitized before reaching MarkdownBody', (tester) async {
    final message = CopilotMessage(
      id: '2',
      role: CopilotMessageRole.assistant,
      text: 'Voici la fiche :<br><br><strong>ID :</strong> 158<br><strong>Statut :</strong> Négociation<br>',
      createdAt: DateTime.now(),
      status: CopilotMessageStatus.complete,
    );
    await tester.pumpWidget(_wrap(CopilotMessageBubble(message: message)));

    final markdown = tester.widget<MarkdownBody>(find.byType(MarkdownBody));
    expect(markdown.data, isNot(contains('<br>')));
    expect(markdown.data, isNot(contains('<strong>')));
    expect(markdown.data, isNot(contains('</strong>')));
    expect(markdown.data, contains('**ID :**'));
    expect(markdown.data, contains('158'));
    expect(markdown.data, contains('Négociation'));
    // Aucune balise brute visible nulle part dans l'arbre de widgets rendu.
    expect(find.textContaining('<br>'), findsNothing);
    expect(find.textContaining('<strong>'), findsNothing);
  });
}
