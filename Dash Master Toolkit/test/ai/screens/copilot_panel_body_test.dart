import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:mocktail/mocktail.dart';

import 'package:dash_master_toolkit/ai/models/copilot_dashboard_briefing.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_context_controller.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_controller.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_dashboard_controller.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_ui_controller.dart';
import 'package:dash_master_toolkit/ai/providers/proactive_alerts_controller.dart';
import 'package:dash_master_toolkit/ai/screens/copilot_panel_body.dart';
import 'package:dash_master_toolkit/ai/services/copilot_api_service.dart';
import 'package:dash_master_toolkit/ai/services/copilot_socket_service.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'package:dash_master_toolkit/theme/theme_controller.dart';

class MockCopilotApiService extends Mock implements CopilotApiService {}

class MockCopilotSocketService extends Mock implements CopilotSocketService {}

CopilotDashboardBriefing _briefing() {
  return CopilotDashboardBriefing.fromJson({
    'greeting': {'firstName': 'Khalil', 'fullName': 'Khalil Ben Ali'},
    'today': {'criticalProjects': 0, 'expiringQuotes': 0, 'urgentInterventions': 0, 'clientsToFollowUp': 0},
    'crmQuality': {'score': 100},
  });
}

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final tempDir = Directory.systemTemp.createTempSync('copilot_panel_body_test');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (call) async => tempDir.path,
    );
    AuthService();
    await Future<void>.delayed(const Duration(milliseconds: 100));
  });

  late MockCopilotApiService dashboardApi;

  setUp(() {
    Get.reset();
    Get.put(ThemeController(), permanent: true);

    final chatApi = MockCopilotApiService();
    final chatSocket = MockCopilotSocketService();
    when(() => chatSocket.isConnected).thenReturn(false);
    Get.put<CopilotController>(CopilotController(api: chatApi, socket: chatSocket), permanent: true);
    Get.put<CopilotUiController>(CopilotUiController(), permanent: true);
    Get.put<CopilotContextController>(CopilotContextController(), permanent: true);

    final proactiveApi = MockCopilotApiService();
    final proactiveSocket = MockCopilotSocketService();
    when(() => proactiveSocket.ensureConnected()).thenReturn(null);
    when(() => proactiveSocket.onProactiveAlert(any())).thenAnswer((_) {});
    Get.put<ProactiveAlertsController>(ProactiveAlertsController(api: proactiveApi, socket: proactiveSocket), permanent: true);

    // Pré-enregistré AVANT que CopilotDashboardView() ne résolve
    // CopilotDashboardController.to en interne — préempte la construction
    // du VRAI singleton (qui utiliserait CopilotApiService.instance, un
    // vrai Dio) par cette instance mockée.
    dashboardApi = MockCopilotApiService();
    when(() => dashboardApi.getDashboardBriefing()).thenAnswer((_) async => _briefing());
    Get.put<CopilotDashboardController>(CopilotDashboardController(api: dashboardApi), permanent: true);
  });

  tearDown(() => Get.reset());

  Widget wrap() => const MaterialApp(home: Scaffold(body: CopilotPanelBody()));

  testWidgets('opens on the Dashboard tab by default, with a visible greeting', (tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();
    await tester.pump();

    expect(find.textContaining('Bonjour Khalil'), findsOneWidget);
  });

  testWidgets('switching to History does not touch the real CopilotHistoryController singleton eagerly on Dashboard-only sessions', (tester) async {
    // Si CopilotConversationHistoryList était construit dès l'ouverture du
    // panneau (IndexedStack "eager"), CopilotHistoryController.to.load()
    // (aucun seam de test, voir sa propre doc) tenterait un vrai appel
    // réseau ici. Ce test réussit précisément PARCE QUE ça n'arrive pas —
    // voir _TabbedBody, "construit chaque onglet une seule fois, à sa
    // PREMIÈRE visite".
    await tester.pumpWidget(wrap());
    await tester.pump();
    await tester.pump();

    expect(find.textContaining('Bonjour Khalil'), findsOneWidget);
    expect(tester.takeException(), isNull); // aucune exception non gérée (aurait signalé un vrai appel réseau non mocké)
  });

  testWidgets('switching tabs via the header buttons updates the active tab', (tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();
    await tester.pump();

    await tester.tap(find.byTooltip('Conversation'));
    await tester.pump();

    expect(CopilotUiController.to.activeTab.value, CopilotPanelTab.chat);
    expect(find.byType(TextField), findsOneWidget); // la barre de saisie n'apparaît qu'en onglet chat
  });

  testWidgets('the input bar only appears in the chat tab', (tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();
    await tester.pump();

    expect(find.byType(TextField), findsNothing); // onglet Dashboard par défaut

    await tester.tap(find.byTooltip('Conversation'));
    await tester.pump();
    expect(find.byType(TextField), findsOneWidget);

    await tester.tap(find.byTooltip('Dashboard'));
    await tester.pump();
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('re-visiting the Dashboard tab after switching away does not refetch the briefing (state preserved, not rebuilt from scratch)', (tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();
    await tester.pump();
    expect(find.textContaining('Bonjour Khalil'), findsOneWidget);

    await tester.tap(find.byTooltip('Conversation'));
    await tester.pump();
    expect(find.textContaining('Bonjour Khalil'), findsNothing); // masqué (IndexedStack), pas détruit

    await tester.tap(find.byTooltip('Dashboard'));
    await tester.pump();
    expect(find.textContaining('Bonjour Khalil'), findsOneWidget); // réapparaît instantanément, sans rechargement

    verify(() => dashboardApi.getDashboardBriefing()).called(1); // jamais un second appel réseau au retour sur l'onglet
  });
}
