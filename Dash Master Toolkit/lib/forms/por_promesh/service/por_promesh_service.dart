// lib/forms/por_promesh/service/por_promesh_service.dart
//
// CRUD API for POR PROMESH records. Backend routes do not exist yet —
// this defines the REST contract the backend is expected to implement,
// following the same Dio + envelope-tolerant parsing pattern used by
// PipelineService.

import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show debugPrint;

import 'package:dash_master_toolkit/providers/api_client.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';
import '../model/por_promesh_model.dart';
import '../model/poste_dashboard_stats.dart';
import '../model/poste_charts_data.dart';
import '../model/operator_option.dart';

class PorPromeshService {
  static final PorPromeshService instance = PorPromeshService._();
  PorPromeshService._();

  static const _basePath = '/por-promesh';

  Future<List<PorPromeshModel>> fetchAll({
    String? status,
    String? search,
    String? machine,
    String? poste,
    String? date,
    int skip = 0,
    int limit = 100,
  }) async {
    final params = <String, String>{
      'skip': skip.toString(),
      'limit': limit.toString(),
      if (status != null && status.isNotEmpty) 'status': status,
      if (search != null && search.isNotEmpty) 'search': search,
      if (machine != null && machine.isNotEmpty) 'machine': machine,
      if (poste != null && poste.isNotEmpty) 'poste': poste,
      if (date != null && date.isNotEmpty) 'date': date,
    };
    final res = await ApiClient.instance.dio.get(_basePath, queryParameters: params);
    return _parseItems(res.data).map(PorPromeshModel.fromJson).toList();
  }

  /// Liste paginée/triée/filtrée côté serveur — utilisée par le Dashboard du
  /// poste (recherche + filtres + pagination 10/20/50/100). Le total renvoyé
  /// (`count`) sert à calculer le nombre de pages côté UI.
  Future<({List<PorPromeshModel> items, int total})> fetchPage({
    String? machine,
    String? poste,
    String? date,
    String? dateRange,
    String? status,
    String? search,
    String? sort,
    int page = 1,
    int pageSize = 20,
    bool light = true,
  }) async {
    final params = <String, String>{
      'page': page.toString(),
      'pageSize': pageSize.toString(),
      if (light) 'light': 'true',
      if (machine != null && machine.isNotEmpty) 'machine': machine,
      if (poste != null && poste.isNotEmpty) 'poste': poste,
      if (date != null && date.isNotEmpty) 'date': date,
      if (dateRange != null && dateRange.isNotEmpty) 'dateRange': dateRange,
      if (status != null && status.isNotEmpty) 'status': status,
      if (search != null && search.isNotEmpty) 'search': search,
      if (sort != null && sort.isNotEmpty) 'sort': sort,
    };
    final res = await ApiClient.instance.dio.get(_basePath, queryParameters: params);
    final items = _parseItems(res.data).map(PorPromeshModel.fromJson).toList();
    final total = res.data is Map && (res.data as Map)['count'] != null
        ? int.tryParse((res.data as Map)['count'].toString()) ?? items.length
        : items.length;
    return (items: items, total: total);
  }

  /// KPI agrégés du poste — calculés côté backend (GET /por-promesh/dashboard).
  Future<PosteDashboardStats> fetchDashboard({
    String? machine,
    String? poste,
    String? date,
    String? dateRange,
    String? status,
  }) async {
    final params = <String, String>{
      if (machine != null && machine.isNotEmpty) 'machine': machine,
      if (poste != null && poste.isNotEmpty) 'poste': poste,
      if (date != null && date.isNotEmpty) 'date': date,
      if (dateRange != null && dateRange.isNotEmpty) 'dateRange': dateRange,
      if (status != null && status.isNotEmpty) 'status': status,
    };
    final res = await ApiClient.instance.dio.get('$_basePath/dashboard', queryParameters: params);
    return PosteDashboardStats.fromJson(_unwrapObject(res.data));
  }

  /// Séries graphiques du poste — calculées côté backend (GET /por-promesh/stats).
  Future<PosteChartsData> fetchStats({
    String? machine,
    String? poste,
    String? date,
    String? dateRange,
    String? status,
  }) async {
    final params = <String, String>{
      if (machine != null && machine.isNotEmpty) 'machine': machine,
      if (poste != null && poste.isNotEmpty) 'poste': poste,
      if (date != null && date.isNotEmpty) 'date': date,
      if (dateRange != null && dateRange.isNotEmpty) 'dateRange': dateRange,
      if (status != null && status.isNotEmpty) 'status': status,
    };
    final res = await ApiClient.instance.dio.get('$_basePath/stats', queryParameters: params);
    return PosteChartsData.fromJson(_unwrapObject(res.data));
  }

