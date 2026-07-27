import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:dash_master_toolkit/services/user_api.dart';

class UserProjectController extends GetxController {

  final api = UserApi();

  /// SEARCH
  final TextEditingController searchController = TextEditingController();

  RxList<Map<String,dynamic>> users = <Map<String,dynamic>>[].obs;
  RxList<Map<String,dynamic>> filteredUsers = <Map<String,dynamic>>[].obs;
  RxList<Map<String,dynamic>> projects = <Map<String,dynamic>>[].obs;

  RxInt total = 0.obs;
  RxBool loading = false.obs;

  /// DASHBOARD
  Future<void> loadDashboard() async {

    try {

      loading.value = true;

      final data = await api.getCommercialDashboard();

      if (data is List) {

        users.assignAll(
          data.map((e) => Map<String,dynamic>.from(e)).toList(),
        );

      }

      filteredUsers.assignAll(users);

    } catch(e) {

      print("Dashboard error: $e");

    } finally {

      loading.value = false;

    }

  }

  /// USER PROJECTS
  Future<void> loadUserProjects(String id) async {

    try {

      loading.value = true;

      final data = await api.getUserProjects(id);

      if (data is Map) {

        total.value = data["totalProjects"] ?? 0;

        final list = data["projects"];

        if (list is List) {

          projects.assignAll(
            list.map((e)=>Map<String,dynamic>.from(e)).toList(),
          );

        }

      }

    } finally {

      loading.value = false;

    }

  }

  /// FILTER USERS
  void filterUsers(String query){

    if(query.isEmpty){
      filteredUsers.assignAll(users);
      return;
    }

    final q = query.toLowerCase();

    filteredUsers.assignAll(

      users.where((u){

        final email = (u["email"] ?? "").toString().toLowerCase();

        return email.contains(q);

      }).toList(),

    );

  }

}