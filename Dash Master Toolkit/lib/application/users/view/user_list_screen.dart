import 'package:dash_master_toolkit/application/users/users_imports.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;
import 'package:go_router/go_router.dart';

class UserListScreen extends StatefulWidget {
  const UserListScreen({super.key});

  @override
  State<UserListScreen> createState() => _UserListScreenState();
}

class _UserListScreenState extends State<UserListScreen> {
  final UserListController controller = Get.put(UserListController());
  final ThemeController themeController = Get.put(ThemeController());

  late UserDataSource _dataSource;
  int _rowsPerPage = 10;

  @override
  void initState() {
    super.initState();

    _dataSource = UserDataSource(
      [],
      themeController,
      context,
      resetPage,
      onToggleActive: (u) => controller.toggleActive(u),
      onViewProjects: (u) => _openUserProjects(u),
    );
  }

  void resetPage() {
    setState(() {
      final len = _dataSource.filteredUsers.length;
      _rowsPerPage = (len < 10) ? (len == 0 ? 1 : len) : 10;
    });
  }

  void _applySearch(String query) {
    setState(() {
      _dataSource.filterData(query);
    });
  }

Future<void> _openUserProjects(UserModel user) async {
  context.go("/users/project-list?userId=${Uri.encodeComponent(user.id)}");
}

  @override
  Widget build(BuildContext context) {
    final lang = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final borderColor = themeController.isDarkMode ? colorGrey700 : colorGrey100;

    final titleTextStyle = theme.textTheme.bodyMedium
        ?.copyWith(fontWeight: FontWeight.w500, color: colorGrey500);

    return Scaffold(
      backgroundColor: themeController.isDarkMode ? colorGrey900 : colorWhite,
      body: SingleChildScrollView(
        padding: EdgeInsets.all(
          rf.ResponsiveValue<double>(
            context,
            conditionalValues: const [
              rf.Condition.between(start: 0, end: 340, value: 10),
              rf.Condition.between(start: 341, end: 992, value: 16),
            ],
            defaultValue: 24,
          ).value,
        ),
        child: Obx(() {
          // ✅ rebuild datasource when list changes
          _dataSource = UserDataSource(
            controller.users.toList(),
            themeController,
            context,
            resetPage,
            onToggleActive: (u) => controller.toggleActive(u),
            onViewProjects: (u) => _openUserProjects(u),
          );

          // ✅ re-apply filter if present
          final q = controller.searchController.text;
          if (q.isNotEmpty) _dataSource.filterData(q);

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: CommonSearchField(
                      controller: controller.searchController,
                      focusNode: controller.f1,
                      isDarkMode: themeController.isDarkMode,
                      onChanged: _applySearch,
                      inputDecoration: inputDecoration(
                        context,
                        borderColor: Colors.transparent,
                        prefixIcon: searchIcon,
                        fillColor: Colors.transparent,
                        prefixIconColor: colorGrey400,
                        hintText: lang.translate("search"),
                        borderRadius: 8,
                        topContentPadding: 0,
                        bottomContentPadding: 0,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  SizedBox(
                    height: 45,
                    child: CommonButtonWithIcon(
                      onPressed: () => controller.loadUsers(),
                      text: (lang.translate('refresh') ?? 'Refresh'),
                      icon: Icons.refresh,
                      backgroundColor: colorPrimary100,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 15),

              if (controller.loading.value)
                const Center(
                  child: Padding(
                    padding: EdgeInsets.all(20),
                    child: CircularProgressIndicator(),
                  ),
                )
              else if (_dataSource.filteredUsers.isEmpty)
                Center(
                  child: Text(
                    (lang.translate('noDataFound') ?? "No data found"),
                    style: titleTextStyle?.copyWith(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: colorPrimary100,
                    ),
                  ),
                )
              else
                LayoutBuilder(
                  builder: (context, constraints) {
                    return SingleChildScrollView(
                      child: ConstrainedBox(
                        constraints: BoxConstraints(minWidth: constraints.maxWidth),
                        child: Theme(
                          data: Theme.of(context).copyWith(
                            cardTheme: CardThemeData(
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(0),
                                side: BorderSide(color: borderColor),
                              ),
                              color: themeController.isDarkMode ? colorGrey800 : colorWhite,
                            ),
                            dividerColor: Colors.transparent,
                            dividerTheme: DividerThemeData(
                              color: borderColor,
                              space: 0,
                              thickness: 0,
                              indent: 0,
                              endIndent: 0,
                            ),
                          ),
                          child: PaginatedDataTable(
                            key: ValueKey(_dataSource),
                            dataRowMaxHeight: 65,
                            headingRowColor: WidgetStatePropertyAll(
                              themeController.isDarkMode ? colorDark : colorGrey25,
                            ),
                            headingRowHeight: 50,
                            rowsPerPage: _rowsPerPage,
                            columns: [
                              DataColumn(label: Text((lang.translate("name") ?? "Name"), style: titleTextStyle)),
                              DataColumn(label: Text((lang.translate("designation") ?? "Designation"), style: titleTextStyle)),
                              DataColumn(label: Text("PROJECTS", style: titleTextStyle)),
                              DataColumn(label: Text((lang.translate("email") ?? "Email"), style: titleTextStyle)),
                              DataColumn(label: Text("ACTION", style: titleTextStyle)),
                              DataColumn(label: Text((lang.translate("status") ?? "Status"), style: titleTextStyle)),
                              DataColumn(label: Text((lang.translate("actions") ?? "Actions"), style: titleTextStyle)),
                            ],
                            source: _dataSource,
                          ),
                        ),
                      ),
                    );
                  },
                ),

              const SizedBox(height: 15),
            ],
          );
        }),
      ),
    );
  }
}

