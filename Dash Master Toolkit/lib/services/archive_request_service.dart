// lib/services/archive_request_service.dart
import 'package:dash_master_toolkit/providers/api_client.dart';
import 'package:dash_master_toolkit/models/archive_request_model.dart';

class ArchiveRequestService {
  static final ArchiveRequestService instance = ArchiveRequestService._();
  ArchiveRequestService._();

  // ── Candidate endpoints tried in order ─────────────────────────────────────
  static const _adminEndpoints = [
    '/archive-requests/admin',
    '/archive-requests/pending',
    '/archive-requests/all',
    '/archive-requests',
  ];

  static const _userEndpoints = [
    '/archive-requests/my',
    '/archive-requests/me',
    '/archive-requests',
  ];

  // ── POST /archive-requests ─────────────────────────────────────────────────
  Future<ArchiveRequest> create({
    required String projectId,
    required String subject,
    required String message,
    String type = 'DESARCHIVAGE',
  }) async {
    final body = {
      'projectId': projectId,
      'subject':   subject,
      'message':   message,
      'type':      type,
    };
    // ignore: avoid_print
    print('ARCHIVE REQUEST BODY = $body');
    try {
      final res = await ApiClient.instance.dio
          .post('/archive-requests', data: body);
      return ArchiveRequest.fromJson(_unwrap(res.data));
    } catch (e) {
      // ignore: avoid_print
      print('ARCHIVE REQUEST ERROR = $e');
      rethrow;
    }
  }

  // ── Fetch for admin — tries endpoints until one returns a non-empty list ───
  Future<List<ArchiveRequest>> fetchAdmin() async {
    // ignore: avoid_print
    print('LOAD ARCHIVE REQUESTS [admin]');

    for (final path in _adminEndpoints) {
      try {
        // ignore: avoid_print
        print('  → trying $path');
        final res = await ApiClient.instance.dio.get(path);
        // ignore: avoid_print
        print(res.data);

        final list = _unwrapList(res.data);
        // ignore: avoid_print
        print('ADMIN REQUESTS COUNT = ${list.length}  (from $path)');

        if (list.isNotEmpty) {
          return list.map((j) => ArchiveRequest.fromJson(j)).toList();
        }
        // Empty list is a valid response — return it from the first 2xx
        return [];
      } catch (e) {
        // ignore: avoid_print
        print('  ✗ $path failed: $e');
        // continue to next candidate
      }
    }

    // ignore: avoid_print
    print('LOAD ARCHIVE REQUESTS — all endpoints failed, returning []');
    return [];
  }

  // ── Fetch for regular user ─────────────────────────────────────────────────
  Future<List<ArchiveRequest>> fetchAll() async {
    // ignore: avoid_print
    print('LOAD ARCHIVE REQUESTS [user]');

    for (final path in _userEndpoints) {
      try {
        // ignore: avoid_print
        print('  → trying $path');
        final res = await ApiClient.instance.dio.get(path);
        // ignore: avoid_print
        print(res.data);

        final list = _unwrapList(res.data);
        // ignore: avoid_print
        print('USER REQUESTS COUNT = ${list.length}  (from $path)');

        return list.map((j) => ArchiveRequest.fromJson(j)).toList();
      } catch (e) {
        // ignore: avoid_print
        print('  ✗ $path failed: $e');
      }
    }

    return [];
  }

  // ── GET /archive-requests/:id ──────────────────────────────────────────────
  Future<ArchiveRequest> fetchById(String id) async {
    final res = await ApiClient.instance.dio
        .get('/archive-requests/$id');
    return ArchiveRequest.fromJson(_unwrap(res.data));
  }

  // ── POST /archive-requests/:id/messages ───────────────────────────────────
  Future<ArchiveRequestMessage> addMessage(
      String requestId, String content) async {
    final body = {'message': content.trim()};
    // ignore: avoid_print
    print('MESSAGE SENT = $body');
    final res = await ApiClient.instance.dio.post(
      '/archive-requests/$requestId/messages',
      data: body,
    );
    return ArchiveRequestMessage.fromJson(_unwrap(res.data));
  }

  // ── PUT /archive-requests/:id/approve ─────────────────────────────────────
  Future<void> approve(String requestId) async {
    await ApiClient.instance.dio
        .put('/archive-requests/$requestId/approve');
  }

  // ── PUT /archive-requests/:id/reject ──────────────────────────────────────
  Future<void> reject(String requestId, {String? reason}) async {
    await ApiClient.instance.dio.put(
      '/archive-requests/$requestId/reject',
      data: reason == null ? null : {'reason': reason},
    );
  }

  // ── DELETE /archive-requests/:id ───────────────────────────────────────────
  Future<void> deleteRequest(String requestId) async {
    await ApiClient.instance.dio.delete('/archive-requests/$requestId');
  }

  // ── GET /archive-requests/stats ────────────────────────────────────────────
  Future<Map<String, int>> fetchStats() async {
    try {
      final res = await ApiClient.instance.dio.get('/archive-requests/stats');
      final data = _unwrap(res.data);
      return {
        'pending':      (data['pending'] ?? 0) as int,
        'archivage':    (data['archivage'] ?? 0) as int,
        'desarchivage': (data['desarchivage'] ?? 0) as int,
        'approved':     (data['approved'] ?? 0) as int,
        'rejected':     (data['rejected'] ?? 0) as int,
      };
    } catch (_) {
      return {
        'pending': 0, 'archivage': 0, 'desarchivage': 0, 'approved': 0, 'rejected': 0,
      };
    }
  }

  // ── GET /archive-requests/pending-count ────────────────────────────────────
  Future<int> fetchPendingCount() async {
    try {
      final res = await ApiClient.instance.dio.get('/archive-requests/pending-count');
      final data = res.data;
      if (data is Map && data['count'] is num) return (data['count'] as num).toInt();
      return 0;
    } catch (_) {
      return 0;
    }
  }

  // ── Parse helpers ──────────────────────────────────────────────────────────
  Map<String, dynamic> _unwrap(dynamic data) {
    if (data == null) return {};
    if (data is Map<String, dynamic>) {
      for (final key in ['data', 'request', 'item', 'result']) {
        if (data[key] is Map) {
          return Map<String, dynamic>.from(data[key] as Map);
        }
      }
      return data;
    }
    return {};
  }

  List<Map<String, dynamic>> _unwrapList(dynamic data) {
    if (data == null) return [];
    List raw = [];
    if (data is List) {
      raw = data;
    } else if (data is Map) {
      for (final key in [
        'data', 'requests', 'items', 'results', 'docs', 'list'
      ]) {
        if (data[key] is List) {
          raw = data[key] as List;
          break;
        }
      }
    }
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }
}
