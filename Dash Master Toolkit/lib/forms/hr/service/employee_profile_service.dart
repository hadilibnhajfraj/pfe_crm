// lib/forms/hr/service/employee_profile_service.dart
//
// Lecture du profil employé connecté (auto-remplissage du module RH) +
// administration du profil RH d'un autre utilisateur (matricule/
// qualification/departement/service), réservée aux admin/superadmin.

import 'package:dash_master_toolkit/providers/api_client.dart';
import '../model/employee_profile_model.dart';

class HrUserRef {
  final String id;
  final String email;
  final String role;
  const HrUserRef({required this.id, required this.email, required this.role});

  factory HrUserRef.fromJson(Map<String, dynamic> json) => HrUserRef(
        id: (json['id'] ?? '').toString(),
        email: (json['email'] ?? '').toString(),
        role: (json['role'] ?? '').toString(),
      );
}

class EmployeeProfileService {
  static final EmployeeProfileService instance = EmployeeProfileService._();
  EmployeeProfileService._();

  Future<EmployeeProfileModel> fetchMyProfile() async {
    final res = await ApiClient.instance.dio.get('/users/me/profile');
    return EmployeeProfileModel.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<List<HrUserRef>> fetchAllUsers() async {
    final res = await ApiClient.instance.dio.get('/users');
    final list = (res.data as List).cast<Map>().map((e) => Map<String, dynamic>.from(e));
    return list.map(HrUserRef.fromJson).toList();
  }

  Future<EmployeeProfileModel> fetchUserProfile(String userId) async {
    final res = await ApiClient.instance.dio.get('/users/$userId/profile');
    return EmployeeProfileModel.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<void> updateUserProfile(String userId, EmployeeProfileModel profile) async {
    await ApiClient.instance.dio.put('/users/$userId/profile', data: profile.toJson());
  }
}