typedef ToggleCallback = Future<void> Function(UserModel user);
typedef ViewProjectsCallback = Future<void> Function(UserModel user);

class UserDataSource extends DataTableSource {
  final ThemeController themeController;
  final BuildContext context;
  final VoidCallback resetPage;
  final ToggleCallback onToggleActive;
  final ViewProjectsCallback onViewProjects;

  final List<UserModel> originalUsers;
  List<UserModel> filteredUsers;

  UserDataSource(
    this.originalUsers,
    this.themeController,
    this.context,
    this.resetPage, {
    required this.onToggleActive,
    required this.onViewProjects,
  }) : filteredUsers = List.from(originalUsers);

  void filterData(String query) {
    if (query.isEmpty) {
      filteredUsers = List.from(originalUsers);
    } else {
      final q = query.toLowerCase();
      filteredUsers = originalUsers.where((u) {
        return u.name.toLowerCase().contains(q) ||
            u.email.toLowerCase().contains(q) ||
            u.designation.toLowerCase().contains(q) ||
            u.department.toLowerCase().contains(q);
      }).toList();
    }
    resetPage();
    notifyListeners();
  }

  @override
  DataRow getRow(int index) {
    final cellStyle = TextStyle(
      fontWeight: FontWeight.w500,
      color: themeController.isDarkMode ? colorWhite : colorGrey900,
    );

    final user = filteredUsers[index];

    return DataRow(
      color: WidgetStateProperty.all(
        themeController.isDarkMode ? colorGrey800 : colorWhite,
      ),
      cells: [
        DataCell(Row(
          children: [
            CircleAvatar(backgroundImage: AssetImage(user.imageUrl)),
            const SizedBox(width: 10),
            Text(user.name, style: cellStyle.copyWith(fontWeight: FontWeight.w600)),
          ],
        )),
        DataCell(Text(user.designation, style: cellStyle)),

        // ✅ projects count text (stored in department)
        DataCell(Text(user.department, style: cellStyle)),

        DataCell(Text(user.email, style: cellStyle)),

        // ✅ ACTION button
        DataCell(
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              onPressed: () => onViewProjects(user),
              icon: const Icon(Icons.remove_red_eye_outlined, size: 18),
              label: const Text("View projects"),
            ),
          ),
        ),

        // ✅ Status badge
        DataCell(Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: user.isActive
                ? Colors.green.withValues(alpha: 0.2)
                : Colors.red.withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            user.status, // keep model value
            style: cellStyle.copyWith(
              color: user.isActive ? Colors.green : Colors.red,
              fontWeight: FontWeight.w600,
            ),
          ),
        )),

        // ✅ Actions (activation)
        DataCell(Row(
          children: [
            Switch(
              value: user.isActive,
              onChanged: (_) => onToggleActive(user),
            ),
            const SizedBox(width: 6),
            IconButton(
              tooltip: user.isActive ? "Disable" : "Enable",
              icon: Icon(user.isActive ? Icons.lock_open : Icons.lock),
              onPressed: () => onToggleActive(user),
            ),
          ],
        )),
      ],
    );
  }

  @override
  bool get isRowCountApproximate => false;

  @override
  int get rowCount => filteredUsers.length;

  @override
  int get selectedRowCount => 0;
}