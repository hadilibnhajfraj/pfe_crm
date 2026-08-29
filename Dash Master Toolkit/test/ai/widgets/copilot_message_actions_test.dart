import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:mocktail/mocktail.dart';

import 'package:dash_master_toolkit/ai/models/copilot_message.dart';
import 'package:dash_master_toolkit/ai/models/copilot_response.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_controller.dart';
import 'package:dash_master_toolkit/ai/services/copilot_api_service.dart';
import 'package:dash_master_toolkit/ai/services/copilot_socket_service.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_message_actions.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';

class MockCopilotApiService extends Mock implements CopilotApiService {}

class MockCopilotSocketService extends Mock implements CopilotSocketService {}

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final tempDir = Directory.systemTemp.createTempSync('copilot_message_actions_test');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (call) async => tempDir.path,
    );
    const MethodChannel('PonnamKarthik/fluttertoast').setMockMethodCallHandler((call) async => null);
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

  testWidgets('a streaming message shows no actions at all', (tester) async {
    final message = CopilotMessage.pendingAssistant();
    await tester.pumpWidget(_wrap(CopilotMessageActions(message: message, isLastAssistantMessage: true)));

    expect(find.byIcon(Icons.copy_rounded), findsNothing);
    expect(find.byIcon(Icons.refresh_rounded), findsNothing);
  });

  testWidgets('a complete user message shows only Copy, never Regenerate', (tester) async {
    final message = CopilotMessage.user('Bonjour');
    await tester.pumpWidget(_wrap(CopilotMessageActions(message: message, isLastAssistantMessage: false)));

    expect(find.byIcon(Icons.copy_rounded), findsOneWidget);
    expect(find.byIcon(Icons.refresh_rounded), findsNothing);
  });

  testWidgets('the LAST complete assistant message shows Copy AND Regenerate', (tester) async {
    final message = CopilotMessage(id: '1', role: CopilotMessageRole.assistant, text: 'Réponse.', createdAt: DateTime.now(), status: CopilotMessageStatus.complete);
    await tester.pumpWidget(_wrap(CopilotMessageActions(message: message, isLastAssistantMessage: true)));

    expect(find.byIcon(Icons.copy_rounded), findsOneWidget);
    expect(find.byIcon(Icons.refresh_rounded), findsOneWidget);
  });

  testWidgets('an EARLIER (non-last) assistant message shows Copy only, never Regenerate', (tester) async {
    final message = CopilotMessage(id: '1', role: CopilotMessageRole.assistant, text: 'Ancienne réponse.', createdAt: DateTime.now(), status: CopilotMessageStatus.complete);
    await tester.pumpWidget(_wrap(CopilotMessageActions(message: message, isLastAssistantMessage: false)));

    expect(find.byIcon(Icons.copy_rounded), findsOneWidget);
    expect(find.byIcon(Icons.refresh_rounded), findsNothing);
  });

  testWidgets('an errored last assistant message shows Copy only, never Regenerate (avoid regenerating an error verbatim)', (tester) async {
    final message = CopilotMessage.errorPlaceholder('Une erreur est survenue.');
    await tester.pumpWidget(_wrap(CopilotMessageActions(message: message, isLastAssistantMessage: true)));

    expect(find.byIcon(Icons.copy_rounded), findsOneWidget);
    expect(find.byIcon(Icons.refresh_rounded), findsNothing);
  });

  testWidgets('a "reporting" intent assistant message shows the PDF download icon, others never do', (tester) async {
    final reportMessage = CopilotMessage(
      id: '1',
      role: CopilotMessageRole.assistant,
      text: '3 projets en retard.',
      createdAt: DateTime.now(),
      response: CopilotResponse.fromJson({'mode': 'agent', 'intent': 'reporting', 'answer': '3 projets en retard.'}),
    );
    await tester.pumpWidget(_wrap(CopilotMessageActions(message: reportMessage, isLastAssistantMessage: true)));
    expect(find.byIcon(Icons.picture_as_pdf_rounded), findsOneWidget);

    final otherMessage = CopilotMessage(
      id: '2',
      role: CopilotMessageRole.assistant,
      text: '3 projets en retard.',
      createdAt: DateTime.now(),
      response: CopilotResponse.fromJson({'mode': 'agent', 'intent': 'projects', 'answer': '3 projets en retard.'}),
    );
    await tester.pumpWidget(_wrap(CopilotMessageActions(message: otherMessage, isLastAssistantMessage: true)));
    expect(find.byIcon(Icons.picture_as_pdf_rounded), findsNothing);
  });

  testWidgets('a "reporting" intent USER message never shows the PDF icon (download is assistant-only)', (tester) async {
    final message = CopilotMessage.user('Génère-moi un rapport KPI');
    await tester.pumpWidget(_wrap(CopilotMessageActions(message: message, isLastAssistantMessage: false)));
    expect(find.byIcon(Icons.picture_as_pdf_rounded), findsNothing);
  });

  testWidgets('an errored "reporting" message never shows the PDF icon (nothing real to export)', (tester) async {
    final message = CopilotMessage(
      id: '1',
      role: CopilotMessageRole.assistant,
      text: 'Une erreur est survenue.',
      createdAt: DateTime.now(),
      status: CopilotMessageStatus.error,
      response: CopilotResponse.fromJson({'mode': 'error', 'intent': 'reporting'}),
    );
    await tester.pumpWidget(_wrap(CopilotMessageActions(message: message, isLastAssistantMessage: true)));
    expect(find.byIcon(Icons.picture_as_pdf_rounded), findsNothing);
  });

  testWidgets('tapping the PDF icon fetches the report bytes for the tapped message via the controller', (tester) async {
    final api = MockCopilotApiService();
    when(() => api.fetchReportPdfBytes(content: any(named: 'content'))).thenAnswer((_) async => Uint8List.fromList([0x25, 0x50, 0x44, 0x46]));
    final socket = MockCopilotSocketService();
    when(() => socket.isConnected).thenReturn(false);
    Get.reset();
    Get.put<CopilotController>(CopilotController(api: api, socket: socket), permanent: true);

    final message = CopilotMessage(
      id: '1',
      role: CopilotMessageRole.assistant,
      text: '3 projets en retard.',
      createdAt: DateTime.now(),
      response: CopilotResponse.fromJson({'mode': 'agent', 'intent': 'reporting', 'answer': '3 projets en retard.'}),
    );
    await tester.pumpWidget(_wrap(CopilotMessageActions(message: message, isLastAssistantMessage: true)));

    // Jamais pumpAndSettle() ici : pendant l'attente, l'icône est remplacée
    // par un CircularProgressIndicator INDÉTERMINÉ (anime en continu, voir
    // le widget), que pumpAndSettle ne peut jamais considérer "stable" —
    // quelques pump() explicites suffisent à laisser les Future se résoudre.
    // Ce qui se passe APRÈS (Printing.sharePdf — réussite ou
    // MissingPluginException selon la plateforme de test) n'est
    // délibérément pas asserté ici : voir copilot_message_actions.dart,
    // jamais exercé ailleurs dans ce projet (aucun handler de canal
    // `printing` mocké nulle part) — seule la partie testable de manière
    // fiable (le fetch via le contrôleur) est vérifiée.
    await tester.tap(find.byIcon(Icons.picture_as_pdf_rounded));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }

    verify(() => api.fetchReportPdfBytes(content: '3 projets en retard.')).called(1);
  });

  testWidgets('tapping Copy copies the message text to the clipboard', (tester) async {
    final calls = <MethodCall>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      calls.add(call);
      return null;
    });
    addTearDown(() => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));

    final message = CopilotMessage.user('Copie-moi');
    await tester.pumpWidget(_wrap(CopilotMessageActions(message: message, isLastAssistantMessage: false)));
    await tester.tap(find.byIcon(Icons.copy_rounded));
    await tester.pump();

    final setDataCall = calls.firstWhere((c) => c.method == 'Clipboard.setData');
    expect((setDataCall.arguments as Map)['text'], 'Copie-moi');
  });
}
