// lib/ai/providers/copilot_controller.dart
//
// L'état vivant d'UNE conversation avec le Copilot — messages, streaming,
// indicateur de frappe, copier/régénérer/stop, pièces jointes
// (architecture), automatisations en attente de confirmation. Pattern GetX
// dominant de ce projet (GetxController + .obs + Get.put/Get.find), voir
// lib/providers/archive_request_provider.dart pour le même pattern déjà en
// place. Préfère le WebSocket quand connecté (typing + révélation en
// chunks) et retombe sur POST /ai-copilot/chat sinon (réponse d'un coup,
// jamais bloqué si le socket est indisponible).
import 'dart:typed_data';

import 'package:dio/dio.dart' show CancelToken, DioException, DioExceptionType;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:fluttertoast/fluttertoast.dart';
import 'package:get/get.dart';
import 'package:uuid/uuid.dart';

import 'package:dash_master_toolkit/providers/auth_service.dart';

import '../models/copilot_attachment.dart';
import '../models/copilot_message.dart';
import '../models/copilot_suggestion.dart';
import '../services/copilot_api_service.dart';
import '../services/copilot_socket_service.dart';
import 'copilot_context_controller.dart';

class CopilotController extends GetxController {
  static CopilotController get to {
    if (!Get.isRegistered<CopilotController>()) {
      Get.put(CopilotController(), permanent: true);
    }
    return Get.find<CopilotController>();
  }

  /// `api`/`socket`/`context` par défaut restent les vrais singletons —
  /// seam de test (voir test/ai/providers/copilot_controller_test.dart),
  /// même pattern que CopilotApiService.withDio().
  CopilotController({
    @visibleForTesting CopilotApiService? api,
    @visibleForTesting CopilotSocketService? socket,
    @visibleForTesting CopilotContextController? context,
  })  : _api = api ?? CopilotApiService.instance,
        _socket = socket ?? CopilotSocketService.instance,
        _context = context ?? CopilotContextController.to;

  final CopilotApiService _api;
  final CopilotSocketService _socket;
  final CopilotContextController _context;
  final _auth = AuthService();

  final messages = <CopilotMessage>[].obs;
  final isSending = false.obs;
  final isTyping = false.obs;
  final conversationId = RxnString();
  final attachments = <CopilotAttachment>[].obs;
  final inputCtrl = TextEditingController();

  bool _socketWired = false;

  // Un seul tour à la fois (isSending le garantit) — pas besoin d'un id de
  // tour, juste "ce tour a-t-il été arrêté ?", remis à zéro au tour
  // suivant. Voir stopGenerating().
  bool _turnStopped = false;

  // Seul le chemin REST peut être RÉELLEMENT annulé (CancelToken, voir
  // copilot_api_service.dart) — côté WebSocket, "stop" ne fait qu'ignorer
  // les événements suivants, le calcul serveur continue (aucune capacité
  // d'annulation dans le contrat ai-copilot:*, voir AI_COPILOT_HTTP.md).
  CancelToken? _cancelToken;

  bool get isEmpty => messages.isEmpty;

  bool get canRegenerate =>
      !isSending.value &&
      messages.isNotEmpty &&
      messages.last.role == CopilotMessageRole.assistant &&
      messages.last.status != CopilotMessageStatus.streaming;

  @override
  void onInit() {
    super.onInit();
    _wireSocket();
  }

  @override
  void onClose() {
    _socket.detach();
    inputCtrl.dispose();
    super.onClose();
  }

