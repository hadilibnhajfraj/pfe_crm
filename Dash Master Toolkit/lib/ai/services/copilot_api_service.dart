// lib/ai/services/copilot_api_service.dart
//
// Couche REST vers le backend réel — POST /ai-copilot/chat,
// GET /ai-copilot/conversations, GET /ai-copilot/conversations/:id. Voir
// Backend Master/src/modules/ai-copilot/AI_COPILOT_HTTP.md pour le contrat
// exact. Réutilise ApiClient.instance.dio (même singleton Dio que tout le
// reste de l'app — intercepteur JWT/401 déjà câblé, voir
// lib/providers/api_client.dart) plutôt que d'ouvrir un second client HTTP.
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import 'package:dash_master_toolkit/providers/api_client.dart';
import '../models/copilot_response.dart';
import '../models/conversation_summary.dart';
import '../models/copilot_dashboard_briefing.dart';

/// Levée quand le backend répond 503 (`AI_COPILOT_ENABLED=true` ou aucun
/// fournisseur LLM configuré) — distincte d'une erreur générique pour que
/// l'UI puisse afficher "Le Copilot n'est pas encore configuré" plutôt
/// qu'un message d'erreur réseau générique.
class CopilotNotConfiguredException implements Exception {
  final String message;
  const CopilotNotConfiguredException(this.message);
}

/// Levée quand le backend répond 403 (rôle non autorisé, voir
/// AI_COPILOT_ROLES_ALLOWED côté backend).
class CopilotForbiddenException implements Exception {
  final String message;
  const CopilotForbiddenException(this.message);
}

/// Le serveur n'a pas pu être joint (hors ligne, backend arrêté, DNS…) :
/// aucune réponse HTTP n'a été reçue.
class CopilotNetworkException implements Exception {
  final String message;
  const CopilotNetworkException(this.message);
  @override
  String toString() => message;
}

/// La requête a expiré avant la réponse (connexion, envoi ou réception).
class CopilotTimeoutException implements Exception {
  final String message;
  const CopilotTimeoutException(this.message);
  @override
  String toString() => message;
}

/// Le serveur a répondu par une erreur (401, 429, 5xx…). `message` est celui
/// du backend, déjà rédigé pour l'utilisateur (voir errorClassifier.js) : il
/// ne contient jamais de détail technique.
class CopilotServerException implements Exception {
  final int? statusCode;
  final String message;
  const CopilotServerException(this.statusCode, this.message);
  @override
  String toString() => message;
}

/// Réponse de POST /ai-copilot/documents — métadonnées seulement, jamais le
/// contenu du document.
class CopilotUploadedDocument {
  final String documentId;
  final String filename;
  final int? pageCount;
  final int? chunkCount;

  const CopilotUploadedDocument({required this.documentId, required this.filename, this.pageCount, this.chunkCount});

  factory CopilotUploadedDocument.fromJson(Map<String, dynamic> json) => CopilotUploadedDocument(
        documentId: (json['documentId'] ?? '').toString(),
        filename: (json['filename'] ?? '').toString(),
        pageCount: json['pageCount'] is num ? (json['pageCount'] as num).toInt() : null,
        chunkCount: json['chunkCount'] is num ? (json['chunkCount'] as num).toInt() : null,
      );
}

class CopilotApiService {
  CopilotApiService._() : _injectedDio = null;

  /// Seam de test — voir test/ai/services/copilot_api_service_test.dart.
  /// `dio` par défaut reste `ApiClient.instance.dio` (même singleton que le
  /// reste de l'app) ; ne rien passer ici en dehors des tests.
  @visibleForTesting
  CopilotApiService.withDio(Dio dio) : _injectedDio = dio;

  static final CopilotApiService instance = CopilotApiService._();

  final Dio? _injectedDio;

  Dio get _dio => _injectedDio ?? ApiClient.instance.dio;

  /// `cancelToken` permet à l'appelant (CopilotController.stopGenerating())
  /// d'interrompre RÉELLEMENT la requête en cours — contrairement au
  /// "stop" côté WebSocket, qui ne fait qu'ignorer les événements suivants
  /// sans arrêter le calcul serveur (voir CopilotController). Une
  /// annulation (`DioExceptionType.cancel`) n'est PAS traduite en exception
  /// générique : elle est relancée telle quelle pour que l'appelant puisse
  /// la distinguer d'une vraie erreur et ne jamais afficher un message
  /// d'erreur pour un arrêt volontaire.
  Future<CopilotResponse> sendMessage({
    required String message,
    String? conversationId,
    CancelToken? cancelToken,
    Map<String, dynamic>? pageContext,
    List<String>? documentIds,
  }) async {
    try {
      final res = await _dio.post(
        '/ai-copilot/chat',
        data: {
          'message': message,
          if (conversationId != null) 'conversationId': conversationId,
          if (pageContext != null) 'pageContext': pageContext,
          // Phase 2 — uniquement des identifiants ; le backend revérifie que
          // chaque document appartient bien à l'utilisateur connecté.
          if (documentIds != null && documentIds.isNotEmpty) 'documentIds': documentIds,
        },
        cancelToken: cancelToken,
      );
      final data = _unwrap(res.data);
      return CopilotResponse.fromJson(data);
    } on DioException catch (e) {
      if (e.type == DioExceptionType.cancel) rethrow;
      throw _translate(e);
    }
  }

