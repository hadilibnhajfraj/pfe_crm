import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:dash_master_toolkit/application/users/model/user_project_model.dart';
import 'package:dash_master_toolkit/application/users/model/user_projects_response.dart';
class UserProjectService {
  final String baseUrl;

  UserProjectService({required this.baseUrl});

  Future<UserProjectsResponse> fetchMyProjects({
    required String token,
    String? architecte,
    String? promoteur,
    String? ingenieur,
    String? createdBy,
    String? societe,
    String? q,
      String? statut, // 🔥 AJOUT ICI
    /// ✅ NEW
    String? projectModele,

    int page = 1,
    int limit = 10,
  }) async {

    final queryParams = <String, String>{
      'page': page.toString(),
      'limit': limit.toString(),
    };
    if (statut != null && statut.isNotEmpty) {
  queryParams["statut"] = statut;
}
    /// ✅ FILTERS
    if ((architecte ?? '').trim().isNotEmpty) {
      queryParams['architecte'] = architecte!.trim();
    }

    if ((promoteur ?? '').trim().isNotEmpty) {
      queryParams['promoteur'] = promoteur!.trim();
    }

    if ((ingenieur ?? '').trim().isNotEmpty) {
      queryParams['ingenieur'] = ingenieur!.trim();
    }

    if ((societe ?? '').trim().isNotEmpty) {
      queryParams['societe'] = societe!.trim();
    }

    if ((q ?? '').trim().isNotEmpty) {
      queryParams['q'] = q!.trim();
    }

    if ((createdBy ?? '').trim().isNotEmpty) {
      queryParams['createdBy'] = createdBy!;
    }

    /// ✅ NEW FILTER (PROJECT MODELE)
    if ((projectModele ?? '').trim().isNotEmpty) {
      queryParams['projectModele'] = projectModele!.trim();
    }

    /// ✅ URL
    final uri = Uri.parse('$baseUrl/projects/my-projects')
        .replace(queryParameters: queryParams);

    print("➡️ REQUEST URL: $uri");

    /// ✅ CALL API
    final response = await http.get(
      uri,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
    );

    print("⬅️ STATUS: ${response.statusCode}");
    print("⬅️ BODY: ${response.body}");

    if (response.statusCode != 200) {
      throw Exception(
        'API Error: ${response.statusCode} - ${response.body}',
      );
    }

    final decoded = jsonDecode(response.body);

    return UserProjectsResponse.fromJson(
      Map<String, dynamic>.from(decoded),
    );
  }
}