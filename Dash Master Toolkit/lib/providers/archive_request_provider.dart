// lib/providers/archive_request_provider.dart
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/models/archive_request_model.dart';
import 'package:dash_master_toolkit/services/archive_request_service.dart';
import 'package:dash_master_toolkit/services/socket_service.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'package:dash_master_toolkit/providers/api_client.dart';
import 'package:dash_master_toolkit/core/config/api_config.dart';
import 'package:dash_master_toolkit/forms/providers/pipeline_provider.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';

class ArchiveRequestProvider extends GetxController {
  static ArchiveRequestProvider get to {
    if (!Get.isRegistered<ArchiveRequestProvider>()) {
      Get.put(ArchiveRequestProvider());
    }
    return Get.find<ArchiveRequestProvider>();
  }

  final _service = ArchiveRequestService.instance;
  final _socket  = SocketService.instance;
  final _polling = PollingService();
  final _auth    = AuthService();

  final requests       = <ArchiveRequest>[].obs;
  final selectedId     = RxnString();
  final loading        = true.obs;
  final sending        = false.obs;
  final unreadTotal    = 0.obs;
  final lastApprovedAt = Rxn<DateTime>();
  final messageCtrl    = TextEditingController();
  final stats          = <String, int>{}.obs;

  ArchiveRequest? get selectedRequest =>
      requests.firstWhereOrNull((r) => r.id == selectedId.value);

  String get currentUserId => _auth.userId ?? '';
  // Seul cbitunisia@cbi-tunisia.com voit/gère les demandes — un rôle
  // admin/superadmin/superadmin2 ne suffit plus (faille corrigée).
  bool   get isAdmin       => _auth.isRootAdmin;

  int get pendingCount =>
      requests.where((r) => r.status == 'pending').length;
  int get archivageCount =>
      requests.where((r) => r.isArchivage).length;
  int get desarchivageCount =>
      requests.where((r) => !r.isArchivage).length;
  int get approvedCount =>
      requests.where((r) => r.status == 'approved').length;
  int get rejectedCount =>
      requests.where((r) => r.status == 'rejected').length;

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  @override
  void onInit() {
    super.onInit();
    load();
    _connectSocket();
    _startPolling();
  }

  @override
  void onClose() {
    // Hyphen events (current backend)
    _socket.off('archive-request-created');
    _socket.off('archive-request-approved');
    _socket.off('archive-request-rejected');
    // Underscore events (legacy fallback)
    _socket.off('archive_request:message');
    _socket.off('archive_request:approved');
    _socket.off('archive_request:rejected');
    _polling.stop();
    messageCtrl.dispose();
    super.onClose();
  }

  // ── Load — direct Dio call with full logs ──────────────────────────────────
  Future<void> load() async {
    await loadArchiveRequests();
    if (isAdmin) await loadStats();
  }

  Future<void> loadStats() async {
    stats.value = await _service.fetchStats();
  }

  Future<void> loadArchiveRequests() async {
    loading.value = true;

    final token    = _auth.accessToken;
    final endpoint = isAdmin ? '/archive-requests/admin' : '/archive-requests/my';

    debugPrint('LOAD ARCHIVE REQUESTS');
    debugPrint('TOKEN = $token');
    debugPrint('ENDPOINT = $endpoint');

    try {
      final response = await ApiClient.instance.dio.get(endpoint);

      debugPrint('STATUS = ${response.statusCode}');
      debugPrint('DATA = ${response.data}');

      if (response.data is List) {
        requests.value = List<ArchiveRequest>.from(
          (response.data as List).map((e) => ArchiveRequest.fromJson(
            e is Map ? Map<String, dynamic>.from(e) : {},
          )),
        );
      } else if (response.data is Map) {
        // Backend wrapped the list in an object key
        final map = response.data as Map;
        List raw = [];
        for (final key in ['data', 'requests', 'items', 'results', 'docs']) {
          if (map[key] is List) { raw = map[key] as List; break; }
        }
        requests.value = raw
            .whereType<Map>()
            .map((e) => ArchiveRequest.fromJson(Map<String, dynamic>.from(e)))
            .toList();
      } else {
        requests.value = [];
      }

      debugPrint('REQUEST COUNT = ${requests.length}');
      _recalcUnread();
    } catch (e) {
      debugPrint('[ArchiveReq] loadArchiveRequests error: $e');
      requests.value = [];
    } finally {
      loading.value = false;
    }
  }

