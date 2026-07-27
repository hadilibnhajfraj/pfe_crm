import 'package:dio/dio.dart';
import 'package:dash_master_toolkit/app_shell_route/models/notification.dart';
import 'package:dash_master_toolkit/core/config/api_config.dart';

class NotificationApi {
  NotificationApi._();
  static final instance = NotificationApi._();

  final Dio _dio = Dio(BaseOptions(
    baseUrl: ApiConfig.baseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 10),
  ));

  // =========================
  // 📥 GET NOTIFICATIONS
  // =========================
Future<NotificationResponse> getMyNotifications(
  String token, {
  int page = 1,
  int limit = 10,
}) async {
  final res = await _dio.get(
    "/notifications?page=$page&limit=$limit",
    options: Options(headers: {"Authorization": "Bearer $token"}),
  );

  print("NOTIFICATION STATUS = ${res.statusCode}");
  print("NOTIFICATION BODY = ${res.data}");

  final response = NotificationResponse.fromJson(
    res.data is Map<String, dynamic>
        ? res.data as Map<String, dynamic>
        : <String, dynamic>{},
  );

  print("NOTIFICATION COUNT API = ${response.items.length}");

  return response;
}

  // =========================
  // 🔵 MARK ALL READ
  // =========================
  Future<void> markAllRead(String token) async {
    await _dio.put(
      "/notifications/read-all", // ✅ FIX ICI
      options: Options(headers: {
        "Authorization": "Bearer $token",
      }),
    );
  }

  // =========================
  // 🔵 MARK ONE READ
  // =========================
  Future<void> markRead(String token, String id) async {
    await _dio.put(
      "/notifications/$id/read",
      options: Options(headers: {
        "Authorization": "Bearer $token",
      }),
    );
  }

  // =========================
  // 🗑 DELETE
  // =========================
  Future<void> deleteNotification(String token, String id) async {
    await _dio.delete(
      "/notifications/$id",
      options: Options(headers: {
        "Authorization": "Bearer $token",
      }),
    );
  }
}