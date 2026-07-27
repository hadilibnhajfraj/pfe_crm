import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:dash_master_toolkit/application/users/model/client_model.dart';
import 'package:dash_master_toolkit/core/config/api_config.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';

class ClientService {
  static const String baseUrl = '${ApiConfig.baseUrl}/api/clients';

  Future<String?> getRole() async {
    final role = AuthService().userRole;
    print('ROLE LU DEPUIS AUTHSERVICE = $role');
    return role;
  }

  Future<List<ClientModel>> getAllClients() async {
    final token = AuthService().accessToken;

    print('TOKEN LU DEPUIS AUTHSERVICE = $token');

    final response = await http.get(
      Uri.parse('$baseUrl/all'),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
      },
    );

    print('STATUS CLIENTS = ${response.statusCode}');
    print('BODY CLIENTS = ${response.body}');

    if (response.statusCode == 200) {
      final decoded = jsonDecode(response.body);

      if (decoded is List) {
        return decoded.map((e) => ClientModel.fromJson(e)).toList();
      }

      if (decoded is Map && decoded['clients'] is List) {
        return (decoded['clients'] as List)
            .map((e) => ClientModel.fromJson(e))
            .toList();
      }

      return [];
    } else {
      throw Exception('Erreur chargement clients : ${response.body}');
    }
  }
}