  /// Bouton "Nouvelle fiche" — crée une fiche côté backend (jamais une fiche
  /// VALIDE). Retourne l'objet créé ({id, machine, poste, status}) — jamais
  /// bool/void — pour que l'appelant navigue immédiatement avec son id, sans
  /// second appel réseau pour le retrouver. L'écran de destination
  /// (Rendement) refait quand même un `fetchById` pour charger le contenu
  /// complet (date/heure/opérateur déjà remplis, mais pas renvoyés ici).
  Future<({String id, String machine, String poste, String status})> createOrOpenDraft({
    required String machine,
    required String poste,
  }) async {
    debugPrint('[PorPromeshService] POST $_basePath/new (machine=$machine, poste=$poste)');
    final res = await ApiClient.instance.dio.post('$_basePath/new', data: {
      'machine': machine,
      'poste': poste,
      // Repli si l'utilisateur n'a pas de profil (user_profiles.name) en
      // base — le backend privilégie désormais ce profil serveur.
      'operateurName': AuthService().displayName,
    });
    final data = _unwrapObject(res.data);
    debugPrint('[PorPromeshService] POST terminé, id reçu = ${data['id']}');
    return (
      id: data['id'].toString(),
      machine: (data['machine'] ?? machine).toString(),
      poste: (data['poste'] ?? poste).toString(),
      status: (data['status'] ?? '').toString(),
    );
  }

  /// Liste déroulante "Opérateur" — utilisateurs autorisés à opérer ce
  /// module (GET /por-promesh/operators, ouvert à responsable_logistique_achat
  /// contrairement à GET /users qui est réservé admin/superadmin).
  Future<List<OperatorOption>> fetchOperators() async {
    final res = await ApiClient.instance.dio.get('$_basePath/operators');
    return _parseItems(res.data).map(OperatorOption.fromJson).toList();
  }

  Future<PorPromeshModel> fetchById(String id) async {
    final res = await ApiClient.instance.dio.get('$_basePath/$id');
    return PorPromeshModel.fromJson(_unwrapObject(res.data));
  }

  Future<PorPromeshModel> create(PorPromeshModel model) async {
    final res = await ApiClient.instance.dio.post(_basePath, data: model.toJson());
    return PorPromeshModel.fromJson(_unwrapObject(res.data));
  }

  Future<PorPromeshModel> update(String id, PorPromeshModel model) async {
    final res = await ApiClient.instance.dio.put('$_basePath/$id', data: model.toJson());
    return PorPromeshModel.fromJson(_unwrapObject(res.data));
  }

  Future<void> delete(String id) async {
    await ApiClient.instance.dio.delete('$_basePath/$id');
  }

  /// Verrouillage définitif (BROUILLON → VALIDE) — seul endpoint qui fait
  /// réellement passer `isLocked` à `true` côté backend. Le champ `status`
  /// envoyé via `create`/`update` est ignoré par le serveur ; il refuse cet
  /// appel (400) si dateProduction/heureDebut/heureFin ne sont pas renseignés.
  Future<PorPromeshModel> validate(String id) async {
    try {
      final res = await ApiClient.instance.dio.post('$_basePath/$id/validate');
      return PorPromeshModel.fromJson(_unwrapObject(res.data));
    } on DioException catch (e) {
      final data = e.response?.data;
      final msg = (data is Map && data['message'] != null)
          ? data['message'].toString()
          : (e.message ?? 'Erreur de validation');
      throw Exception(msg);
    }
  }

  /// Upload une photo/pièce jointe sur une fiche existante — utilisé par les
  /// modules Observation et NC. Retourne le `fileUrl` renvoyé par le backend.
  Future<String> uploadAttachment(
    String porPromeshId, {
    required Uint8List bytes,
    required String filename,
  }) async {
    final formData = FormData.fromMap({
      'file': MultipartFile.fromBytes(bytes, filename: filename),
    });
    final res = await ApiClient.instance.dio.post('$_basePath/$porPromeshId/attachments', data: formData);
    final data = _unwrapObject(res.data);
    return (data['fileUrl'] ?? '').toString();
  }

  // ── Parse helpers (envelope-tolerant, same approach as PipelineService) ──

  List<Map<String, dynamic>> _parseItems(dynamic data) {
    final raw = _unwrapList(data);
    return raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  List _unwrapList(dynamic data) {
    if (data is List) return data;
    if (data is Map) {
      for (final key in ['items', 'data', 'results', 'docs']) {
        final val = data[key];
        if (val is List) return val;
      }
    }
    return [];
  }

  Map<String, dynamic> _unwrapObject(dynamic data) {
    if (data is Map && data['data'] is Map) {
      return Map<String, dynamic>.from(data['data'] as Map);
    }
    if (data is Map) return Map<String, dynamic>.from(data);
    return {};
  }
}
