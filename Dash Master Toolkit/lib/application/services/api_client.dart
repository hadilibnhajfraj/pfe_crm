import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:get_storage/get_storage.dart';
import 'package:dash_master_toolkit/core/config/api_config.dart';

class ApiClient {
  ApiClient._internal() {
    dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 20),
        receiveTimeout: const Duration(seconds: 20),
        headers: {'Content-Type': 'application/json'},
      ),
    );

    // ✅ Log (utile pour debug)
    dio.interceptors.add(
      LogInterceptor(
        requestBody: true,
        responseBody: true,
        requestHeader: true,
        responseHeader: false,
      ),
    );

    // ✅ Inject token automatiquement
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final token = _box.read<String>('accessToken');
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
      ),
    );
  }

  static final ApiClient instance = ApiClient._internal();

  // ✅ IMPORTANT :
  // - Uses centralized ApiConfig for baseUrl
  // - Automatically handles localhost (io), emulator mapping, and web

  static String get baseUrl => ApiConfig.baseUrl;

  late final Dio dio;
  final GetStorage _box = GetStorage();
}
