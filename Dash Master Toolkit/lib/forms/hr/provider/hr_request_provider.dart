// lib/forms/hr/provider/hr_request_provider.dart
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'package:dash_master_toolkit/services/socket_service.dart';
import 'package:dash_master_toolkit/core/config/api_config.dart';

import '../model/hr_request_model.dart';
import '../service/hr_request_service.dart';

class HrRequestProvider extends GetxController {
  static HrRequestProvider get to {
    if (!Get.isRegistered<HrRequestProvider>()) {
      Get.put(HrRequestProvider());
    }
    return Get.find<HrRequestProvider>();
  }

  final _service = HrRequestService.instance;
  final _socket = SocketService.instance;
  final _polling = PollingService();
  final _auth = AuthService();

  final requests = <HrRequestModel>[].obs;
  final loading = true.obs;
  final sending = false.obs;

  bool get canManage => _auth.canManageHrRequests;

  List<HrRequestModel> byType(String type) => requests.where((r) => r.type == type).toList();

  Map<String, int> statsFor(String type) {
    final startOfDay = DateTime.now();
    final today = DateTime(startOfDay.year, startOfDay.month, startOfDay.day);
    final startOfWeek = today.subtract(Duration(days: today.weekday % 7));
    final list = byType(type);
    return {
      'total': list.length,
      'enAttente': list.where((r) => r.isEnAttente).length,
      'acceptee': list.where((r) => r.isAcceptee).length,
      'refusee': list.where((r) => r.isRefusee).length,
      'traitee': list.where((r) => r.isTraitee).length,
      'today': list.where((r) {
        final d = DateTime.tryParse(r.createdAt ?? '');
        return d != null && !d.isBefore(today);
      }).length,
      'thisWeek': list.where((r) {
        final d = DateTime.tryParse(r.createdAt ?? '');
        return d != null && !d.isBefore(startOfWeek);
      }).length,
    };
  }

  @override
  void onInit() {
    super.onInit();
    load();
    _connectSocket();
    _startPolling();
  }

  @override
  void onClose() {
    _socket.off('hr-request-created');
    _socket.off('hr-request-accepted');
    _socket.off('hr-request-rejected');
    _socket.off('hr-request-processed');
    _polling.stop();
    super.onClose();
  }

  Future<void> load() async {
    loading.value = true;
    try {
      requests.value = await _service.fetchAll();
    } catch (e) {
      debugPrint('[HrRequest] load error: $e');
      requests.value = [];
    } finally {
      loading.value = false;
    }
  }

  Future<void> acceptRequest(String id, {String? comment}) async {
    try {
      await _service.accept(id, comment: comment);
      await load();
      _safeSnack('Demande acceptée');
    } catch (e) {
      _handleError(e, fallback: "Erreur lors de l'acceptation");
    }
  }

  Future<void> rejectRequest(String id, {String? comment}) async {
    try {
      await _service.reject(id, comment: comment);
      await load();
      _safeSnack('Demande refusée');
    } catch (e) {
      _handleError(e, fallback: 'Erreur lors du refus');
    }
  }

  Future<void> markProcessed(String id) async {
    try {
      await _service.markProcessed(id);
      await load();
      _safeSnack('Demande marquée comme traitée');
    } catch (e) {
      _handleError(e, fallback: 'Erreur lors du traitement');
    }
  }

  Future<void> addComment(String id, String comment) async {
    try {
      await _service.addComment(id, comment);
      await load();
      _safeSnack('Commentaire ajouté');
    } catch (e) {
      _handleError(e, fallback: "Erreur lors de l'ajout du commentaire");
    }
  }

  Future<void> deleteRequest(String id) async {
    try {
      await _service.delete(id);
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
      _socket.on('hr-request-created', (_) => load());
      _socket.on('hr-request-accepted', (_) => load());
      _socket.on('hr-request-rejected', (_) => load());
      _socket.on('hr-request-processed', (_) => load());
    } catch (e) {
      debugPrint('[HrRequest] socket init failed: $e');
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
