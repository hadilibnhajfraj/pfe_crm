import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:mocktail/mocktail.dart';

import 'package:dash_master_toolkit/ai/models/copilot_dashboard_briefing.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_dashboard_controller.dart';
import 'package:dash_master_toolkit/ai/screens/copilot_dashboard_view.dart';
import 'package:dash_master_toolkit/ai/services/copilot_api_service.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'package:dash_master_toolkit/theme/theme_controller.dart';

class MockCopilotApiService extends Mock implements CopilotApiService {}

CopilotDashboardBriefing _fullBriefing() {
  return CopilotDashboardBriefing.fromJson({
    'greeting': {'firstName': 'Khalil', 'fullName': 'Khalil Ben Ali'},
    'today': {'criticalProjects': 5, 'expiringQuotes': 3, 'urgentInterventions': 2, 'clientsToFollowUp': 4},
    'crmQuality': {'score': 96},
    'riskCards': [
      {'projectId': 'p1', 'projectName': 'Villa Sfax', 'score': 24, 'priority': 'critique', 'topReason': 'Relance en retard de 12 jour(s)'},
    ],
    'recommendationCards': [
      {'id': 'create_activity', 'label': 'Créer une activité', 'reason': 'x'},
    ],
    'timeline': [
      {'type': 'project', 'bucket': 'today', 'label': 'Projet critique : Villa Sfax'},
    ],
    'chart': {
      'labels': ['Projets critiques', 'Devis expirants', 'Interventions urgentes', 'Clients à relancer'],
      'values': [5, 3, 2, 4],
    },
  });
}

void main() {
  // CopilotDashboardView embarque CopilotNotificationsCard, qui exige
  // ThemeController + construit NotificationController (donc AuthService,
  // GetStorage/path_provider) — même mise en place que
  // copilot_notifications_card_test.dart.
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final tempDir = Directory.systemTemp.createTempSync('copilot_dashboard_view_test');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (call) async => tempDir.path,
    );
    AuthService();
    await Future<void>.delayed(const Duration(milliseconds: 100));
  });

  setUp(() {
    Get.reset();
    Get.put(ThemeController(), permanent: true);
  });

  tearDown(() => Get.reset());

  // Le contenu du Dashboard AI dépasse largement les 600px de hauteur du
  // viewport de test par défaut — ListView(children:) n'inflate QUE les
  // enfants visibles/mis en cache (SliverList paresseux, même sans
  // `.builder`), donc les sections en bas de page (Recommandations, Aperçu,
  // Échéances, Notifications) ne seraient jamais construites par les tests
  // sans agrandir la surface. Un problème d'environnement de test, pas du
  // widget lui-même (un vrai utilisateur les voit en scrollant).
  void growViewport(WidgetTester tester) {
    tester.view.physicalSize = const Size(800, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  }

  testWidgets('shows a spinner while loading, then the full briefing once loaded', (tester) async {
    growViewport(tester);
    final api = MockCopilotApiService();
    final completer = Completer<CopilotDashboardBriefing>();
    when(() => api.getDashboardBriefing()).thenAnswer((_) => completer.future);
    final controller = CopilotDashboardController(api: api);

    await tester.pumpWidget(MaterialApp(home: Scaffold(body: CopilotDashboardView(controller: controller))));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    completer.complete(_fullBriefing());
    await tester.pumpAndSettle();

    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.textContaining('Bonjour Khalil'), findsOneWidget);
    expect(find.text('Villa Sfax'), findsWidgets); // risk card project name (+ possibly in timeline)
    expect(find.text('Créer une activité'), findsOneWidget);
    // La section "Notifications" du Dashboard AI ET le titre affiché dans
    // CopilotNotificationsCard portent tous les deux ce libellé.
    expect(find.text('Notifications'), findsNWidgets(2));
  });

  testWidgets('shows a neutral greeting (no fabricated name) when firstName is unknown', (tester) async {
    growViewport(tester);
    final api = MockCopilotApiService();
    when(() => api.getDashboardBriefing()).thenAnswer((_) async => CopilotDashboardBriefing.fromJson({
          'greeting': {'fullName': 'khalil@cbi.tn'},
          'today': {'criticalProjects': 0, 'expiringQuotes': 0, 'urgentInterventions': null, 'clientsToFollowUp': 0},
          'crmQuality': {'score': 100},
        }));
    final controller = CopilotDashboardController(api: api);

    await tester.pumpWidget(MaterialApp(home: Scaffold(body: CopilotDashboardView(controller: controller))));
    await tester.pumpAndSettle();

    expect(find.text('Bonjour 👋'), findsOneWidget);
    expect(find.text('—'), findsOneWidget); // urgentInterventions null → "—", jamais "0"
  });

  testWidgets('shows a retry button on error, which reloads on tap', (tester) async {
    final api = MockCopilotApiService();
    when(() => api.getDashboardBriefing()).thenThrow(Exception('network down'));
    final controller = CopilotDashboardController(api: api);

    await tester.pumpWidget(MaterialApp(home: Scaffold(body: CopilotDashboardView(controller: controller))));
    await tester.pumpAndSettle();

    expect(find.text('Réessayer'), findsOneWidget);

    when(() => api.getDashboardBriefing()).thenAnswer((_) async => _fullBriefing());
    await tester.tap(find.text('Réessayer'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Bonjour Khalil'), findsOneWidget);
  });
}
