import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_ui_controller.dart';

void main() {
  setUp(() {
    Get.reset();
  });

  test('starts closed, on the dashboard tab (AI Dashboard shown automatically on first open)', () {
    final ui = CopilotUiController();
    expect(ui.isOpen.value, isFalse);
    expect(ui.activeTab.value, CopilotPanelTab.dashboard);
  });

  test('open()/close()/toggle() drive isOpen', () {
    final ui = CopilotUiController();
    ui.open();
    expect(ui.isOpen.value, isTrue);
    ui.close();
    expect(ui.isOpen.value, isFalse);
    ui.toggle();
    expect(ui.isOpen.value, isTrue);
    ui.toggle();
    expect(ui.isOpen.value, isFalse);
  });

  test('setOpen() mirrors an external source of truth (Scaffold.onEndDrawerChanged)', () {
    final ui = CopilotUiController();
    ui.setOpen(true);
    expect(ui.isOpen.value, isTrue);
    ui.setOpen(false);
    expect(ui.isOpen.value, isFalse);
  });

  test('showDashboard()/showChat()/showHistory() drive activeTab independently of isOpen', () {
    final ui = CopilotUiController();
    ui.showHistory();
    expect(ui.activeTab.value, CopilotPanelTab.history);
    ui.showChat();
    expect(ui.activeTab.value, CopilotPanelTab.chat);
    ui.showDashboard();
    expect(ui.activeTab.value, CopilotPanelTab.dashboard);
  });

  test('CopilotUiController.to returns the SAME singleton across calls', () {
    final a = CopilotUiController.to;
    final b = CopilotUiController.to;
    expect(identical(a, b), isTrue);
  });
}
