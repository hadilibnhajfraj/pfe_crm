// lib/ai/services/copilot_socket_service.dart
//
// Couche WebSocket vers le canal `ai-copilot:*` (voir
// Backend Master/src/modules/ai-copilot/AI_COPILOT_HTTP.md pour le contrat
// exact d'événements). Réutilise le MÊME SocketService.instance singleton
// que tout le reste de l'app (notifications, demandes d'archivage/RH/
// maintenance, voir lib/providers/archive_request_provider.dart) — jamais
// une seconde connexion Socket.IO ouverte pour le Copilot seul.
import 'package:dash_master_toolkit/services/socket_service.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'package:dash_master_toolkit/core/config/api_config.dart';

import '../models/copilot_response.dart';
import '../models/proactive_alert.dart';

class CopilotSocketService {
  CopilotSocketService._();
  static final CopilotSocketService instance = CopilotSocketService._();

  final SocketService _socket = SocketService.instance;

  bool get isConnected => _socket.isConnected;

  /// `SocketService.connect()` est déjà un no-op si une connexion existe
  /// (voir socket_service.dart) — sûr d'appeler à chaque ouverture du
  /// Copilot, jamais une seconde connexion ouverte par erreur.
  void ensureConnected() {
    final token = AuthService().accessToken;
    if (token == null || token.isEmpty) return;
    _socket.connect(ApiConfig.wsBaseUrl, token);
  }

  void onTyping(void Function(String? conversationId) handler) {
    _socket.on('ai-copilot:typing', (data) {
      final conversationId = (data is Map) ? data['conversationId']?.toString() : null;
      handler(conversationId);
    });
  }

  void onChunk(void Function(String? conversationId, String text) handler) {
    _socket.on('ai-copilot:chunk', (data) {
      if (data is! Map) return;
      handler(data['conversationId']?.toString(), (data['text'] ?? '').toString());
    });
  }

  void onComplete(void Function(CopilotResponse response) handler) {
    _socket.on('ai-copilot:complete', (data) {
      if (data is! Map) return;
      handler(CopilotResponse.fromJson(Map<String, dynamic>.from(data)));
    });
  }

  void onError(void Function(String message) handler) {
    _socket.on('ai-copilot:error', (data) {
      final message = (data is Map ? data['message'] : null)?.toString() ?? 'Une erreur est survenue.';
      handler(message);
    });
  }

  void send({required String message, String? conversationId, Map<String, dynamic>? pageContext, List<String>? documentIds}) {
    _socket.emit('ai-copilot:send', {
      'message': message,
      if (conversationId != null) 'conversationId': conversationId,
      if (pageContext != null) 'pageContext': pageContext,
      if (documentIds != null && documentIds.isNotEmpty) 'documentIds': documentIds,
    });
  }

  /// Proactive AI — `proactive-ai-alert` est DÉLIBÉRÉMENT hors du namespace
  /// `ai-copilot:*` (voir AI_COPILOT_HTTP.md) : ce n'est jamais une réponse
  /// à un message envoyé par ce client, seul le cron backend l'émet. Aucune
  /// requête de ce client ne le déclenche — un pur push, à tout moment,
  /// même panneau Copilot fermé (le listener reste actif tant que
  /// `ProactiveAlertsController` est enregistré).
  void onProactiveAlert(void Function(ProactiveAlert alert) handler) {
    _socket.on('proactive-ai-alert', (data) {
      if (data is! Map) return;
      handler(ProactiveAlert.fromJson(Map<String, dynamic>.from(data)));
    });
  }

  /// À appeler dans `onClose()` du controller — retire uniquement les
  /// écouteurs listés ici, jamais ceux des autres providers qui partagent
  /// le même SocketService (archivage/RH/maintenance).
  void detach() {
    _socket.off('ai-copilot:typing');
    _socket.off('ai-copilot:chunk');
    _socket.off('ai-copilot:complete');
    _socket.off('ai-copilot:error');
    _socket.off('proactive-ai-alert');
  }
}
