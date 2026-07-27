import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:dash_master_toolkit/core/config/api_config.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';

class UserApi {

  static const String baseUrl = '${ApiConfig.baseUrl}/projects';


  /// ROLE UTILISATEUR

  Future<String?> getRole() async {
    final role = AuthService().userRole;
    return role;
  }


  /// DASHBOARD COMMERCIAL

  Future<List<dynamic>> getCommercialDashboard() async {

    final token = AuthService().accessToken;

    print('TOKEN DASHBOARD = $token');

    final response = await http.get(

      Uri.parse('$baseUrl/dashboard/commercial'),

      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        if (token != null && token.isNotEmpty)
          'Authorization': 'Bearer $token',
      },

    );

    print('STATUS DASHBOARD = ${response.statusCode}');
    print('BODY DASHBOARD = ${response.body}');

    if (response.statusCode == 200) {

      final decoded = jsonDecode(response.body);

      if (decoded is List) {
        return decoded;
      }

      if (decoded is Map && decoded['data'] is List) {
        return decoded['data'];
      }

      return [];

    } else {

      throw Exception('Erreur dashboard commercial : ${response.body}');

    }

  }


  /// PROJETS PAR UTILISATEUR

  Future<Map<String,dynamic>> getUserProjects(String id) async {

    final token = AuthService().accessToken;

    print('TOKEN USER PROJECTS = $token');

    final response = await http.get(

      Uri.parse('$baseUrl/$id/projects'),

      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        if (token != null && token.isNotEmpty)
          'Authorization': 'Bearer $token',
      },

    );

    print('STATUS USER PROJECTS = ${response.statusCode}');
    print('BODY USER PROJECTS = ${response.body}');

    if (response.statusCode == 200) {

      return jsonDecode(response.body);

    } else {

      throw Exception('Erreur chargement projets utilisateur : ${response.body}');

    }

  }

}