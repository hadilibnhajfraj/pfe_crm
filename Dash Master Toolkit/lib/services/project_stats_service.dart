import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:dash_master_toolkit/application/users/model/project_stats_model.dart';

class ProjectStatsService {
  final String baseUrl;

  ProjectStatsService({required this.baseUrl});

  Future<List<UserProjectSummary>> fetchProjectsPerUserSummary({
    required String token,
  }) async {
    final uri = Uri.parse('$baseUrl/projects/kpi/projects-per-user-summary');

    final response = await http.get(
      uri,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
    );

    if (response.statusCode != 200) {
      throw Exception('Erreur API: ${response.statusCode} - ${response.body}');
    }

    final data = jsonDecode(response.body);

    if (data is! List) {
      throw Exception('Format JSON invalide');
    }

    return data
        .map((e) => UserProjectSummary.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }
}