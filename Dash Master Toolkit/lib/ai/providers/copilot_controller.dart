// lib/ai/providers/copilot_controller.dart
//
// L'état vivant d'UNE conversation avec le Copilot — messages, streaming,
// indicateur de frappe, copier/régénérer/stop, documents joints (Phase 2,
// envoyés à POST /ai-copilot/documents), automatisations en attente de confirmation. Pattern GetX
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
import '../utils/copilot_loading_phase.dart';
import 'copilot_context_controller.dart';

/// Ce que l'on SAIT de la disponibilité du Copilot, d'après le dernier
/// échange réel avec le serveur.
enum CopilotAvailability {
  /// Aucun échange dans cette session : rien n'est affirmé.
  unknown,

  /// Dernière demande traitée normalement.
  ready,

  /// Le serveur répond, mais la dernière demande a échoué (modèle
  /// indisponible, délai dépassé, erreur interne).
  degraded,

  /// Aucune réponse du serveur.
  unreachable,

  /// Copilot désactivé ou sans modèle configuré côté serveur (503).
  notConfigured,

  /// Rôle non autorisé (403).
  forbidden,
}

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

  /// État de disponibilité CONSTATÉ, jamais supposé : `unknown` tant
  /// qu'aucun échange n'a eu lieu dans la session, puis le résultat du
  /// dernier échange avec le serveur. L'en-tête du panneau l'affiche.
  final availability = CopilotAvailability.unknown.obs;
  final isSending = false.obs;
  final isTyping = false.obs;
  final conversationId = RxnString();
  final attachments = <CopilotAttachment>[].obs;

  /// Ce que le Copilot est en train de faire pendant l'attente (voir
  /// utils/copilot_loading_phase.dart) — déduit du message envoyé.
  final loadingPhase = CopilotLoadingPhase.crm.obs;

  // Un document a-t-il déjà été joint dans CETTE conversation ?
  bool _conversationHasDocuments = false;
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
      // Le serveur a répondu : joignable. `mode: "error"` signale que le
      // modèle ou un service en aval n'a pas pu traiter la demande.
      availability.value = response.isError ? CopilotAvailability.degraded : CopilotAvailability.ready;
      messages.refresh();
    });

    _socket.onError((message) {
      if (_turnStopped) return;
      isTyping.value = false;
      isSending.value = false;
      availability.value = CopilotAvailability.degraded;
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
    if (attachments.any((a) => a.isUploading)) {
      Fluttertoast.showToast(msg: "Patientez : le document est encore en cours d'analyse.");
      return;
    }

    // Seuls les documents effectivement indexés partent avec le message ;
    // le backend les garde ensuite comme documents actifs de la conversation.
    final documentIds = attachments.where((a) => a.isReady).map((a) => a.documentId!).toList();

    messages.add(CopilotMessage.user(text));
    if (overrideText == null) inputCtrl.clear();
    attachments.clear();
    messages.refresh();

    await _runAssistantTurn(text, documentIds: documentIds);
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
  Future<void> _runAssistantTurn(String userText, {List<String> documentIds = const []}) async {
    messages.add(CopilotMessage.pendingAssistant());
    isSending.value = true;
    isTyping.value = true;
    _turnStopped = false;
    messages.refresh();

    if (documentIds.isNotEmpty) _conversationHasDocuments = true;
    loadingPhase.value = inferCopilotLoadingPhase(userText, hasDocuments: documentIds.isNotEmpty, conversationHasDocuments: _conversationHasDocuments);

    final pageContext = _context.current.value?.toJson();
    // `null` plutôt qu'une liste vide : contrat d'appel inchangé sans document.
    final ids = documentIds.isEmpty ? null : documentIds;

    if (_socket.isConnected) {
      _socket.send(message: userText, conversationId: conversationId.value, pageContext: pageContext, documentIds: ids);
      return; // les handlers onTyping/onChunk/onComplete/onError font le reste
    }

    await _sendViaRest(userText, pageContext, ids);
  }

  Future<void> _sendViaRest(String text, Map<String, dynamic>? pageContext, [List<String>? documentIds]) async {
    _cancelToken = CancelToken();
    try {
      final response = await _api.sendMessage(
        message: text,
        conversationId: conversationId.value,
        cancelToken: _cancelToken,
        pageContext: pageContext,
        documentIds: documentIds,
      );
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
      availability.value = response.isError ? CopilotAvailability.degraded : CopilotAvailability.ready;
    } catch (e) {
      if (_turnStopped || (e is DioException && e.type == DioExceptionType.cancel)) return;
      availability.value = _availabilityFor(e);
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

  // Un message par cause, toujours actionnable : jamais une réponse
  // inventée à la place d'une erreur, jamais de détail technique.
  String _friendlyError(Object e) {
    if (e is CopilotNotConfiguredException) return "Le Copilot IA n'est pas encore configuré côté serveur.";
    if (e is CopilotForbiddenException) return "Votre rôle n'a pas accès au Copilot IA.";
    if (e is CopilotNetworkException) return 'Serveur injoignable. Vérifiez votre connexion et que le CRM est démarré, puis réessayez.';
    if (e is CopilotTimeoutException) return "Le Copilot n'a pas répondu à temps : le modèle met trop longtemps ou est indisponible. Reformulez plus précisément ou réessayez dans un instant.";
    if (e is CopilotServerException) {
      if (e.statusCode == 401) return 'Votre session a expiré. Reconnectez-vous pour continuer.';
      if (e.statusCode == 429) return 'Trop de demandes envoyées en peu de temps. Patientez quelques secondes avant de réessayer.';
      if ((e.statusCode ?? 0) >= 500) return "Le service du Copilot a rencontré une erreur. Aucune donnée n'a été modifiée. Réessayez dans un instant.";
      return e.message;
    }
    return 'Une erreur est survenue. Réessayez.';
  }

  CopilotAvailability _availabilityFor(Object e) {
    if (e is CopilotNetworkException) return CopilotAvailability.unreachable;
    if (e is CopilotNotConfiguredException) return CopilotAvailability.notConfigured;
    if (e is CopilotForbiddenException) return CopilotAvailability.forbidden;
    return CopilotAvailability.degraded;
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
    _conversationHasDocuments = false;
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

  /// Phase 2 — valide puis envoie un fichier choisi par l'utilisateur. La
  /// puce passe par « envoi… » puis « prêt » (documentId reçu) ou « erreur »
  /// (message du backend ou de la validation locale). Retourne le message
  /// d'erreur, ou `null` en cas de succès.
  Future<String?> uploadAttachment(CopilotAttachment attachment, Uint8List bytes) async {
    if (attachments.length >= CopilotAttachmentRules.maxAttachmentsPerMessage) {
      return 'Cinq documents au maximum par message.';
    }
    final invalid = CopilotAttachmentRules.validate(fileName: attachment.fileName, sizeBytes: bytes.isEmpty ? attachment.sizeBytes : bytes.length);
    if (invalid != null || bytes.isEmpty) {
      final message = invalid ?? 'Impossible de lire ce fichier.';
      attachments.add(attachment.asError(message));
      return message;
    }

    attachments.add(attachment);
    try {
      final uploaded = await _api.uploadDocument(
        bytes: bytes,
        fileName: attachment.fileName,
        onSendProgress: (sent, total) => _updateProgress(attachment.id, sent, total),
      );
      _replaceAttachment(attachment.id, (a) => a.asReady(uploaded.documentId), orphanDocumentId: uploaded.documentId);
      return null;
    } catch (e) {
      final message = e is CopilotForbiddenException || e is CopilotNotConfiguredException ? _friendlyError(e) : _uploadError(e);
      _replaceAttachment(attachment.id, (a) => a.asError(message));
      return message;
    }
  }

  // L'utilisateur a pu retirer la puce pendant l'envoi : le document déjà
  // indexé côté serveur est alors supprimé plutôt que laissé orphelin.
  void _replaceAttachment(String id, CopilotAttachment Function(CopilotAttachment) update, {String? orphanDocumentId}) {
    final index = attachments.indexWhere((a) => a.id == id);
    if (index < 0) {
      if (orphanDocumentId != null) _deleteQuietly(orphanDocumentId);
      return;
    }
    attachments[index] = update(attachments[index]);
  }

  // Rafraîchi par pas de 2 % au plus : une mise à jour par paquet réseau
  // reconstruirait la barre de saisie des centaines de fois par seconde.
  void _updateProgress(String id, int sent, int total) {
    if (total <= 0) return;
    final index = attachments.indexWhere((a) => a.id == id);
    if (index < 0 || !attachments[index].isUploading) return;
    final value = sent / total;
    final previous = attachments[index].progress ?? 0;
    if (value < 1 && value - previous < 0.02) return;
    attachments[index] = attachments[index].withProgress(value);
  }

  String _uploadError(Object e) {
    final text = e.toString().replaceFirst('Exception: ', '').trim();
    return text.isEmpty ? "L'envoi du document a échoué." : text;
  }

  void _deleteQuietly(String documentId) {
    _api.deleteDocument(documentId).catchError((_) {});
  }

  void addAttachment(CopilotAttachment attachment) => attachments.add(attachment);

  /// Retire la puce ; si le document était déjà indexé et pas encore envoyé,
  /// il est aussi supprimé côté serveur (rien ne reste inutilement en mémoire).
  void removeAttachment(String id) {
    final index = attachments.indexWhere((a) => a.id == id);
    if (index < 0) return;
    final removed = attachments.removeAt(index);
    if (removed.isReady) _deleteQuietly(removed.documentId!);
  }
}
