import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:mocktail/mocktail.dart';

import 'package:dash_master_toolkit/ai/models/proactive_alert.dart';
import 'package:dash_master_toolkit/ai/providers/proactive_alerts_controller.dart';
import 'package:dash_master_toolkit/ai/services/copilot_api_service.dart';
import 'package:dash_master_toolkit/ai/services/copilot_socket_service.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_proactive_alert_card.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';

class MockCopilotApiService extends Mock implements CopilotApiService {}

class MockCopilotSocketService extends Mock implements CopilotSocketService {}

ProactiveAlert alertWithWorkflow() {
  return ProactiveAlert.fromJson({
    'domain': 'projects',
    'subject': 'Projet "Villa Sfax" — priorité critique',
    'severity': 'critique',
    'explanation': 'Relance en retard de 12 jour(s).',
    'suggestion': 'Programmer une relance.',
    'suggestedActions': ['Créer un rappel'],
    'workflow': {'id': 'w1', 'label': 'Créer un rappel', 'reason': 'x', 'status': 'pending_confirmation'},
  });
}

ProactiveAlert alertWithoutWorkflow() {
  return ProactiveAlert.fromJson({
    'domain': 'hr',
    'subject': 'Alerte — hr',
    'severity': 'alerte',
    'explanation': 'Trop de demandes RH en attente.',
    'suggestion': 'Revue manuelle nécessaire.',
  });
}

Widget wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final tempDir = Directory.systemTemp.createTempSync('copilot_proactive_alert_card_test');
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
    const MethodChannel('PonnamKarthik/fluttertoast').setMockMethodCallHandler((call) async => null);
    api = MockCopilotApiService();
    final socket = MockCopilotSocketService();
    when(() => socket.ensureConnected()).thenReturn(null);
    when(() => socket.onProactiveAlert(any())).thenAnswer((_) {});
    Get.put<ProactiveAlertsController>(ProactiveAlertsController(api: api, socket: socket));
  });

  tearDown(() {
    Get.reset();
    const MethodChannel('PonnamKarthik/fluttertoast').setMockMethodCallHandler(null);
  });

  testWidgets('renders subject, severity, explanation and suggestion', (tester) async {
    final alert = alertWithWorkflow();
    await tester.pumpWidget(wrap(CopilotProactiveAlertCard(alert: alert, isDark: false)));

    expect(find.text('Projet "Villa Sfax" — priorité critique'), findsOneWidget);
    expect(find.text('Critique'), findsOneWidget);
    expect(find.text('Relance en retard de 12 jour(s).'), findsOneWidget);
    expect(find.text('Programmer une relance.'), findsOneWidget);
  });

  testWidgets('shows Confirm/Reject buttons when a workflow is proposed, never a "Fermer" button', (tester) async {
    final alert = alertWithWorkflow();
    await tester.pumpWidget(wrap(CopilotProactiveAlertCard(alert: alert, isDark: false)));

    expect(find.text('Confirmer : Créer un rappel'), findsOneWidget);
    expect(find.text('Écarter'), findsOneWidget);
    expect(find.text('Fermer'), findsNothing);
  });

  testWidgets('shows only a "Fermer" button when there is no workflow — never a fabricated Confirm button', (tester) async {
    final alert = alertWithoutWorkflow();
    await tester.pumpWidget(wrap(CopilotProactiveAlertCard(alert: alert, isDark: false)));

    expect(find.text('Fermer'), findsOneWidget);
    expect(find.textContaining('Confirmer'), findsNothing);
    expect(find.text('Écarter'), findsNothing);
  });

  testWidgets('tapping Confirmer calls the API exactly once and removes the alert from the controller', (tester) async {
    when(() => api.confirmProactiveWorkflow('w1')).thenAnswer((_) async {});
    final alert = alertWithWorkflow();
    ProactiveAlertsController.to.alerts.add(alert);

    await tester.pumpWidget(wrap(CopilotProactiveAlertCard(alert: alert, isDark: false)));
    await tester.tap(find.text('Confirmer : Créer un rappel'));
    await tester.pump();
    await tester.pump();

    verify(() => api.confirmProactiveWorkflow('w1')).called(1);
    expect(ProactiveAlertsController.to.alerts, isEmpty);
  });

  testWidgets('tapping Écarter calls reject, never confirm', (tester) async {
    when(() => api.rejectProactiveWorkflow('w1')).thenAnswer((_) async {});
    final alert = alertWithWorkflow();
    ProactiveAlertsController.to.alerts.add(alert);

    await tester.pumpWidget(wrap(CopilotProactiveAlertCard(alert: alert, isDark: false)));
    await tester.tap(find.text('Écarter'));
    await tester.pump();
    await tester.pump();

    verify(() => api.rejectProactiveWorkflow('w1')).called(1);
    verifyNever(() => api.confirmProactiveWorkflow(any()));
  });

  testWidgets('the Confirmer button shows a spinner and disables both buttons while the call is in flight', (tester) async {
    final completer = Completer<void>();
    when(() => api.confirmProactiveWorkflow('w1')).thenAnswer((_) => completer.future);
    final alert = alertWithWorkflow();
    ProactiveAlertsController.to.alerts.add(alert);

    await tester.pumpWidget(wrap(CopilotProactiveAlertCard(alert: alert, isDark: false)));
    await tester.tap(find.text('Confirmer : Créer un rappel'));
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    final rejectButton = tester.widget<OutlinedButton>(find.byType(OutlinedButton));
    expect(rejectButton.onPressed, isNull);

    completer.complete();
    await tester.pump();
    await tester.pump();
  });
}