  Future<List<ConversationSummary>> listConversations({int? limit}) async {
    try {
      final res = await _dio.get(
        '/ai-copilot/conversations',
        queryParameters: limit != null ? {'limit': limit} : null,
      );
      final data = res.data;
      final list = (data is Map ? data['data'] : null);
      if (list is! List) return const [];
      return list
          .whereType<Map>()
          .map((e) => ConversationSummary.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// Retourne la liste brute des messages `{role, content, at, ...}` d'une
  /// conversation (même forme que `IConversationMemory.getHistory()` côté
  /// backend) — reconstruire des `CopilotMessage` à partir de ça reste à la
  /// charge de l'appelant (CopilotController), qui connaît déjà ses propres
  /// messages en cours si l'utilisateur revient sur une conversation active.
  Future<List<Map<String, dynamic>>> getConversationHistory(String conversationId) async {
    try {
      final res = await _dio.get('/ai-copilot/conversations/$conversationId');
      final data = _unwrap(res.data);
      final messages = data['messages'];
      if (messages is! List) return const [];
      return messages.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// AI Dashboard — GET /ai-copilot/dashboard : le briefing proactif
  /// (greeting, compteurs du jour, qualité CRM, cartes de risque/
  /// recommandation, timeline, graphique). Contrairement à `sendMessage()`,
  /// n'a jamais 503 pour "aucun fournisseur LLM configuré" (voir
  /// dashboardBriefing.service.js côté backend, entièrement déterministe).
  Future<CopilotDashboardBriefing> getDashboardBriefing() async {
    try {
      final res = await _dio.get('/ai-copilot/dashboard');
      final data = _unwrap(res.data);
      return CopilotDashboardBriefing.fromJson(data);
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// Proactive AI — POST /ai-copilot/proactive/:workflowId/confirm : EXÉCUTE
  /// réellement le workflow proposé par une alerte proactive (voir
  /// PROACTIVE_AI.md). Lève une exception générique (jamais silencieuse) si
  /// le workflow est inconnu/expiré/pas le nôtre (404) ou si l'exécution
  /// échoue côté backend.
  Future<void> confirmProactiveWorkflow(String workflowId) async {
    try {
      await _dio.post('/ai-copilot/proactive/$workflowId/confirm');
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// Proactive AI — POST /ai-copilot/proactive/:workflowId/reject : écarte
  /// le workflow SANS jamais l'exécuter.
  Future<void> rejectProactiveWorkflow(String workflowId) async {
    try {
      await _dio.post('/ai-copilot/proactive/$workflowId/reject');
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// POST /ai-copilot/reports/pdf — met en page un rapport DÉJÀ produit par
  /// une réponse `reporting` de `sendMessage()` (`answer`) en un vrai fichier
  /// PDF, renvoyé en octets bruts. Même pattern Dio que
  /// `HrRequestService.fetchPdfBytes` (`ResponseType.bytes` — jamais le
  /// parsing JSON par défaut, qui casserait sur du binaire).
  Future<Uint8List> fetchReportPdfBytes({required String content, String? title}) async {
    try {
      final res = await _dio.post<List<int>>(
        '/ai-copilot/reports/pdf',
        data: {'content': content, if (title != null) 'title': title},
        options: Options(responseType: ResponseType.bytes),
      );
      return Uint8List.fromList(res.data ?? const []);
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// Phase 2 — POST /ai-copilot/documents (multipart, champ `file`) : le
  /// backend valide (format, signature, 10 Mo), extrait, découpe et indexe le
  /// document dans le RAG, puis renvoie ses métadonnées. Le type MIME n'est
  /// pas imposé ici : le navigateur ne le connaît pas toujours, le backend se
  /// fie à la signature réelle du fichier.
  ///
  /// `onSendProgress` : progression réelle de l'envoi (Dio), pour la barre
  /// de progression de l'aperçu du fichier.
  Future<CopilotUploadedDocument> uploadDocument({required Uint8List bytes, required String fileName, ProgressCallback? onSendProgress}) async {
    try {
      final form = FormData.fromMap({'file': MultipartFile.fromBytes(bytes, filename: fileName)});
      final res = await _dio.post('/ai-copilot/documents', data: form, onSendProgress: onSendProgress);
      return CopilotUploadedDocument.fromJson(_unwrap(res.data));
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  /// Phase 2 — DELETE /ai-copilot/documents/:id (retire le document de
  /// l'index ; 404 s'il n'existe plus ou n'est pas le nôtre).
  Future<void> deleteDocument(String documentId) async {
    try {
      await _dio.delete('/ai-copilot/documents/${Uri.encodeComponent(documentId)}');
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  Map<String, dynamic> _unwrap(dynamic body) {
    if (body is Map && body['data'] is Map) {
      return Map<String, dynamic>.from(body['data'] as Map);
    }
    return body is Map ? Map<String, dynamic>.from(body) : const {};
  }

  Exception _translate(DioException e) {
    final status = e.response?.statusCode;
    final data = e.response?.data;
    final message = (data is Map && data['message'] != null) ? data['message'].toString() : (e.message ?? 'Erreur de connexion au Copilot');

    if (status == 503) return CopilotNotConfiguredException(message);
    if (status == 403) return CopilotForbiddenException(message);
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return CopilotTimeoutException(message);
      case DioExceptionType.connectionError:
        return CopilotNetworkException(message);
      default:
        break;
    }
    if (status != null) return CopilotServerException(status, message);
    return CopilotNetworkException(message);
  }
}
