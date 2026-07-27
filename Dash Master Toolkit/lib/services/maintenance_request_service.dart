// lib/services/maintenance_request_service.dart
import 'dart:typed_data';

import 'package:dio/dio.dart';

import 'package:dash_master_toolkit/providers/api_client.dart';
import 'package:dash_master_toolkit/models/maintenance_request_model.dart';

class MaintenancePhotoFile {
  final Uint8List bytes;
  final String filename;
  MaintenancePhotoFile({required this.bytes, required this.filename});
}

class MaintenanceRequestService {
  static final MaintenanceRequestService instance = MaintenanceRequestService._();
  MaintenanceRequestService._();

  static const _base = '/maintenance-requests';

  // ── POST /maintenance-requests ────────────────────────────────────────────
  Future<MaintenanceRequest> create({
    required String equipement,
    required String typePanne,
    required String urgence,
    required String description,
    List<MaintenancePhotoFile> photos = const [],
  }) async {
    final formData = FormData.fromMap({
      'equipement': equipement,
      'typePanne': typePanne,
      'urgence': urgence,
      'description': description,
      'photos': photos
          .map((p) => MultipartFile.fromBytes(p.bytes, filename: p.filename))
          .toList(),
    });
    final res = await ApiClient.instance.dio.post(_base, data: formData);
    return MaintenanceRequest.fromJson(_unwrap(res.data));
  }

  // ── GET /maintenance-requests/my ──────────────────────────────────────────
  Future<List<MaintenanceRequest>> fetchMy() async {
    final res = await ApiClient.instance.dio.get('$_base/my');
    return _unwrapList(res.data).map((j) => MaintenanceRequest.fromJson(j)).toList();
  }

  // ── GET /maintenance-requests (gestionnaires) ─────────────────────────────
  Future<List<MaintenanceRequest>> fetchAll() async {
    final res = await ApiClient.instance.dio.get(_base);
    return _unwrapList(res.data).map((j) => MaintenanceRequest.fromJson(j)).toList();
  }

  // ── GET /maintenance-requests/:id ─────────────────────────────────────────
  Future<MaintenanceRequest> fetchById(String id) async {
    final res = await ApiClient.instance.dio.get('$_base/$id');
    return MaintenanceRequest.fromJson(_unwrap(res.data));
  }

  // ── GET /maintenance-requests/stats ───────────────────────────────────────
  Future<Map<String, int>> fetchStats() async {
    try {
      final res = await ApiClient.instance.dio.get('$_base/stats');
      final data = _unwrap(res.data);
      return {
        'total': (data['total'] ?? 0) as int,
        'enAttente': (data['enAttente'] ?? 0) as int,
        'acceptee': (data['acceptee'] ?? 0) as int,
        'enCours': (data['enCours'] ?? 0) as int,
        'refusee': (data['refusee'] ?? 0) as int,
        'terminee': (data['terminee'] ?? 0) as int,
        'critique': (data['critique'] ?? 0) as int,
        'today': (data['today'] ?? 0) as int,
        'thisWeek': (data['thisWeek'] ?? 0) as int,
      };
    } catch (_) {
      return {
        'total': 0, 'enAttente': 0, 'acceptee': 0, 'enCours': 0, 'refusee': 0,
        'terminee': 0, 'critique': 0, 'today': 0, 'thisWeek': 0,
      };
    }
  }

  // ── GET /maintenance-requests/technicians ─────────────────────────────────
  Future<List<MaintenanceTechnician>> fetchTechnicians() async {
    try {
      final res = await ApiClient.instance.dio.get('$_base/technicians');
      final list = _unwrapList(res.data);
      return list.map((j) => MaintenanceTechnician.fromJson(j)).toList();
    } catch (_) {
      return [];
    }
  }

  // ── PUT /maintenance-requests/:id/accept ──────────────────────────────────
  Future<void> accept(String id) async {
    await ApiClient.instance.dio.put('$_base/$id/accept');
  }

  // ── PUT /maintenance-requests/:id/reject ──────────────────────────────────
  Future<void> reject(String id, {String? reason}) async {
    await ApiClient.instance.dio.put('$_base/$id/reject', data: reason == null ? null : {'reason': reason});
  }

  // ── PUT /maintenance-requests/:id/assign ──────────────────────────────────
  Future<void> assign(String id, String technicianId) async {
    await ApiClient.instance.dio.put('$_base/$id/assign', data: {'technicianId': technicianId});
  }

  // ── PUT /maintenance-requests/:id/start ───────────────────────────────────
  Future<void> start(String id) async {
    await ApiClient.instance.dio.put('$_base/$id/start');
  }

  // ── PUT /maintenance-requests/:id/complete ────────────────────────────────
  Future<void> complete(String id) async {
    await ApiClient.instance.dio.put('$_base/$id/complete');
  }

  // ── DELETE /maintenance-requests/:id ──────────────────────────────────────
  Future<void> deleteRequest(String id) async {
    await ApiClient.instance.dio.delete('$_base/$id');
  }

  // ── Commentaires ───────────────────────────────────────────────────────────
  Future<List<MaintenanceRequestComment>> fetchComments(String id) async {
    final res = await ApiClient.instance.dio.get('$_base/$id/comments');
    return _unwrapList(res.data).map((j) => MaintenanceRequestComment.fromJson(j)).toList();
  }

  Future<MaintenanceRequestComment> addComment(String id, String message) async {
    final res = await ApiClient.instance.dio.post('$_base/$id/comments', data: {'message': message});
    return MaintenanceRequestComment.fromJson(_unwrap(res.data));
  }

  // ── Historique ─────────────────────────────────────────────────────────────
  Future<List<MaintenanceRequestActivity>> fetchHistory(String id) async {
    final res = await ApiClient.instance.dio.get('$_base/$id/history');
    return _unwrapList(res.data).map((j) => MaintenanceRequestActivity.fromJson(j)).toList();
  }

  // ── Parse helpers ──────────────────────────────────────────────────────────
  Map<String, dynamic> _unwrap(dynamic data) {
    if (data == null) return {};
    if (data is Map<String, dynamic>) {
      if (data['data'] is Map) return Map<String, dynamic>.from(data['data'] as Map);
      return data;
    }
    return {};
  }

  List<Map<String, dynamic>> _unwrapList(dynamic data) {
    if (data == null) return [];
    List raw = [];
    if (data is List) {
      raw = data;
    } else if (data is Map && data['data'] is List) {
      raw = data['data'] as List;
    }
    return raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }
}
