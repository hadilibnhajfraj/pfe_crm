// lib/ai/providers/proactive_alerts_controller.dart
//
// Proactive AI — "Le Copilot ne doit plus attendre une question. Il doit
// surveiller." État des alertes reçues en direct via l'événement WebSocket
// `proactive-ai-alert` (voir CopilotSocketService.onProactiveAlert et
// Backend Master/src/ai/proactive/PROACTIVE_AI.md) — jamais une action
// exécutée automatiquement : `confirmWorkflow`/`rejectWorkflow` sont les
// SEULS chemins qui font quoi que ce soit de réel, et uniquement sur tap
// explicite de l'utilisateur.
import 'package:flutter/foundation.dart';
import 'package:fluttertoast/fluttertoast.dart';
import 'package:get/get.dart';

import '../models/proactive_alert.dart';
import '../services/copilot_api_service.dart';
import '../services/copilot_socket_service.dart';

class ProactiveAlertsController extends GetxController {
  static ProactiveAlertsController get to {
    if (!Get.isRegistered<ProactiveAlertsController>()) {
      Get.put(ProactiveAlertsController(), permanent: true);
    }
    return Get.find<ProactiveAlertsController>();
  }

  /// `api`/`socket` par défaut restent les vrais singletons — seam de test
  /// (voir test/ai/providers/proactive_alerts_controller_test.dart), même
  /// pattern que CopilotController(api:, socket:).
  ProactiveAlertsController({
    @visibleForTesting CopilotApiService? api,
    @visibleForTesting CopilotSocketService? socket,
  })  : _api = api ?? CopilotApiService.instance,
        _socket = socket ?? CopilotSocketService.instance;

  final CopilotApiService _api;
  final CopilotSocketService _socket;

  /// Les plus récentes en premier — voir _onAlertReceived().
  final alerts = <ProactiveAlert>[].obs;

  /// workflowId des workflows en cours de confirmation/rejet — permet à
  /// l'UI de désactiver les boutons pendant l'appel réseau, jamais un
  /// double-tap qui enverrait deux confirmations pour le même workflow.
  final processingWorkflowIds = <String>{}.obs;

  bool _socketWired = false;

  @override
  void onInit() {
    super.onInit();
    _wireSocket();
  }

  void _wireSocket() {
    if (_socketWired) return;
    _socketWired = true;
    _socket.ensureConnected();
    _socket.onProactiveAlert(_onAlertReceived);
  }

  void _onAlertReceived(ProactiveAlert alert) {
    alerts.insert(0, alert);
  }

  bool isProcessing(ProactiveWorkflow workflow) => processingWorkflowIds.contains(workflow.id);

  /// Exécute RÉELLEMENT le workflow proposé — jamais appelé automatiquement,
  /// uniquement sur tap explicite (voir CopilotWorkflowConfirmationCard).
  Future<void> confirmWorkflow(ProactiveAlert alert) async {
    final workflow = alert.workflow;
    if (workflow == null || processingWorkflowIds.contains(workflow.id)) return;

    processingWorkflowIds.add(workflow.id);
    try {
      await _api.confirmProactiveWorkflow(workflow.id);
      alerts.remove(alert);
      Fluttertoast.showToast(msg: '"${workflow.label}" exécuté.');
    } catch (e) {
      Fluttertoast.showToast(msg: "Impossible d'exécuter ce workflow. Réessayez.");
    } finally {
      processingWorkflowIds.remove(workflow.id);
    }
  }

  /// Écarte le workflow SANS jamais l'exécuter.
  Future<void> rejectWorkflow(ProactiveAlert alert) async {
    final workflow = alert.workflow;
    if (workflow == null || processingWorkflowIds.contains(workflow.id)) return;

    processingWorkflowIds.add(workflow.id);
    try {
      await _api.rejectProactiveWorkflow(workflow.id);
      alerts.remove(alert);
    } catch (e) {
      Fluttertoast.showToast(msg: "Impossible d'écarter ce workflow. Réessayez.");
    } finally {
      processingWorkflowIds.remove(workflow.id);
    }
  }

  /// Ignore une alerte qui n'a pas de workflow (rien à confirmer/rejeter
  /// côté serveur) — un simple retrait local.
  void dismiss(ProactiveAlert alert) => alerts.remove(alert);
}
