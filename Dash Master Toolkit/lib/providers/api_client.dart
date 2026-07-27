// lib/providers/api_client.dart
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:get_storage/get_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:dash_master_toolkit/core/config/api_config.dart';

class ApiClient {
  ApiClient._internal() {
    final envUrl = const String.fromEnvironment('API_BASE_URL', defaultValue: '');

    final baseUrl = envUrl.isNotEmpty ? envUrl : ApiConfig.baseUrl;

    _box = GetStorage();

    _dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
        // Do NOT set Content-Type here. Dio sets it automatically:
        //   • Map/List  → application/json
        //   • FormData  → multipart/form-data; boundary=<uuid>
        // A global Content-Type: application/json overrides the multipart
        // boundary and causes Multer / Express to reject FormData with 400.
        headers: const {
          'Accept': 'application/json',
        },
      ),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          // ✅ Token depuis GetStorage
          final token = _box.read<String>('accessToken');
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }

          // Belt-and-suspenders: if FormData slipped through with a stale
          // Content-Type header, remove it so Dio can set the correct
          // multipart/form-data value with the boundary.
          if (options.data is FormData) {
            options.headers.remove('Content-Type');
          }

          // ✅ IMPORTANT (Web) pour cookies refresh si backend envoie Set-Cookie
          if (kIsWeb) {
            options.extra['withCredentials'] = true;
          }

          if (kDebugMode) {
            debugPrint("➡️ [${options.method}] ${options.baseUrl}${options.path}");
            debugPrint("Headers: ${options.headers}");
            if (options.data != null) debugPrint("Body: ${options.data}");
          }

          return handler.next(options);
        },
        onResponse: (response, handler) {
          if (kDebugMode) {
            debugPrint("✅ Response [${response.statusCode}] ${response.requestOptions.path}");
            debugPrint("Data: ${response.data}");
          }
          return handler.next(response);
        },
        onError: (DioException e, handler) async {
          if (kDebugMode) {
            debugPrint("❌ DioError: ${e.message}");
            if (e.response != null) {
              debugPrint("Status: ${e.response?.statusCode}");
              debugPrint("Data: ${e.response?.data}");
            }
          }

          // ✅ si 401 => clear session
          final status = e.response?.statusCode;
          if (status == 401) {
            await clearAuth();
          }

          return handler.next(e);
        },
      ),
    );
  }

  static final ApiClient instance = ApiClient._internal();

  late final Dio _dio;
  late final GetStorage _box;

  Dio get dio => _dio;
// =====================================================
// ✅ Set/Clear Authorization header instantly
// =====================================================
void setToken(String token) {
  // met le header pour toutes les prochaines requêtes
  _dio.options.headers["Authorization"] = "Bearer $token";

  // optionnel: garde aussi dans GetStorage pour ton interceptor onRequest
  _box.write('accessToken', token);
  _box.write('isLoggedIn', true);
}

void clearToken() {
  _dio.options.headers.remove("Authorization");
}
  // =====================================================
  // ✅ Helpers Token
  // =====================================================
  String? getAccessToken() => _box.read<String>('accessToken');

  Future<void> setAccessToken(String token) async {
    await _box.write('accessToken', token);
    await _box.write('isLoggedIn', true);
  }

  // =====================================================
  // ✅ Clear Auth (GetStorage + SharedPreferences)
  // =====================================================
  Future<void> clearAuth() async {
    // GetStorage
    await _box.remove('accessToken');
    await _box.write('isLoggedIn', false);
    await _box.remove('userId');
    await _box.remove('userEmail');
    await _box.remove('userRole');

    // SharedPreferences (si tu l’utilises ailleurs)
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove("accessToken");
    await prefs.remove("refreshToken");
    await prefs.remove("token");
  }
}
