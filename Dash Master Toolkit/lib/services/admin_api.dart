import 'package:dio/dio.dart';
import '../providers/api_client.dart';

class AdminApi {
  AdminApi._();
  static final AdminApi instance = AdminApi._();

 Future<List<Map<String, dynamic>>> getUsers() async {
  final res = await ApiClient.instance.dio.get('/admin/users');

  final status = res.statusCode ?? 0;
  if (status >= 400) {
    final msg = (res.data is Map && res.data['message'] != null)
        ? res.data['message'].toString()
        : 'Erreur chargement users';
    throw Exception(msg);
  }

  final data = res.data;
  if (data is List) {
    return data.map((e) => Map<String, dynamic>.from(e)).toList();
  }
  return [];
}


  Future<void> setUserActive(String userId, bool active) async {
    final res = await ApiClient.instance.dio.put(
      '/admin/users/$userId/active',
      data: {'active': active},
    );

    final status = res.statusCode ?? 0;
    if (status >= 400) {
      final msg = (res.data is Map && res.data['message'] != null)
          ? res.data['message'].toString()
          : 'Erreur activation';
      throw Exception(msg);
    }
  }
}
