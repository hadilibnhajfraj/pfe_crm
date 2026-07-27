import 'package:dio/dio.dart';
import 'package:get/get.dart'; // 🔥 IMPORTANT
import 'package:dash_master_toolkit/application/users/model/commercial_contact_models.dart';
import 'package:dash_master_toolkit/core/config/api_config.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';

class CommercialContactApi {
  CommercialContactApi._();
  static final instance = CommercialContactApi._();

  final Dio _dio = Dio(
    BaseOptions(
      baseUrl: ApiConfig.baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 20),
    ),
  );

  Map<String, String> _authHeaders() {
    final token = AuthService().accessToken ?? "";
    return {
      "Authorization": "Bearer $token",
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
  }

  Future<Map<String, dynamic>> createContact(
      CommercialContactCreateDto dto) async {
    
    // 🔥 1. récupérer user_nom
    final userNom = Get.find<AuthService>().getUserName();

    // 🔥 2. convertir DTO en JSON
    final data = dto.toJson();

    // 🔥 3. injecter user_nom
    data["user_nom"] = userNom;

    // 🔥 DEBUG (optionnel)
    print("📤 SEND CONTACT DATA: $data");

    final res = await _dio.post(
      "/commercial-contacts",
      data: data,
      options: Options(headers: _authHeaders()),
    );

    return Map<String, dynamic>.from(res.data);
  }
}