  void _wireSocket() {
    if (_socketWired) return;
    _socketWired = true;
    if (!_auth.isLoggedIn) return;

    _socket.ensureConnected();

    _socket.onTyping((_) {
      if (_turnStopped) return;
      isTyping.value = true;
    });

    _socket.onChunk((_, text) {
      if (_turnStopped) return;
      isTyping.value = false;
      final msg = _currentAssistantMessage();
      if (msg == null) return;
      msg.text += text;
      messages.refresh();
    });

    _socket.onComplete((response) {
      if (_turnStopped) return;
      isTyping.value = false;
      isSending.value = false;
      conversationId.value = response.conversationId ?? conversationId.value;
      final msg = _currentAssistantMessage();
      if (msg == null) return;
      // `mode: "error"` (ex. clé LLM invalide/fournisseur indisponible/
      // timeout — voir errorClassifier.js côté backend) a TOUJOURS
      // `answer: null` (voir responseBuilder.js::buildErrorResponse) : sans
      // ce repli, la bulle restait vide, jamais le message spécifique et
      // sûr déjà construit côté backend.
      msg.text = response.answer ?? response.errorMessage ?? msg.text;
      msg.status = response.isError ? CopilotMessageStatus.error : CopilotMessageStatus.complete;
      msg.response = response;
      messages.refresh();
    });

    _socket.onError((message) {
      if (_turnStopped) return;
      isTyping.value = false;
      isSending.value = false;
      final msg = _currentAssistantMessage();
      if (msg == null) return;
      msg.text = message;
      msg.status = CopilotMessageStatus.error;
      messages.refresh();
    });
  }

  CopilotMessage? _currentAssistantMessage() {
    if (messages.isEmpty) return null;
    final last = messages.last;
    return last.role == CopilotMessageRole.assistant ? last : null;
  }

  /// `overrideText` permet d'envoyer le libellé d'une suggestion (voir
  /// sendSuggestion) ou "confirme"/"annule" (voir confirmPendingAction/
  /// cancelPendingAction) sans passer par le champ de saisie.
  Future<void> send([String? overrideText]) async {
    final text = (overrideText ?? inputCtrl.text).trim();
    if (text.isEmpty || isSending.value) return;

    messages.add(CopilotMessage.user(text));
    if (overrideText == null) inputCtrl.clear();
    attachments.clear();
    messages.refresh();

    await _runAssistantTurn(text);
  }

  /// Reprend le dernier message utilisateur et redemande une réponse,
  /// remplaçant la dernière réponse assistant affichée. Le backend, lui, ne
  /// supprime rien de son historique (aucune capacité "annuler le dernier
  /// tour") — la conversation côté serveur garde donc le tour original ET
  /// le tour régénéré ; seule cette interface affiche la version la plus
  /// récente. Voir lib/ai/README.md.
  Future<void> regenerate() async {
    if (!canRegenerate) return;

    String? lastUserText;
    for (var i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role == CopilotMessageRole.user) {
        lastUserText = messages[i].text;
        break;
      }
    }
    if (lastUserText == null) return;

    if (messages.isNotEmpty && messages.last.role == CopilotMessageRole.assistant) {
      messages.removeLast();
    }
    messages.refresh();

