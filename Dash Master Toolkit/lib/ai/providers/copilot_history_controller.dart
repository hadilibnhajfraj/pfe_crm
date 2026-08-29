// lib/ai/providers/copilot_history_controller.dart
//
// Liste des conversations passées (GET /ai-copilot/conversations) — état
// séparé de CopilotController (la conversation ACTIVE) pour que l'onglet
// "Historique" puisse charger/rafraîchir indépendamment sans perturber une
// conversation en cours.
import 'package:get/get.dart';

import '../models/conversation_summary.dart';
import '../services/copilot_api_service.dart';

class CopilotHistoryController extends GetxController {
  static CopilotHistoryController get to {
    if (!Get.isRegistered<CopilotHistoryController>()) {
      Get.put(CopilotHistoryController());
    }
    return Get.find<CopilotHistoryController>();
  }

  final _api = CopilotApiService.instance;

  final conversations = <ConversationSummary>[].obs;
  final loading = false.obs;
  final error = RxnString();

  Future<void> load() async {
    loading.value = true;
    error.value = null;
    try {
      conversations.value = await _api.listConversations();
    } catch (e) {
      error.value = 'Impossible de charger l\'historique des conversations.';
    } finally {
      loading.value = false;
    }
  }
}
