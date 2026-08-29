import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/app_shell_route/components/topbar/NotificationController.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_notifications_card.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'package:dash_master_toolkit/theme/theme_controller.dart';

void main() {
  // NotificationController lit AuthService().accessToken (donc GetStorage/
  // path_provider) et exige déjà ThemeController enregistré (champ non
  // tardif). Sans jeton (aucun signin réel dans un test),
  // fetchNotifications() se contente d'un retour immédiat (token vide) —
  // jamais un vrai appel réseau ici.
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final tempDir = Directory.systemTemp.createTempSync('copilot_notifications_card_test');
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

  testWidgets('renders the "Notifications" label and an empty state without a token', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotNotificationsCard(isDark: false))));
    await tester.pump();

    expect(find.text('Notifications'), findsOneWidget);
    expect(find.text('Aucune notification.'), findsOneWidget);
    expect(Get.isRegistered<NotificationController>(), isTrue);
  });

  testWidgets('renders nothing when ThemeController is not registered (never crashes the dashboard)', (tester) async {
    Get.reset();
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotNotificationsCard(isDark: false))));

    expect(find.text('Notifications'), findsNothing);
    expect(find.byType(SizedBox), findsWidgets);
  });
}
