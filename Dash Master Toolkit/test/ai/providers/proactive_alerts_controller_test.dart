import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:mocktail/mocktail.dart';

import 'package:dash_master_toolkit/ai/models/proactive_alert.dart';
import 'package:dash_master_toolkit/ai/providers/proactive_alerts_controller.dart';
import 'package:dash_master_toolkit/ai/services/copilot_api_service.dart';
import 'package:dash_master_toolkit/ai/services/copilot_socket_service.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';

class MockCopilotApiService extends Mock implements CopilotApiService {}

class MockCopilotSocketService extends Mock implements CopilotSocketService {}

ProactiveAlert alertWithWorkflow({String workflowId = 'w1'}) {
  return ProactiveAlert.fromJson({
    'domain': 'projects',
    'subject': 'Projet "Villa Sfax" — priorité critique',
    'severity': 'critique',
    'explanation': 'Relance en retard.',
    'suggestion': 'Programmer une relance.',
    'suggestedActions': ['Créer un rappel'],
    'workflow': {'id': workflowId, 'label': 'Créer un rappel', 'reason': 'x', 'status': 'pending_confirmation'},
  });
}

ProactiveAlert alertWithoutWorkflow() {
  return ProactiveAlert.fromJson({'domain': 'hr', 'subject': 'Alerte — hr', 'severity': 'alerte', 'explanation': 'x', 'suggestion': 'x'});
}

void main() {
  // confirmWorkflow()/rejectWorkflow() déclenchent un Fluttertoast — jamais
  // attendu (fire-and-forget), mais sans handler mocké ici l'appel de canal
  // seul suffirait à faire remonter une MissingPluginException, même mise
  // en place que test/ai/providers/copilot_controller_test.dart. Le dernier
  // test (`.to`) construit le VRAI singleton (api/socket réels) — donc
  // CopilotSocketService.ensureConnected() touche AuthService()/GetStorage/
  // path_provider, même mise en place que copilot_controller_test.dart.
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final tempDir = Directory.systemTemp.createTempSync('proactive_alerts_controller_test');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (call) async => tempDir.path,
    );
    AuthService();
    await Future<void>.delayed(const Duration(milliseconds: 100));
  });

  setUp(() {
    Get.reset();
    const MethodChannel('PonnamKarthik/fluttertoast').setMockMethodCallHandler((call) async => null);
  });

  tearDown(() {
    Get.reset();
    const MethodChannel('PonnamKarthik/fluttertoast').setMockMethodCallHandler(null);
  });

  late MockCopilotApiService api;
  late MockCopilotSocketService socket;
  late void Function(ProactiveAlert) capturedHandler;

  ProactiveAlertsController build() {
    api = MockCopilotApiService();
    socket = MockCopilotSocketService();
    when(() => socket.ensureConnected()).thenReturn(null);
    when(() => socket.onProactiveAlert(any())).thenAnswer((invocation) {
      capturedHandler = invocation.positionalArguments[0] as void Function(ProactiveAlert);
    });
    // Get.put() (pas une construction nue) : onInit() — qui câble le
    // listener — n'est déclenché par GetX qu'à l'enregistrement, même
    // pattern que Get.put<CopilotController>(...) dans
    // copilot_controller_test.dart.
    return Get.put<ProactiveAlertsController>(ProactiveAlertsController(api: api, socket: socket));
  }

  test('onInit() wires the proactive-ai-alert listener exactly once', () {
    build();
    verify(() => socket.onProactiveAlert(any())).called(1);
    verify(() => socket.ensureConnected()).called(1);
  });

  test('a received alert is inserted at the front of alerts (newest first)', () {
    final controller = build();
    capturedHandler(alertWithoutWorkflow());
    final second = ProactiveAlert.fromJson({'domain': 'kpi', 'subject': 'x', 'severity': 'anomalie', 'explanation': 'x', 'suggestion': 'x'});
    capturedHandler(second);

    expect(controller.alerts, hasLength(2));
    expect(controller.alerts.first.domain, 'kpi');
  });

  test('dismiss() removes an alert locally without any API call', () {
    final controller = build();
    final alert = alertWithoutWorkflow();
    capturedHandler(alert);

    controller.dismiss(alert);

    expect(controller.alerts, isEmpty);
    verifyZeroInteractions(api);
  });

  group('confirmWorkflow', () {
    test('calls the API with the workflow id, removes the alert, and clears processing state', () async {
      final controller = build();
      when(() => api.confirmProactiveWorkflow('w1')).thenAnswer((_) async {});
      final alert = alertWithWorkflow();
      capturedHandler(alert);

      await controller.confirmWorkflow(alert);

      verify(() => api.confirmProactiveWorkflow('w1')).called(1);
      expect(controller.alerts, isEmpty);
      expect(controller.processingWorkflowIds, isEmpty);
    });

    test('marks the workflow as processing while the call is in flight', () async {
      final completer = Completer<void>();
      final controller = build();
      when(() => api.confirmProactiveWorkflow('w1')).thenAnswer((_) => completer.future);
      final alert = alertWithWorkflow();
      capturedHandler(alert);

      final future = controller.confirmWorkflow(alert);
      expect(controller.isProcessing(alert.workflow!), isTrue);

      completer.complete();
      await future;
      expect(controller.isProcessing(alert.workflow!), isFalse);
    });

    test('a failed confirmation keeps the alert (never silently removed) and clears processing state', () async {
      final controller = build();
      when(() => api.confirmProactiveWorkflow('w1')).thenThrow(Exception('network error'));
      final alert = alertWithWorkflow();
      capturedHandler(alert);

      await controller.confirmWorkflow(alert);

      expect(controller.alerts, contains(alert));
      expect(controller.processingWorkflowIds, isEmpty);
    });

    test('a no-op when the alert has no workflow — never calls the API', () async {
      final controller = build();
      final alert = alertWithoutWorkflow();
      capturedHandler(alert);

      await controller.confirmWorkflow(alert);

      verifyZeroInteractions(api);
      expect(controller.alerts, contains(alert));
    });
  });

  group('rejectWorkflow', () {
    test('calls the API and removes the alert, never executing anything', () async {
      final controller = build();
      when(() => api.rejectProactiveWorkflow('w1')).thenAnswer((_) async {});
      final alert = alertWithWorkflow();
      capturedHandler(alert);

      await controller.rejectWorkflow(alert);

      verify(() => api.rejectProactiveWorkflow('w1')).called(1);
      verifyNever(() => api.confirmProactiveWorkflow(any()));
      expect(controller.alerts, isEmpty);
    });
  });

  test('ProactiveAlertsController.to returns the SAME singleton across calls', () {
    final a = ProactiveAlertsController.to;
    final b = ProactiveAlertsController.to;
    expect(identical(a, b), isTrue);
  });
}