  // ── Create new request ─────────────────────────────────────────────────────
  Future<bool> createRequest({
    required String projectId,
    required String projectName,
    required String message,
    String type = 'DESARCHIVAGE',
  }) async {
    sending.value = true;
    final label = type == 'ARCHIVAGE' ? 'archivage' : 'désarchivage';
    final subject = 'Demande de $label - $projectName';
    try {
      final req = await _service.create(
        projectId: projectId,
        subject:   subject,
        message:   message,
        type:      type,
      );
      requests.insert(0, req);
      _recalcUnread();
      _safeSnack('Demande envoyée à l\'administrateur', isError: false);
      return true;
    } catch (e) {
      debugPrint('[ArchiveReq] create error: $e');
      _handleError(e, fallback: 'Impossible d\'envoyer la demande');
      return false;
    } finally {
      sending.value = false;
    }
  }

  // ── Select request ─────────────────────────────────────────────────────────
  void selectRequest(String id) {
    selectedId.value = id;
    final req = requests.firstWhereOrNull((r) => r.id == id);
    if (req != null) {
      for (final msg in req.messages) {
        if (msg.senderId != currentUserId) msg.isRead = true;
      }
      _recalcUnread();
      requests.refresh();
    }
  }

  // ── Send chat message ──────────────────────────────────────────────────────
  Future<void> sendMessage() async {
    final text = messageCtrl.text.trim();
    final requestId = selectedId.value;
    if (text.isEmpty || requestId == null) return;
    sending.value = true;
    messageCtrl.clear();
    try {
      final msg = await _service.addMessage(requestId, text);
      _appendMessage(requestId, msg);
    } catch (e) {
      debugPrint('[ArchiveReq] sendMessage error: $e');
      _handleError(e, fallback: 'Impossible d\'envoyer le message');
    } finally {
      sending.value = false;
    }
  }

  // ── Admin approve ──────────────────────────────────────────────────────────
  Future<void> approveRequest(String requestId) async {
    try {
      await _service.approve(requestId);
      _updateStatus(requestId, 'approved');
      final req = requests.firstWhereOrNull((r) => r.id == requestId);
      if (req != null) {
        if (Get.isRegistered<PipelineProvider>()) {
          await PipelineProvider.to.restoreProject({'id': req.projectId});
        }
        _showApprovedDialog(req.projectName);
      }
      await load(); // refresh list
    } catch (e) {
      debugPrint('[ArchiveReq] approve error: $e');
      _handleError(e, fallback: 'Erreur lors de l\'approbation');
    }
  }

  // ── Admin reject ───────────────────────────────────────────────────────────
  Future<void> rejectRequest(String requestId, {String? reason}) async {
    try {
      await _service.reject(requestId, reason: reason);
      _updateStatus(requestId, 'rejected');
      await load(); // refresh list
    } catch (e) {
      debugPrint('[ArchiveReq] reject error: $e');
      _handleError(e, fallback: 'Erreur lors du refus');
    }
  }

  // ── Admin delete ───────────────────────────────────────────────────────────
  Future<void> deleteRequest(String requestId) async {
    try {
      await _service.deleteRequest(requestId);
      requests.removeWhere((r) => r.id == requestId);
      _recalcUnread();
    } catch (e) {
      debugPrint('[ArchiveReq] delete error: $e');
      _handleError(e, fallback: 'Erreur lors de la suppression');
    }
  }

  // ── Socket.IO ──────────────────────────────────────────────────────────────
  void _connectSocket() {
    final token = _auth.accessToken;
    if (token == null) return;
    try {
      _socket.connect(ApiConfig.wsBaseUrl, token);

      // ── Hyphen events (current backend convention) ────────────────────────
      _socket.on('archive-request-created',  (_) => loadArchiveRequests());
      _socket.on('archive-request-approved', (_) => loadArchiveRequests());
      _socket.on('archive-request-rejected', (_) => loadArchiveRequests());

      // ── Underscore/colon events (legacy fallback) ─────────────────────────
      _socket.on('archive_request:message', (data) {
        if (data is! Map) return;
        final rid = data['requestId']?.toString();
        final raw = data['message'];
        if (rid == null || raw is! Map) return;
        _appendMessage(rid,
            ArchiveRequestMessage.fromJson(Map<String, dynamic>.from(raw)));
      });

      _socket.on('archive_request:approved', (data) {
        if (data is! Map) return;
        final rid = data['requestId']?.toString();
        if (rid == null) return;
        _updateStatus(rid, 'approved');
        final req = requests.firstWhereOrNull((r) => r.id == rid);
        if (req != null) {
          if (Get.isRegistered<PipelineProvider>()) {
            PipelineProvider.to.restoreProject({'id': req.projectId});
          }
          _showApprovedDialog(req.projectName);
        }
        loadArchiveRequests();
      });

      _socket.on('archive_request:rejected', (data) {
        if (data is! Map) return;
        final rid = data['requestId']?.toString();
        if (rid != null) {
          _updateStatus(rid, 'rejected');
          loadArchiveRequests();
        }
      });
    } catch (e) {
      debugPrint('[ArchiveReq] socket init failed: $e');
    }
  }

