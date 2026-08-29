// lib/ai/providers/copilot_context_controller.dart
//
// L'état "où se trouve l'utilisateur en ce moment" — un seul contexte actif
// à la fois (le dernier écran compatible Context Awareness affiché), lu
// automatiquement par CopilotController à chaque envoi (voir
// CopilotController._runAssistantTurn) — jamais à un widget d'écran de le
// transmettre lui-même à un message. Écrans compatibles : voir les
// factories de CopilotPageContext (project/client/dashboard/industrial).
import 'package:get/get.dart';

import '../models/copilot_page_context.dart';

class CopilotContextController extends GetxController {
  static CopilotContextController get to {
    if (!Get.isRegistered<CopilotContextController>()) {
      Get.put(CopilotContextController(), permanent: true);
    }
    return Get.find<CopilotContextController>();
  }

  final Rxn<CopilotPageContext> current = Rxn<CopilotPageContext>();

  void setContext(CopilotPageContext context) => current.value = context;

  /// À appeler dans `dispose()` de l'écran qui a appelé `setContext` —
  /// jamais laissé actif après que l'utilisateur ait quitté l'écran (sinon
  /// le Copilot continuerait de "voir" une fiche que l'utilisateur ne
  /// regarde plus). Ignore un clear qui ne correspond pas au contexte actif
  /// (ex. l'écran B s'est déjà ouvert et a remplacé le contexte avant que
  /// l'écran A ne se ferme) pour ne jamais effacer par erreur le contexte
  /// d'un écran plus récent.
  void clearContext([CopilotPageContext? owner]) {
    if (owner != null && !identical(current.value, owner)) return;
    current.value = null;
  }
}
