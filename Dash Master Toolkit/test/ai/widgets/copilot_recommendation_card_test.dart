import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:mocktail/mocktail.dart';

import 'package:dash_master_toolkit/ai/models/copilot_suggestion.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_controller.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_ui_controller.dart';
import 'package:dash_master_toolkit/ai/services/copilot_api_service.dart';
import 'package:dash_master_toolkit/ai/services/copilot_socket_service.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_recommendation_card.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';

class MockCopilotApiService extends Mock implements CopilotApiService {}

class MockCopilotSocketService extends Mock implements CopilotSocketService {}

const _suggestion = CopilotSuggestion(id: 'create_activity', label: 'Créer une activité', reason: 'Relance en retard de 12 jour(s)');

void main() {
  // Un tap appelle CopilotController.to.sendSuggestion() — même mise en
  // place que copilot_message_bubble_test.dart/copilot_input_bar_test.dart
  // (CopilotController() construit AuthService() en interne).
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final tempDir = Directory.systemTemp.createTempSync('copilot_recommendation_card_test');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (call) async => tempDir.path,
    );
    AuthService();
    await Future<void>.delayed(const Duration(milliseconds: 100));
  });

  late MockCopilotApiService api;

  setUp(() {
    Get.reset();
    api = MockCopilotApiService();
    when(() => api.sendMessage(message: any(named: 'message'), conversationId: any(named: 'conversationId'), cancelToken: any(named: 'cancelToken'), pageContext: any(named: 'pageContext')))
        .thenAnswer((_) async => throw UnimplementedError());
    final socket = MockCopilotSocketService();
    when(() => socket.isConnected).thenReturn(false);
    Get.put<CopilotController>(CopilotController(api: api, socket: socket), permanent: true);
    Get.put<CopilotUiController>(CopilotUiController(), permanent: true);
  });

  tearDown(() => Get.reset());

  testWidgets('renders the label and the real reason', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotRecommendationCardWidget(suggestion: _suggestion, isDark: false))));

    expect(find.text('Créer une activité'), findsOneWidget);
    expect(find.text('Relance en retard de 12 jour(s)'), findsOneWidget);
  });

  testWidgets('a tap sends the suggestion as a message and switches to the chat tab', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotRecommendationCardWidget(suggestion: _suggestion, isDark: false))));

    await tester.tap(find.byType(CopilotRecommendationCardWidget));
    await tester.pump();

    expect(CopilotUiController.to.activeTab.value, CopilotPanelTab.chat);
    expect(CopilotController.to.messages, isNotEmpty);
    expect(CopilotController.to.messages.first.text, 'Créer une activité');
  });
}
