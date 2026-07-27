// lib/providers/maintenance_request_provider.dart
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/models/maintenance_request_model.dart';
import 'package:dash_master_toolkit/services/maintenance_request_service.dart';
import 'package:dash_master_toolkit/services/socket_service.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'package:dash_master_toolkit/core/config/api_config.dart';

class MaintenanceRequestProvider extends GetxController {
  static MaintenanceRequestProvider get to {
    if (!Get.isRegistered<MaintenanceRequestProvider>()) {
      Get.put(MaintenanceRequestProvider());
    }
    return Get.find<MaintenanceRequestProvider>();
  }

  final _service = MaintenanceRequestService.instance;
  final _socket = SocketService.instance;
  final _polling = PollingService();
  final _auth = AuthService();

  final requests = <MaintenanceRequest>[].obs;
  final technicians = <MaintenanceTechnician>[].obs;
  final loading = true.obs;
  final sending = false.obs;
  final stats = <String, int>{}.obs;

  bool get canManage => _auth.canManageMaintenanceRequests;

  int get pendingCount => requests.where((r) => r.isEnAttente).length;
  int get acceptedCount => requests.where((r) => r.isAcceptee).length;
  int get enCoursCount => requests.where((r) => r.isEnCours).length;
  int get rejectedCount => requests.where((r) => r.isRefusee).length;
  int get completedCount => requests.where((r) => r.isTerminee).length;

  @override
  void onInit() {
    super.onInit();
    load();
    _connectSocket();
    _startPolling();
  }

  @override
  void onClose() {
    _socket.off('maintenance-request-created');
    _socket.off('maintenance-request-accepted');
    _socket.off('maintenance-request-rejected');
    _socket.off('maintenance-request-assigned');
    _socket.off('maintenance-request-started');
    _socket.off('maintenance-request-completed');
    _polling.stop();
    super.onClose();
  }

  Future<void> load() async {
    await loadRequests();
    if (canManage) {
      await loadStats();
      await loadTechnicians();
    }
  }

  Future<void> loadRequests() async {
    loading.value = true;
    try {
      requests.value = canManage ? await _service.fetchAll() : await _service.fetchMy();
    } catch (e) {
      debugPrint('[MaintenanceReq] loadRequests error: $e');
      requests.value = [];
    } finally {
      loading.value = false;
    }
  }

  Future<void> loadStats() async {
    stats.value = await _service.fetchStats();
  }

  Future<void> loadTechnicians() async {
    technicians.value = await _service.fetchTechnicians();
  }

  Future<bool> createRequest({
    required String equipement,
    required String typePanne,
    required String urgence,
    required String description,
    List<MaintenancePhotoFile> photos = const [],
  }) async {
    sending.value = true;
    try {
      final req = await _service.create(
        equipement: equipement,
        typePanne: typePanne,
        urgence: urgence,
        description: description,
        photos: photos,
      );
      requests.insert(0, req);
      _safeSnack('Demande de maintenance envoyée');
      return true;
    } catch (e) {
      debugPrint('[MaintenanceReq] create error: $e');
      _handleError(e, fallback: 'Impossible d\'envoyer la demande');
      return false;
    } finally {
      sending.value = false;
    }
  }

  Future<void> acceptRequest(String id) async {
    try {
      await _service.accept(id);
      await load();
      _safeSnack('Demande acceptée');
    } catch (e) {
      _handleError(e, fallback: 'Erreur lors de l\'acceptation');
    }
  }

  Future<void> rejectRequest(String id, {String? reason}) async {
    try {
      await _service.reject(id, reason: reason);
      await load();
      _safeSnack('Demande refusée');
    } catch (e) {
      _handleError(e, fallback: 'Erreur lors du refus');
    }
  }

  Future<void> assignTechnician(String id, String technicianId) async {
    try {
      await _service.assign(id, technicianId);
      await load();
      _safeSnack('Technicien affecté');
    } catch (e) {
      _handleError(e, fallback: 'Erreur lors de l\'affectation');
    }
  }

  Future<void> startRequest(String id) async {
    try {
      await _service.start(id);
      await load();
      _safeSnack('Intervention démarrée');
    } catch (e) {
      _handleError(e, fallback: 'Erreur lors du passage en cours');
    }
  }

  Future<void> completeRequest(String id) async {
    try {
      await _service.complete(id);
      await load();
      _safeSnack('Maintenance marquée terminée');
    } catch (e) {
      _handleError(e, fallback: 'Erreur lors de la clôture');
    }
  }

  Future<void> deleteRequest(String id) async {
    try {
      await _service.deleteRequest(id);
      await load();
    } catch (e) {
      _handleError(e, fallback: 'Erreur lors de la suppression');
    }
  }

  void _connectSocket() {
    final token = _auth.accessToken;
    if (token == null) return;
    try {
      _socket.connect(ApiConfig.wsBaseUrl, token);
      _socket.on('maintenance-request-created', (_) => load());
      _socket.on('maintenance-request-accepted', (_) => load());
      _socket.on('maintenance-request-rejected', (_) => load());
      _socket.on('maintenance-request-assigned', (_) => load());
      _socket.on('maintenance-request-started', (_) => load());
      _socket.on('maintenance-request-completed', (_) => load());
    } catch (e) {
      debugPrint('[MaintenanceReq] socket init failed: $e');
    }
  }

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
      await load();
    } catch (_) {}
  }

  void _safeSnack(String message) {
    if (Get.isSnackbarOpen == true) Get.closeCurrentSnackbar();
    Get.snackbar('Information', message, snackPosition: SnackPosition.BOTTOM, duration: const Duration(seconds: 4));
  }

  void _handleError(Object e, {required String fallback}) {
    String msg = fallback;
    if (e is DioException) {
      msg = e.response?.data?['message']?.toString() ?? fallback;
    }
    _safeSnack(msg);
  }
}
