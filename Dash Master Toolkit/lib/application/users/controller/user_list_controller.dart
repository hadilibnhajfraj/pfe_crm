import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:dash_master_toolkit/application/services/admin_users_service.dart';
import 'package:dash_master_toolkit/application/common/safe_snack.dart';
import 'package:dash_master_toolkit/application/users/users_imports.dart';
import '../model/user_model.dart';
import 'package:dash_master_toolkit/utils/user_roles.dart';

class UserListController extends GetxController {
  TextEditingController searchController = TextEditingController();
  FocusNode f1 = FocusNode();

  final RxBool loading = false.obs;
  final RxList<UserModel> users = <UserModel>[].obs;

  @override
  void onInit() {
    super.onInit();
    loadUsers();
  }

  Future<void> loadUsers() async {
    loading.value = true;
    try {
      final list = await AdminUsersService.instance.fetchUsers();
      final counts = await AdminUsersService.instance.fetchUsersProjectsCount();

      final Map<String, int> countByUserId = {
        for (final c in counts)
          (c['userId'] ?? '').toString():
              int.tryParse((c['projectsCount'] ?? '0').toString()) ?? 0
      };

      final List<UserModel> mapped = list.map<UserModel>((u) {
        final id = (u['id'] ?? '').toString();
        final email = (u['email'] ?? '').toString();
        // Vocabulaire des rôles v2 : rôle par défaut "commercial" (plus "user").
        final role = (u['role'] ?? 'commercial').toString();
        final isActive = (u['isActive'] ?? false) == true;

        final name = email.contains('@') ? email.split('@').first : email;
        final projectsCount = countByUserId[id] ?? 0;

        return UserModel(
          id: id,
          name: name.isEmpty ? 'User' : name,
          role: role,
          designation: userRoleLabel(role),
          department: "$projectsCount projets",
          email: email,
          phone: "Voir",
          status: isActive ? 'Active' : 'Inactive',

          // ✅ IMPORTANT
          imageUrl: isActive ? profileIcon1 : profileIcon2,
        );
      }).toList();

      // ✅ FIX IMPORTANT
      users.assignAll(mapped);

    } catch (e) {
      SafeSnack.show(
        "Error",
        e.toString().replaceFirst('Exception: ', ''),
        isError: true,
      );
    } finally {
      loading.value = false;
    }
  }

  Future<List<Map<String, dynamic>>> fetchProjectsOfUser(String userId) async {
    try {
      return await AdminUsersService.instance.fetchProjectsByUserId(userId);
    } catch (e) {
      SafeSnack.show(
        "Error",
        e.toString().replaceFirst('Exception: ', ''),
        isError: true,
      );
      return [];
    }
  }

  Future<void> toggleActive(UserModel user) async {
    try {
      final newValue = !user.isActive;
      await AdminUsersService.instance.setActive(user.id, newValue);

      final idx = users.indexWhere((x) => x.id == user.id);

      if (idx != -1) {
        users[idx] = users[idx].copyWith(
          status: newValue ? "Active" : "Inactive",

          // ✅ IMPORTANT
          imageUrl: newValue ? profileIcon1 : profileIcon2,
        );
      }

      SafeSnack.show("Success", "User updated");
    } catch (e) {
      SafeSnack.show(
        "Error",
        e.toString().replaceFirst('Exception: ', ''),
        isError: true,
      );
    }
  }

  // Règle E : attribution d'un des 7 rôles réels (ex. commercial_sedentaire
  // lors de l'activation d'un compte inscrit comme "commercial").
  Future<void> changeRole(UserModel user, String newRole) async {
    if (newRole == user.role) return;
    try {
      await AdminUsersService.instance.setRole(user.id, newRole);

      final idx = users.indexWhere((x) => x.id == user.id);
      if (idx != -1) {
        users[idx] = users[idx].copyWith(
          role: newRole,
          designation: userRoleLabel(newRole),
        );
      }

      SafeSnack.show(
        "Success",
        "Rôle mis à jour : ${userRoleLabel(newRole)} (effectif à la prochaine connexion)",
      );
    } catch (e) {
      SafeSnack.show(
        "Error",
        e.toString().replaceFirst('Exception: ', ''),
        isError: true,
      );
    }
  }

  @override
  void onClose() {
    searchController.dispose();
    f1.dispose();
    super.onClose();
  }
}