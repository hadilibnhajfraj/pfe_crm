import 'package:dio/dio.dart';
import 'package:dash_master_toolkit/application/services/api_client.dart';

class AdminUsersService {
  AdminUsersService._();
  static final AdminUsersService instance = AdminUsersService._();

  Future<List<Map<String, dynamic>>> fetchUsers() async {
    try {
      final res = await ApiClient.instance.dio.get('/admin/users');

      if (res.data is List) {
        return (res.data as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      }
      return [];
    } on DioException catch (e) {
      throw Exception(_dioMessage(e));
    }
  }

  Future<void> setActive(String userId, bool active) async {
    try {
      await ApiClient.instance.dio.put(
        '/admin/users/$userId/active',
        data: {'active': active},
      );
    } on DioException catch (e) {
      throw Exception(_dioMessage(e));
    }
  }

  // ✅ ADMIN: count projects per user
  // GET /projects/admin/users-projects-count
  Future<List<Map<String, dynamic>>> fetchUsersProjectsCount() async {
    try {
      final res = await ApiClient.instance.dio.get('/projects/admin/users-projects-count');

      if (res.data is List) {
        return (res.data as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      }
      return [];
    } on DioException catch (e) {
      throw Exception(_dioMessage(e));
    }
  }

  // ✅ ADMIN: projects list of a user
  // GET /projects/admin/user/:userId/projects
  Future<List<Map<String, dynamic>>> fetchProjectsByUserId(String userId) async {
    try {
      final res = await ApiClient.instance.dio.get('/projects/admin/user/$userId/projects');

      if (res.data is List) {
        return (res.data as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      }
      return [];
    } on DioException catch (e) {
      throw Exception(_dioMessage(e));
    }
  }

  String _dioMessage(DioException e) {
    final status = e.response?.statusCode;
    final data = e.response?.data;

    final msg = (data is Map && data['message'] != null)
        ? data['message'].toString()
        : (status != null ? 'HTTP $status' : 'Erreur réseau (backend inaccessible)');

    return msg;
  }
}