  // ── Polling fallback (15s) ─────────────────────────────────────────────────
  void _startPolling() {
    _polling.start(
      interval: const Duration(seconds: 15),
      onTick: () async {
        if (!_socket.isConnected) await _silentRefresh();
      },
    );
  }

  Future<void> _silentRefresh() async {
    try {
      await loadArchiveRequests();
    } catch (_) {}
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  void _appendMessage(String requestId, ArchiveRequestMessage msg) {
    final idx = requests.indexWhere((r) => r.id == requestId);
    if (idx < 0) return;
    if (requests[idx].messages.any((m) => m.id == msg.id)) return;
    requests[idx].messages.add(msg);
    if (selectedId.value == requestId && msg.senderId != currentUserId) {
      msg.isRead = true;
    }
    _recalcUnread();
    requests.refresh();
  }

  void _updateStatus(String requestId, String status) {
    final idx = requests.indexWhere((r) => r.id == requestId);
    if (idx < 0) return;
    requests[idx].status = status;
    requests.refresh();
    if (status == 'approved') lastApprovedAt.value = DateTime.now();
  }

  void _recalcUnread() {
    int count = 0;
    for (final req in requests) {
      for (final msg in req.messages) {
        if (!msg.isRead && msg.senderId != currentUserId) count++;
      }
    }
    unreadTotal.value = count;
  }

  // ── Safe snackbar — never crashes, never uses !, closes previous if open ───
  void _safeSnack(String message, {bool isError = false}) {
    if (Get.isSnackbarOpen == true) {
      Get.closeCurrentSnackbar();
    }
    Get.snackbar(
      'Information',
      message,
      snackPosition: SnackPosition.BOTTOM,
      duration: const Duration(seconds: 4),
    );
  }

  // ── Error handler — no !, logs everything, handles 409 ───────────────────
  void _handleError(Object e, {required String fallback}) {
    String msg = fallback;

    if (e is DioException) {
      // ignore: avoid_print
      print('ERROR RESPONSE = ${e.response?.data}');

      msg = e.response?.data?['message']?.toString() ??
            e.response?.data?['error']?.toString() ??
            fallback;

      // ignore: avoid_print
      print('ERROR MESSAGE = $msg');

      if ((e.response?.statusCode ?? 0) == 409) {
        msg = 'Une demande en attente existe déjà pour ce projet';
      }
    }

    _safeSnack(msg, isError: true);
  }

  void _showApprovedDialog(String projectName) {
    if (Get.isDialogOpen ?? false) return;
    // GetxController n'a pas de BuildContext propre (pas de fallback
    // showDialog possible ici) — on vérifie donc Get.context avant d'appeler
    // Get.dialog, jamais `Get.context!`. Si null, on renonce silencieusement
    // plutôt que de crasher (l'approbation a déjà réussi côté serveur).
    if (Get.context == null) return;
    Get.dialog(
      Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: const BoxDecoration(
                color: Color(0xFFDCFCE7),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.check_circle_rounded,
                  color: Color(0xFF16A34A), size: 48),
            ),
            const SizedBox(height: 20),
            Text('Projet désarchivé',
                style: tInter(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: kCrmText)),
            const SizedBox(height: 8),
            Text(
              'Le projet "$projectName" a été restauré avec succès.',
              textAlign: TextAlign.center,
              style: tInter(fontSize: 14, color: kCrmTextSub),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () => Get.back(),
              style: ElevatedButton.styleFrom(
                backgroundColor: kCrmPrimary,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)),
                padding: const EdgeInsets.symmetric(
                    horizontal: 32, vertical: 12),
              ),
              child: Text('OK',
                  style: tInter(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                      fontSize: 14)),
            ),
          ]),
        ),
      ),
    );
  }
}
