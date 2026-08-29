import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:mocktail/mocktail.dart';

import 'package:dash_master_toolkit/ai/models/copilot_message.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_controller.dart';
import 'package:dash_master_toolkit/ai/services/copilot_api_service.dart';
import 'package:dash_master_toolkit/ai/services/copilot_socket_service.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_input_bar.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';

class MockCopilotApiService extends Mock implements CopilotApiService {}

class MockCopilotSocketService extends Mock implements CopilotSocketService {}

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final tempDir = Directory.systemTemp.createTempSync('copilot_input_bar_test');
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

  testWidgets('shows the send button when idle, the stop button while sending', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotInputBar())));

    expect(find.byIcon(Icons.arrow_upward_rounded), findsOneWidget);
    expect(find.byIcon(Icons.stop_rounded), findsNothing);

    CopilotController.to.isSending.value = true;
    await tester.pump();

    expect(find.byIcon(Icons.arrow_upward_rounded), findsNothing);
    expect(find.byIcon(Icons.stop_rounded), findsOneWidget);
  });

  testWidgets('tapping stop calls stopGenerating() and the button reverts to send', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotInputBar())));

    final controller = CopilotController.to;
    controller.messages.add(CopilotMessage.pendingAssistant());
    controller.isSending.value = true;
    await tester.pump();

    await tester.tap(find.byIcon(Icons.stop_rounded));
    await tester.pump();

    expect(controller.isSending.value, isFalse);
    expect(find.byIcon(Icons.arrow_upward_rounded), findsOneWidget);
  });
}
