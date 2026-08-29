// lib/ai/providers/copilot_dashboard_controller.dart
//
// État de chargement du briefing "AI Dashboard" (GET /ai-copilot/dashboard)
// — séparé de CopilotController (qui gère la conversation) exactement comme
// CopilotUiController est séparé pour l'état purement visuel : charger le
// dashboard ne doit jamais interférer avec une conversation en cours, et
// vice-versa.
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';

import '../models/copilot_dashboard_briefing.dart';
import '../services/copilot_api_service.dart';

class CopilotDashboardController extends GetxController {
  static CopilotDashboardController get to {
    if (!Get.isRegistered<CopilotDashboardController>()) {
      Get.put(CopilotDashboardController(), permanent: true);
    }
    return Get.find<CopilotDashboardController>();
  }

  /// `api` par défaut reste le vrai singleton — seam de test (voir
  /// test/ai/providers/copilot_dashboard_controller_test.dart), même pattern
  /// que CopilotController(api:).
  CopilotDashboardController({@visibleForTesting CopilotApiService? api}) : _api = api ?? CopilotApiService.instance;

  final CopilotApiService _api;

  final Rxn<CopilotDashboardBriefing> briefing = Rxn<CopilotDashboardBriefing>();
  final isLoading = false.obs;
  final RxnString error = RxnString();

  bool _loadedOnce = false;

  /// Idempotent par défaut : un deuxième appel pendant que le premier est
  /// déjà en vol, ou après un premier chargement réussi, ne relance rien —
  /// voir `force: true` pour un rechargement explicite (pull-to-refresh).
  Future<void> load({bool force = false}) async {
    if (isLoading.value) return;
    if (_loadedOnce && !force) return;

    isLoading.value = true;
    error.value = null;
    try {
      briefing.value = await _api.getDashboardBriefing();
      _loadedOnce = true;
    } catch (e) {
      error.value = _friendlyError(e);
    } finally {
      isLoading.value = false;
    }
  }

  // Même discipline que CopilotController._friendlyError : jamais le
  // message d'erreur brut affiché à l'utilisateur.
  String _friendlyError(Object e) {
    final type = e.runtimeType.toString();
    if (type == 'CopilotNotConfiguredException') return "Le Copilot IA n'est pas encore configuré côté serveur.";
    if (type == 'CopilotForbiddenException') return "Votre rôle n'a pas accès au Copilot IA.";
    return 'Impossible de charger le tableau de bord. Réessayez.';
  }
}
