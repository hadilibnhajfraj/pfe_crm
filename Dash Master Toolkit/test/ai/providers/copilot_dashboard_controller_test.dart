import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:mocktail/mocktail.dart';

import 'package:dash_master_toolkit/ai/models/copilot_dashboard_briefing.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_dashboard_controller.dart';
import 'package:dash_master_toolkit/ai/services/copilot_api_service.dart';

class MockCopilotApiService extends Mock implements CopilotApiService {}

CopilotDashboardBriefing _briefing() {
  return CopilotDashboardBriefing.fromJson({
    'greeting': {'firstName': 'Khalil', 'fullName': 'Khalil Ben Ali'},
    'today': {'criticalProjects': 5, 'expiringQuotes': 3, 'urgentInterventions': 2, 'clientsToFollowUp': 4},
    'crmQuality': {'score': 96},
  });
}

void main() {
  setUp(() => Get.reset());
  tearDown(() => Get.reset());

  test('load() fetches the briefing and exposes it', () async {
    final api = MockCopilotApiService();
    when(() => api.getDashboardBriefing()).thenAnswer((_) async => _briefing());
    final controller = CopilotDashboardController(api: api);

    await controller.load();

    expect(controller.briefing.value?.greeting.firstName, 'Khalil');
    expect(controller.isLoading.value, isFalse);
    expect(controller.error.value, isNull);
    verify(() => api.getDashboardBriefing()).called(1);
  });

  test('a second load() call is a no-op once the briefing already loaded (idempotent by default)', () async {
    final api = MockCopilotApiService();
    when(() => api.getDashboardBriefing()).thenAnswer((_) async => _briefing());
    final controller = CopilotDashboardController(api: api);

    await controller.load();
    await controller.load();

    verify(() => api.getDashboardBriefing()).called(1);
  });

  test('load(force: true) always refetches, even after a successful load', () async {
    final api = MockCopilotApiService();
    when(() => api.getDashboardBriefing()).thenAnswer((_) async => _briefing());
    final controller = CopilotDashboardController(api: api);

    await controller.load();
    await controller.load(force: true);

    verify(() => api.getDashboardBriefing()).called(2);
  });

  test('a failure sets a friendly error message, never the raw exception text', () async {
    final api = MockCopilotApiService();
    when(() => api.getDashboardBriefing()).thenThrow(Exception('ECONNREFUSED 10.0.0.1:3000'));
    final controller = CopilotDashboardController(api: api);

    await controller.load();

    expect(controller.briefing.value, isNull);
    expect(controller.error.value, isNotNull);
    expect(controller.error.value, isNot(contains('ECONNREFUSED')));
  });

  test('CopilotNotConfiguredException maps to a safe "not configured" message', () async {
    final api = MockCopilotApiService();
    when(() => api.getDashboardBriefing()).thenThrow(const CopilotNotConfiguredException('no llm provider'));
    final controller = CopilotDashboardController(api: api);

    await controller.load();

    expect(controller.error.value, contains('configuré'));
  });

  test('after a failed load, load(force: true) can recover on a subsequent success', () async {
    final api = MockCopilotApiService();
    when(() => api.getDashboardBriefing()).thenThrow(Exception('boom'));
    final controller = CopilotDashboardController(api: api);
    await controller.load();
    expect(controller.error.value, isNotNull);

    when(() => api.getDashboardBriefing()).thenAnswer((_) async => _briefing());
    await controller.load(force: true);

    expect(controller.error.value, isNull);
    expect(controller.briefing.value, isNotNull);
  });

  test('CopilotDashboardController.to returns the SAME singleton across calls', () {
    final a = CopilotDashboardController.to;
    final b = CopilotDashboardController.to;
    expect(identical(a, b), isTrue);
  });
}
