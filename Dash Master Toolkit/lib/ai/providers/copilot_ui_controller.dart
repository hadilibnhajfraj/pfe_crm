// lib/ai/providers/copilot_ui_controller.dart
//
// État PUREMENT visuel du Copilot (jamais de logique métier ici, voir
// CopilotController pour ça) : le panneau est-il ouvert, quel onglet est
// affiché (dashboard IA / conversation active / historique). Séparé de
// CopilotController pour que basculer d'onglet ne redéclenche jamais un
// rechargement de la conversation active.
import 'package:get/get.dart';

enum CopilotPanelTab { dashboard, chat, history }

class CopilotUiController extends GetxController {
  static CopilotUiController get to {
    if (!Get.isRegistered<CopilotUiController>()) {
      Get.put(CopilotUiController(), permanent: true);
    }
    return Get.find<CopilotUiController>();
  }

  final isOpen = false.obs;

  // AI Dashboard — "Le Copilot doit afficher automatiquement" (Bonjour
  // {prénom}, compteurs du jour, qualité CRM...) : c'est donc l'onglet
  // affiché par défaut à la toute première ouverture du panneau dans la
  // session, jamais l'onglet chat vide — voir copilot_dashboard_view.dart.
  final activeTab = CopilotPanelTab.dashboard.obs;

  void open() => isOpen.value = true;
  void close() => isOpen.value = false;
  void toggle() => isOpen.value = !isOpen.value;
  void setOpen(bool value) => isOpen.value = value;

  void showDashboard() => activeTab.value = CopilotPanelTab.dashboard;
  void showChat() => activeTab.value = CopilotPanelTab.chat;
  void showHistory() => activeTab.value = CopilotPanelTab.history;
}
