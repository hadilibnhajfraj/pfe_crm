import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/ai/models/copilot_page_context.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_context_controller.dart';

void main() {
  setUp(() => Get.reset());

  test('starts with no context active', () {
    final controller = CopilotContextController();
    expect(controller.current.value, isNull);
  });

  test('setContext() makes the context the current one', () {
    final controller = CopilotContextController();
    final ctx = CopilotPageContext.dashboard(totalProjects: 10);

    controller.setContext(ctx);

    expect(controller.current.value, same(ctx));
  });

  test('clearContext() with no argument always clears, regardless of what was set', () {
    final controller = CopilotContextController();
    controller.setContext(CopilotPageContext.dashboard(totalProjects: 10));

    controller.clearContext();

    expect(controller.current.value, isNull);
  });

  test('a later setContext() replaces an earlier one', () {
    final controller = CopilotContextController();
    controller.setContext(CopilotPageContext.dashboard(totalProjects: 10));
    final client = CopilotPageContext.client(name: 'Société ABC');

    controller.setContext(client);

    expect(controller.current.value, same(client));
  });

  test(
    'clearContext(owner) is a no-op when a NEWER context has already replaced it '
    '— never lets a slow-closing screen erase a screen that opened after it',
    () {
      final controller = CopilotContextController();
      final projectContext = CopilotPageContext.project(name: 'Villa Sfax');
      controller.setContext(projectContext);

      // L'utilisateur ouvre un second écran (ex. dashboard) AVANT que le
      // premier (projet) n'ait fini de se fermer.
      final dashboardContext = CopilotPageContext.dashboard(totalProjects: 10);
      controller.setContext(dashboardContext);

      // L'écran projet se ferme enfin — son propre `dispose()` tente de
      // nettoyer SON contexte, mais ce n'est plus le contexte actif.
      controller.clearContext(projectContext);

      expect(controller.current.value, same(dashboardContext));
    },
  );

  test('clearContext(owner) clears normally when it IS the active context', () {
    final controller = CopilotContextController();
    final projectContext = CopilotPageContext.project(name: 'Villa Sfax');
    controller.setContext(projectContext);

    controller.clearContext(projectContext);

    expect(controller.current.value, isNull);
  });

  test('CopilotContextController.to returns the SAME singleton across calls', () {
    final a = CopilotContextController.to;
    final b = CopilotContextController.to;
    expect(identical(a, b), isTrue);
  });
}
