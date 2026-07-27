import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';
import '../controller/user_project_controller.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class UsersTable extends StatelessWidget {

  UsersTable({super.key});

  final UserProjectController controller =
      Get.put(UserProjectController());

  @override
  Widget build(BuildContext context) {

    controller.loadDashboard();

    return Scaffold(

      backgroundColor: const Color(0xFFF8FAFC),

      appBar: AppBar(
        elevation: 0,
        backgroundColor: const Color(0xFF1D4ED8),
        foregroundColor: Colors.white,
        title: Text(
          AppLocalizations.of(context).translate("Commercial Dashboard"),
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),

      body: Obx(() {

        if (controller.loading.value) {
          return const Center(child: CircularProgressIndicator());
        }

        return Padding(
          padding: const EdgeInsets.all(20),

          child: ListView(

            children: [

              _buildTopCards(context),

              const SizedBox(height: 20),

              _buildSearchField(context),

              const SizedBox(height: 20),

              SizedBox(
                height: 700,
                child: _buildUsersTable(context),
              ),

            ],

          ),

        );

      }),

    );

  }

  /// KPI CARDS
  Widget _buildTopCards(BuildContext context) {

    final users = controller.filteredUsers;

    final totalUsers = users.length;

    final totalProjects =
        users.fold(0, (sum, u) => sum + (u["totalProjects"] ?? 0) as int);

    return Row(

      children: [

        Expanded(

          child: Container(

            padding: const EdgeInsets.all(20),

            decoration: BoxDecoration(

              gradient: const LinearGradient(
                colors: [Color(0xFF0F172A), Color(0xFF1E3A8A)],
              ),

              borderRadius: BorderRadius.circular(18),

            ),

            child: Column(

              crossAxisAlignment: CrossAxisAlignment.start,

              children: [

                Text(
                  AppLocalizations.of(context).translate("Total commerciaux"),
                  style: const TextStyle(color: Colors.white70),
                ),

                const SizedBox(height: 10),

                Text(
                  "$totalUsers",
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                  ),
                ),

              ],

            ),

          ),

        ),

        const SizedBox(width: 16),

        Expanded(

          child: Container(

            padding: const EdgeInsets.all(20),

            decoration: BoxDecoration(

              gradient: const LinearGradient(
                colors: [Color(0xFF0F766E), Color(0xFF14B8A6)],
              ),

              borderRadius: BorderRadius.circular(18),

            ),

            child: Column(

              crossAxisAlignment: CrossAxisAlignment.start,

              children: [

                Text(
                  AppLocalizations.of(context).translate("Total projets"),
                  style: const TextStyle(color: Colors.white70),
                ),

                const SizedBox(height: 10),

                Text(
                  "$totalProjects",
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                  ),
                ),

              ],

            ),

          ),

        ),

      ],

    );

  }

  /// SEARCH
  Widget _buildSearchField(BuildContext context) {

    return TextField(

      controller: controller.searchController,

      onChanged: (value) => controller.filterUsers(value),

      decoration: InputDecoration(

        hintText: AppLocalizations.of(context).translate("Search commercial..."),

        prefixIcon: const Icon(Icons.search),

        filled: true,

        fillColor: Colors.white,

        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),

        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: Colors.grey.shade300),
        ),

        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: Colors.grey.shade300),
        ),

      ),

    );

  }

  /// TABLE
  Widget _buildUsersTable(BuildContext context) {

    return Obx(() {

      final users = controller.filteredUsers;

      if (users.isEmpty) {

        return Container(

          decoration: BoxDecoration(

            color: Colors.white,
            borderRadius: BorderRadius.circular(18),

            boxShadow: [

              BoxShadow(
                color: Colors.black.withOpacity(0.05),
                blurRadius: 18,
                offset: const Offset(0, 4),
              )

            ],

          ),

          child: Center(
            child: Text(
              AppLocalizations.of(context).translate("No commercial found"),
              style: const TextStyle(fontSize: 16),
            ),
          ),

        );

      }

      return Container(

        decoration: BoxDecoration(

          color: Colors.white,
          borderRadius: BorderRadius.circular(18),

          boxShadow: [

            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 18,
              offset: const Offset(0, 4),
            )

          ],

        ),

        child: ClipRRect(

          borderRadius: BorderRadius.circular(18),

          child: PaginatedDataTable(

            header: Text(
              AppLocalizations.of(context).translate("Commercial list"),
              style: const TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 18,
              ),
            ),

            rowsPerPage: 10,

            availableRowsPerPage: const [10, 20, 50],

            showFirstLastButtons: true,

            headingRowColor:
                const WidgetStatePropertyAll(Color(0xFFF1F5F9)),

            columns: [

              const DataColumn(label: Text("#")),

              DataColumn(label: Text(AppLocalizations.of(context).translate("Commercial"))),

              DataColumn(label: Text(AppLocalizations.of(context).translate("Email"))),

              DataColumn(label: Text(AppLocalizations.of(context).translate("Projects"))),

            ],

            source: UsersDataSource(
              users: users,
              context: context,
            ),

          ),

        ),

      );

    });

  }

}

class UsersDataSource extends DataTableSource {

  final List users;
  final BuildContext context;

  UsersDataSource({
    required this.users,
    required this.context,
  });

  @override
  DataRow? getRow(int index) {

    if (index >= users.length) return null;

    final u = users[index];

    final email = u["email"] ?? "";
    final name = email.split("@")[0];

    final projects = u["totalProjects"] ?? 0;

    return DataRow.byIndex(

      index: index,

      cells: [

        DataCell(Text("${index + 1}")),

        DataCell(Text(name)),

        DataCell(Text(email)),

        DataCell(Text("$projects")),

      ],

    );

  }

  @override
  bool get isRowCountApproximate => false;

  @override
  int get rowCount => users.length;

  @override
  int get selectedRowCount => 0;

}