    await _runAssistantTurn(lastUserText);
  }

  /// Arrête d'attendre la suite de la réponse en cours. Réellement annulé
  /// côté REST (CancelToken) ; côté WebSocket, ignore seulement les
  /// événements suivants — voir le commentaire de `_cancelToken` plus haut.
  void stopGenerating() {
    if (!isSending.value) return;
    _turnStopped = true;
    _cancelToken?.cancel('stopped_by_user');
    isSending.value = false;
    isTyping.value = false;

    final msg = _currentAssistantMessage();
    if (msg != null && msg.status == CopilotMessageStatus.streaming) {
      if (msg.text.trim().isEmpty) msg.text = 'Génération interrompue.';
      msg.status = CopilotMessageStatus.complete;
      messages.refresh();
    }
  }

  Future<void> copyMessage(CopilotMessage message) async {
    await Clipboard.setData(ClipboardData(text: message.text));
    Fluttertoast.showToast(msg: 'Réponse copiée.');
  }

  // Context Awareness — voir CopilotContextController et
  // models/copilot_page_context.dart. Lu ICI, à chaque tour, jamais mis en
  // cache : si l'utilisateur change d'écran EN PLEIN MILIEU d'une
  // conversation (ex. quitte la fiche projet pendant que le Copilot
  // répond), le tour SUIVANT doit refléter le nouvel écran, pas l'ancien.
  Future<void> _runAssistantTurn(String userText) async {
    messages.add(CopilotMessage.pendingAssistant());
    isSending.value = true;
    isTyping.value = true;
    _turnStopped = false;
    messages.refresh();

    final pageContext = _context.current.value?.toJson();

    if (_socket.isConnected) {
      _socket.send(message: userText, conversationId: conversationId.value, pageContext: pageContext);
      return; // les handlers onTyping/onChunk/onComplete/onError font le reste
    }

    await _sendViaRest(userText, pageContext);
  }

  Future<void> _sendViaRest(String text, Map<String, dynamic>? pageContext) async {
    _cancelToken = CancelToken();
    try {
      final response = await _api.sendMessage(message: text, conversationId: conversationId.value, cancelToken: _cancelToken, pageContext: pageContext);
      if (_turnStopped) return; // stopGenerating() a déjà finalisé l'affichage
      conversationId.value = response.conversationId ?? conversationId.value;
      final msg = _currentAssistantMessage();
      if (msg != null) {
        // Même repli que le chemin WebSocket ci-dessus (onComplete) — voir
        // ce commentaire pour le détail.
        msg.text = response.answer ?? response.errorMessage ?? '';
        msg.status = response.isError ? CopilotMessageStatus.error : CopilotMessageStatus.complete;
        msg.response = response;
      }
    } catch (e) {
      if (_turnStopped || (e is DioException && e.type == DioExceptionType.cancel)) return;
      final msg = _currentAssistantMessage();
      if (msg != null) {
        msg.text = _friendlyError(e);
        msg.status = CopilotMessageStatus.error;
      }
    } finally {
      if (!_turnStopped) {
        isSending.value = false;
        isTyping.value = false;
      }
      messages.refresh();
    }
  }

  String _friendlyError(Object e) {
    final type = e.runtimeType.toString();
    if (type == 'CopilotNotConfiguredException') return "Le Copilot IA n'est pas encore configuré côté serveur.";
    if (type == 'CopilotForbiddenException') return "Votre rôle n'a pas accès au Copilot IA.";
    return 'Une erreur est survenue. Réessayez.';
  }

  void sendSuggestion(CopilotSuggestion suggestion) => send(suggestion.label);

  // Le flux confirmer/annuler d'une automatisation est un simple message en
  // langage naturel côté backend (voir AUTOMATION_WORKFLOWS.md, "Tour 2") —
  // jamais un endpoint séparé.
  void confirmPendingAction() => send('confirme');
  void cancelPendingAction() => send('annule');

  void startNewConversation() {
    conversationId.value = null;
    messages.clear();
    attachments.clear();
  }

  Future<void> loadConversation(String id) async {
    final raw = await _api.getConversationHistory(id);
    conversationId.value = id;
    messages.value = raw.map((m) {
      final role = m['role'] == 'user' ? CopilotMessageRole.user : CopilotMessageRole.assistant;
      final createdAt = DateTime.tryParse((m['at'] ?? '').toString()) ?? DateTime.now();
      return CopilotMessage(
        id: const Uuid().v4(),
        role: role,
        text: (m['content'] ?? '').toString(),
        createdAt: createdAt,
        status: CopilotMessageStatus.complete,
      );
    }).toList();
  }

  /// Génération de rapports — met en page le texte DÉJÀ affiché
  /// (`message.text`, une réponse d'intent `reporting`) en un vrai PDF via
  /// POST /ai-copilot/reports/pdf (voir reportPdf.service.js côté backend).
  /// Ne fait QUE récupérer les octets — l'appelant (CopilotMessageActions)
  /// décide de partager/imprimer via `printing`, un souci d'UI qui ne
  /// concerne pas ce contrôleur.
  Future<Uint8List> fetchReportPdfBytes(CopilotMessage message) {
    return _api.fetchReportPdfBytes(content: message.text);
  }

  void addAttachment(CopilotAttachment attachment) => attachments.add(attachment);
  void removeAttachment(String id) => attachments.removeWhere((a) => a.id == id);
}
