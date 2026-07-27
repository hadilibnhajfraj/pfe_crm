import 'dart:convert'; // ✅ AJOUT
import 'package:dio/dio.dart';
import 'package:http/http.dart' as http; // ✅ AJOUT

import 'package:dash_master_toolkit/providers/api_client.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';

import '../tables/model/project_map_item.dart';
import 'package:dash_master_toolkit/dashboard/academic/model/kpi_model.dart';

class KPIService {
  final String baseUrl;

  KPIService({required this.baseUrl});

  // =========================
  // 📍 MAP PROJECTS (DIO)
  // =========================
  static Future<List<ProjectMapItem>> fetchMapProjects() async {
    final token = AuthService().accessToken;

    final res = await ApiClient.instance.dio.get(
      "/projects/kpi/map-projects",
      options: token == null || token.isEmpty
          ? null
          : Options(headers: {"Authorization": "Bearer $token"}),
    );

    final data = res.data;

    if (data is List) {
      return data
          .map((e) => ProjectMapItem.fromJson(
                Map<String, dynamic>.from(e),
              ))
          .toList();
    }

    if (data is Map && data["items"] is List) {
      final list = data["items"] as List;

      return list
          .map((e) => ProjectMapItem.fromJson(
                Map<String, dynamic>.from(e),
              ))
          .toList();
    }

    throw Exception("Format API invalide: ${data.runtimeType}");
  }

  // =========================
  // 📊 KPI DASHBOARD (HTTP)
  // =========================
  Future<dynamic> fetchKPI(String token, {String? userId}) async {

    /// ✅ BUILD URL
    final uri = Uri.parse("$baseUrl/projects/dashboard/kpi").replace(
      queryParameters: userId != null ? {"userId": userId} : null,
    );

    final res = await http.get(
      uri,
      headers: {
        "Authorization": "Bearer $token",
        "Content-Type": "application/json",
      },
    );

    if (res.statusCode != 200) {
      throw Exception("Error KPI: ${res.body}");
    }

    return KPIModel.fromJson(jsonDecode(res.body));;
  }
}