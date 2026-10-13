// lib/powerbi/powerbi_embed_service.dart
//
// Couche REST vers GET /powerbi/embed-config (Backend Master/src/modules/powerbi).
// L'appel ne transmet AUCUNE identité : ni e-mail, ni identifiant, ni rôle. Le
// backend déduit l'utilisateur du JWT déjà posé par l'intercepteur d'ApiClient.
// Aucun secret Microsoft ne transite ni n'est stocké ici ; le jeton
// d'intégration reçu est de courte durée et reste en mémoire.
import 'package:dio/dio.dart';

import 'package:dash_master_toolkit/providers/api_client.dart';

/// Ce que le serveur renvoie pour l'utilisateur de la session courante.
class PowerBiEmbedConfig {
  final String reportId;
  final String embedUrl;
  final String embedToken;
  final DateTime expiresAt;
  final String viewerEmail;

  /// `commercial` ou `global`.
  final String scope;

  /// « Utilisateur connecté : … » ou « Vue globale — Administrateur ».
  final String viewerLabel;

  /// Pages autorisées (null = toutes).
  final List<String>? allowedPages;

  const PowerBiEmbedConfig({
    required this.reportId,
    required this.embedUrl,
    required this.embedToken,
    required this.expiresAt,
    required this.viewerEmail,
    required this.scope,
    required this.viewerLabel,
    required this.allowedPages,
  });

  bool get isGlobal => scope == 'global';

  factory PowerBiEmbedConfig.fromJson(Map<String, dynamic> json) {
    final viewer = (json['viewer'] as Map?)?.cast<String, dynamic>() ?? const {};
    final reportId = (json['reportId'] ?? '').toString();
    final embedUrl = (json['embedUrl'] ?? '').toString();
    final embedToken = (json['embedToken'] ?? '').toString();
    final expiresAt = DateTime.tryParse((json['expiresAt'] ?? '').toString());
    if (reportId.isEmpty || embedUrl.isEmpty || embedToken.isEmpty || expiresAt == null) {
      throw const PowerBiEmbedException(PowerBiEmbedFailure.unavailable, 'Réponse Power BI incomplète.');
    }
    return PowerBiEmbedConfig(
      reportId: reportId,
      embedUrl: embedUrl,
      embedToken: embedToken,
      expiresAt: expiresAt.toUtc(),
      viewerEmail: (viewer['email'] ?? '').toString(),
      scope: (viewer['scope'] ?? 'commercial').toString(),
      viewerLabel: (viewer['label'] ?? '').toString(),
      allowedPages: (viewer['allowedPages'] as List?)?.map((e) => e.toString()).toList(),
    );
  }
}

enum PowerBiEmbedFailure { notConfigured, sessionExpired, forbidden, unavailable }

class PowerBiEmbedException implements Exception {
  final PowerBiEmbedFailure failure;
  final String message;
  const PowerBiEmbedException(this.failure, this.message);

  @override
  String toString() => message;
}

class PowerBiEmbedService {
  PowerBiEmbedService({Dio? dio}) : _dio = dio ?? ApiClient.instance.dio;

  final Dio _dio;

  Future<PowerBiEmbedConfig> fetchEmbedConfig() async {
    try {
      final res = await _dio.get<dynamic>('/powerbi/embed-config');
      final data = res.data;
      if (data is! Map) {
        throw const PowerBiEmbedException(PowerBiEmbedFailure.unavailable, 'Réponse Power BI inattendue.');
      }
      return PowerBiEmbedConfig.fromJson(data.cast<String, dynamic>());
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      final body = e.response?.data;
      final serverMessage = body is Map ? (body['message'] ?? '').toString() : '';
      switch (status) {
        case 401:
          throw const PowerBiEmbedException(PowerBiEmbedFailure.sessionExpired, 'Session expirée : veuillez vous reconnecter.');
        case 403:
          throw PowerBiEmbedException(PowerBiEmbedFailure.forbidden, serverMessage.isNotEmpty ? serverMessage : "Vous n'avez pas accès à ce rapport.");
        case 503:
          throw const PowerBiEmbedException(PowerBiEmbedFailure.notConfigured, "Le rapport Power BI n'est pas encore configuré.");
        default:
          throw const PowerBiEmbedException(PowerBiEmbedFailure.unavailable, 'Power BI est momentanément indisponible.');
      }
    }
  }
}
