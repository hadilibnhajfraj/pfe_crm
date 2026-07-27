// lib/dashboard/ecommerce/view/ecommerce_dashboard_screen.dart
import 'package:dash_master_toolkit/dashboard/ecommerce/ecommerce_imports.dart';
import 'package:intl/intl.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

// ✅ navigation
import 'package:go_router/go_router.dart';
import 'package:dash_master_toolkit/route/my_route.dart';

class EcommerceDashboardScreen extends StatefulWidget {
  const EcommerceDashboardScreen({super.key});

  @override
  EcommerceDashboardScreenState createState() => EcommerceDashboardScreenState();
}

class EcommerceDashboardScreenState extends State<EcommerceDashboardScreen> {
  final EcommerceDashboardController controller = EcommerceDashboardController();

  static const String projectIcon = pieChartIcon;

  static const int rowsPerPage = 5;
  int _page = 0;

  void _goPrev(int pageCount) {
    if (_page <= 0) return;
    setState(() => _page = (_page - 1).clamp(0, (pageCount - 1).clamp(0, 999999)));
  }

  void _goNext(int pageCount) {
    if (_page >= pageCount - 1) return;
    setState(() => _page = (_page + 1).clamp(0, (pageCount - 1).clamp(0, 999999)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lang = AppLocalizations.of(context);

    final isMobileScreen = responsiveValue<bool>(
      context,
      xs: true,
      sm: true,
      md: false,
      lg: false,
      xl: false,
    );

    return GetBuilder<EcommerceDashboardController>(
      init: controller,
      tag: 'ecommerce_dashboard',
      builder: (controller) {
        return Scaffold(
          backgroundColor: controller.themeController.isDarkMode ? colorGrey900 : colorWhite,
          body: SingleChildScrollView(
            padding: EdgeInsets.all(
              rf.ResponsiveValue<double>(
                context,
                conditionalValues: [
                  const rf.Condition.between(start: 0, end: 340, value: 2),
                  const rf.Condition.between(start: 341, end: 992, value: 8),
                ],
                defaultValue: 16,
              ).value,
            ),
            child: ResponsiveGridRow(
              children: [
                _topCommonCard(
                  Obx(() => _buildTopCardsWidget(
                        lang,
                        theme,
                        projectIcon,
                        "All projects",
                        controller.totalProjects.value.toString(),
                        "",
                      )),
                ),
                _topCommonCard(
                  Obx(() => _buildTopCardsWidget(
                        lang,
                        theme,
                        projectIcon,
                        "Not validated projects",
                        controller.nonValidatedProjects.value.toString(),
                        "",
                      )),
                ),
                _topCommonCard(
                  Obx(() => _buildTopCardsWidget(
                        lang,
                        theme,
                        projectIcon,
                        "Validated projects",
                        controller.validatedProjects.value.toString(),
                        "",
                      )),
                ),

                _commonCard(8, _buildRevenueReportWidget(lang, theme, isMobileScreen)),
                _commonCard(4, _buildCustomerGrowthWidget(lang, theme, isMobileScreen)),
                _commonCard(12, _buildOrderListWidget(lang, theme, isMobileScreen)),
              ],
            ),
          ),
        );
      },
    );
  }

Widget _buildRevenueReportWidget(AppLocalizations lang, ThemeData theme, bool isMobileScreen) {
  return Padding(
    padding: const EdgeInsets.all(7.0),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          "Projects Performance by Month",
          style: theme.textTheme.titleLarge?.copyWith(
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 20),

        Obx(() {
          final data = controller.revenueList;

          if (data.isEmpty) {
            return const Center(child: Text("No data"));
          }

          return Wrap(
            spacing: 16,
            runSpacing: 16,
            children: data.map((e) {
              final validated = e.earning;
              final success = e.expense;

              return Container(
                width: 220,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: theme.cardColor,
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: const [
                    BoxShadow(color: Colors.black12, blurRadius: 6),
                  ],
                ),
                child: Column(
                  children: [
                    /// 📅 MONTH
                    Text(
                      e.month,
                      style: theme.textTheme.bodyLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),

                    const SizedBox(height: 10),

                    /// 🔥 PIE CHART
                    SizedBox(
                      height: 120,
                      child: PieChart(
                        PieChartData(
                          sectionsSpace: 2,
                          centerSpaceRadius: 30,
                          sections: [
                            PieChartSectionData(
                              value: validated,
                              color: Colors.green,
                              title: "${validated.toStringAsFixed(0)}%",
                              radius: 40,
                              titleStyle: const TextStyle(
                                fontSize: 10,
                                color: Colors.white,
                              ),
                            ),
                            PieChartSectionData(
                              value: success,
                              color: Colors.blue,
                              title: "${success.toStringAsFixed(0)}%",
                              radius: 40,
                              titleStyle: const TextStyle(
                                fontSize: 10,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 10),

                    /// LEGEND
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        Row(
                          children: const [
                            Icon(Icons.circle, size: 10, color: Colors.green),
                            SizedBox(width: 4),
                            Text("Validated", style: TextStyle(fontSize: 10)),
                          ],
                        ),
                        Row(
                          children: const [
                            Icon(Icons.circle, size: 10, color: Colors.blue),
                            SizedBox(width: 4),
                            Text("Success", style: TextStyle(fontSize: 10)),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
              );
            }).toList(),
          );
        }),
      ],
    ),
  );
}

  Widget _buildOrderListWidget(AppLocalizations lang, ThemeData theme, bool isMobileScreen) {
    final titleTextStyle = theme.textTheme.bodyMedium?.copyWith(
      fontWeight: FontWeight.w400,
      color: controller.themeController.isDarkMode ? colorGrey500 : colorGrey400,
    );

    final rowTextStyle = theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600);

    return Padding(
      padding: const EdgeInsets.all(7.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("Projects list", style: theme.textTheme.titleLarge?.copyWith(fontSize: 18, fontWeight: FontWeight.w500)),
          const SizedBox(height: 10),
          Text(
            "Project tracking and permissions",
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w500,
              color: controller.themeController.isDarkMode ? colorGrey500 : colorGrey400,
            ),
          ),
          const SizedBox(height: 10),

          LayoutBuilder(builder: (context, constraints) {
            return Obx(() {
              final totalRows = controller.orders.length;
              final pageCount = (totalRows / rowsPerPage).ceil().clamp(1, 999999);
              if (_page > pageCount - 1) {
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (mounted) setState(() => _page = 0);
                });
              }

              final start = _page * rowsPerPage;
              final end = (start + rowsPerPage).clamp(0, totalRows);
              final pageRows = controller.orders.sublist(start.clamp(0, totalRows), end);

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: ConstrainedBox(
                      constraints: BoxConstraints(minWidth: constraints.maxWidth),
                      child: Theme(
                        data: Theme.of(context).copyWith(
                          dividerColor: Colors.transparent,
                          dividerTheme: const DividerThemeData(color: Colors.transparent, space: 0, thickness: 0),
                          checkboxTheme: CheckboxThemeData(
                            side: BorderSide(color: colorGrey500, width: 1.0),
                          ),
                        ),
                        child: Container(
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(8.0),
                            border: Border.all(
                              color: controller.themeController.isDarkMode ? colorGrey700 : colorGrey100,
                              width: 1.0,
                            ),
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(8.0),
                            child: DataTable(
                              headingRowColor: WidgetStateProperty.all(
                                controller.themeController.isDarkMode ? colorGrey700 : colorGrey50,
                              ),
                              border: TableBorder(
                                borderRadius: BorderRadius.circular(8.0),
                                horizontalInside: BorderSide(
                                  color: controller.themeController.isDarkMode ? colorGrey700 : colorGrey100,
                                  width: 0.8,
                                ),
                              ),
                              dividerThickness: 1.0,
                              headingRowHeight: 50,
                              dataRowHeight: 70,
                              showCheckboxColumn: false,
                              sortColumnIndex: controller.sortColumnIndex.value,
                              sortAscending: controller.sortAscending.value,
                              columns: [
                                DataColumn(
                                  label: Row(
                                    children: [
                                      Checkbox(
                                        activeColor: colorPrimary100,
                                        value: controller.selectAll.value,
                                        onChanged: (value) => controller.selectAllRows(value ?? false),
                                      ),
                                      const SizedBox(width: 12),
                                      const Text("."),
                                    ],
                                  ),
                                ),
                                DataColumn(
                                  label: Text("PROJECT", style: titleTextStyle),
                                  onSort: (i, asc) => controller.sort((d) => d.customerName, i, asc),
                                ),
                                DataColumn(
                                  label: Text("DATE", style: titleTextStyle),
                                  onSort: (i, asc) => controller.sort((d) => d.date, i, asc),
                                ),
                                DataColumn(
                                  label: Text("USER", style: titleTextStyle),
                                  onSort: (i, asc) => controller.sort((d) => d.customerEmail, i, asc),
                                ),
                                DataColumn(
                                  label: Text("VALIDATION", style: titleTextStyle),
                                  onSort: (i, asc) => controller.sort((d) => d.paymentStatus, i, asc),
                                ),
                                DataColumn(
                                  label: Text("STATUS", style: titleTextStyle),
                                  onSort: (i, asc) => controller.sort((d) => d.orderStatus, i, asc),
                                ),
                                DataColumn(
                                  label: SizedBox(width: 170, child: Text("ACTION", style: titleTextStyle)),
                                ),
                              ],
                              rows: List.generate(pageRows.length, (localIndex) {
                                final row = pageRows[localIndex];
                                final globalIndex = start + localIndex;

                                final isAdmin = controller.isAdminRole;
                                final canEdit = controller.canEdit(row);

                                return DataRow.byIndex(
                                  index: globalIndex,
                                  cells: [
                                    DataCell(
                                      Checkbox(
                                        activeColor: colorPrimary100,
                                        value: row.isSelected,
                                        onChanged: (selected) {
                                          setState(() {
                                            row.isSelected = selected ?? false;
                                            controller.selectAll.value = controller.orders.every((u) => u.isSelected);
                                          });
                                        },
                                      ),
                                    ),
                                    DataCell(Text(row.customerName, style: rowTextStyle)),
                                    DataCell(Text(DateFormat('MMM dd, yyyy').format(row.date), style: rowTextStyle)),
                                    DataCell(Text(row.customerEmail, style: rowTextStyle)),
                                    DataCell(_validationBadge(row.paymentStatus)),
                                    DataCell(_projectStatusBadge(row.orderStatus)),
                                    DataCell(
                                      Align(
                                        alignment: Alignment.centerLeft,
                                        child: Wrap(
                                          spacing: 8,
                                          children: [
                                            if (isAdmin) ...[
                                              IconButton(
                                                tooltip: "View details",
                                                icon: Icon(Icons.remove_red_eye_outlined, color: colorGrey600),
                                                onPressed: () {
                                                  final id = row.id.trim();
                                                  if (id.isEmpty) return;
                                                  context.go("${MyRoute.projectFormScreen}?id=$id&mode=view");
                                                },
                                              ),
                                              IconButton(
                                                tooltip: "Delete",
                                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                                onPressed: () async {
                                                  final id = row.id.trim();
                                                  if (id.isEmpty) return;

                                                  final ok = await showDialog<bool>(
                                                    context: context,
                                                    builder: (ctx) => AlertDialog(
                                                      title: const Text("Delete project?"),
                                                      content: Text("Project: ${row.customerName}"),
                                                      actions: [
                                                        TextButton(
                                                          style: TextButton.styleFrom(
                                                            foregroundColor: Colors.grey.shade700,
                                                          ),
                                                          onPressed: () => Navigator.of(ctx).pop(false),
                                                          child: const Text("Cancel"),
                                                        ),
                                                        ElevatedButton(
                                                          style: ElevatedButton.styleFrom(
                                                            backgroundColor: Colors.redAccent,
                                                            foregroundColor: Colors.white,
                                                          ),
                                                          onPressed: () => Navigator.of(ctx).pop(true),
                                                          child: const Text("Delete"),
                                                        ),
                                                      ],
                                                    ),
                                                  );

                                                  if (ok != true) return;

                                                  final success = await controller.deleteProject(id);
                                                  if (!mounted) return;

                                                  ScaffoldMessenger.of(context).showSnackBar(
                                                    SnackBar(
                                                      content: Text(success ? "Project deleted ✅" : "Delete failed ❌"),
                                                    ),
                                                  );
                                                },
                                              ),
                                            ] else ...[
                                              if (canEdit)
                                                IconButton(
                                                  tooltip: "Edit",
                                                  icon: Icon(Icons.edit, color: colorGrey600),
                                                  onPressed: () {
                                                    final id = row.id.trim();
                                                    if (id.isEmpty) {
                                                      ScaffoldMessenger.of(context).showSnackBar(
                                                        const SnackBar(content: Text("Project ID not found")),
                                                      );
                                                      return;
                                                    }
                                                    context.go("${MyRoute.projectFormScreen}?id=$id");
                                                  },
                                                ),
                                              IconButton(
                                                tooltip: "Comment",
                                                icon: Icon(Icons.comment_outlined, color: colorGrey600),
                                                onPressed: () {
                                                  final id = row.id.trim();
                                                  if (id.isEmpty) {
                                                    ScaffoldMessenger.of(context).showSnackBar(
                                                      const SnackBar(content: Text("Project ID not found")),
                                                    );
                                                    return;
                                                  }
                                                  // TODO: if you have a dedicated comment screen route, go there
                                                  context.go("${MyRoute.projectFormScreen}?id=$id");
                                                },
                                              ),
                                            ],
                                          ],
                                        ),
                                      ),
                                    ),
                                  ],
                                  color: WidgetStateProperty.resolveWith<Color?>((states) {
                                    if (states.contains(WidgetState.pressed)) return Colors.transparent;
                                    if (states.contains(WidgetState.hovered)) {
                                      return controller.themeController.isDarkMode ? colorGrey800 : colorGrey25;
                                    }
                                    return null;
                                  }),
                                  selected: row.isSelected,
                                );
                              }).toList(),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Text(
                        "Page ${_page + 1} / $pageCount",
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: controller.themeController.isDarkMode ? colorGrey500 : colorGrey400,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(width: 12),
                      IconButton(
                        tooltip: "Previous",
                        onPressed: _page == 0 ? null : () => _goPrev(pageCount),
                        icon: const Icon(Icons.chevron_left),
                      ),
                      IconButton(
                        tooltip: "Next",
                        onPressed: _page >= pageCount - 1 ? null : () => _goNext(pageCount),
                        icon: const Icon(Icons.chevron_right),
                      ),
                    ],
                  ),
                ],
              );
            });
          }),
        ],
      ),
    );
  }

  Widget _validationBadge(String v) {
    final ok = (v == "Validé" || v.toLowerCase() == "validated");
    final bg = ok ? colorEcommerceLightGreen : const Color(0xffFFEBEA);
    final tx = ok ? colorEcommerceGreen : const Color(0xffFF3333);

    final label = ok ? "Validated" : "Not validated";

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
      child: Text(label, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: tx)),
    );
  }

  Widget _projectStatusBadge(String status) {
    Color bgColor;
    Color textColor;

    final s = status.trim();

    switch (s) {
      case "En cours":
      case "In Progress":
        bgColor = const Color(0xffFFFAE5);
        textColor = const Color(0xffFFCC00);
        status = "In Progress";
        break;

      case "Terminé":
      case "Completed":
        bgColor = colorEcommerceLightGreen;
        textColor = colorEcommerceGreen;
        status = "Completed";
        break;

      case "Préparation":
      case "Preparation":
        bgColor = Colors.blue.shade50;
        textColor = Colors.blue;
        status = "Preparation";
        break;

      default:
        bgColor = Colors.grey.shade200;
        textColor = Colors.black;
        // keep original if unknown
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: bgColor, borderRadius: BorderRadius.circular(12)),
      child: Text(status, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: textColor)),
    );
  }

  Widget _buildCustomerGrowthWidget(AppLocalizations lang, ThemeData theme, bool isMobileScreen) {
    return Padding(
      padding: const EdgeInsets.all(7.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("Projects & percentage",
              style: theme.textTheme.titleLarge?.copyWith(fontSize: 18, fontWeight: FontWeight.w600)),
          const SizedBox(height: 20),
          SizedBox(
            height: 480,
            child: Obx(() {
              return SingleChildScrollView(
                child: Column(
                  children: controller.customers.map((p) {
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              SizedBox(
                                width: 24,
                                height: 24,
                                child: ClipOval(
                                  child: SvgPicture.asset(
                                    p.flag,
                                    fit: BoxFit.fill,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  p.country,
                                  style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 15),
                          Row(
                            children: [
                              Expanded(
                                child: LinearProgressIndicator(
                                  value: (p.percentage / 100).clamp(0, 1),
                                  borderRadius: BorderRadius.circular(12),
                                  backgroundColor: controller.themeController.isDarkMode ? colorGrey700 : colorGrey100,
                                  valueColor: AlwaysStoppedAnimation<Color>(colorPrimary100),
                                  minHeight: 8,
                                ),
                              ),
                              const SizedBox(width: 15),
                              Text("${p.percentage.toStringAsFixed(1)}%",
                                  style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500)),
                            ],
                          )
                        ],
                      ),
                    );
                  }).toList(),
                ),
              );
            }),
          ),
        ],
      ),
    );
  }

  Widget _buildTopCardsWidget(
    AppLocalizations lang,
    ThemeData theme,
    String assetName,
    String data,
    String totalCount,
    String profitPer,
  ) {
    return Padding(
      padding: const EdgeInsets.all(7.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _buildContainerCircleView(assetName),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  data,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: controller.themeController.isDarkMode ? colorGrey500 : colorGrey400,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 15),
          Text(totalCount, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 10),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  Widget _buildContainerCircleView(String assetName) {
    final screenWidth = MediaQuery.of(context).size.width;
    double size;
    if (screenWidth >= 768) {
      size = 56;
    } else if (screenWidth >= 640) {
      size = 44;
    } else {
      size = 38;
    }

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: controller.themeController.isDarkMode ? colorGrey700 : colorGrey100),
      ),
      child: Center(
        child: SvgPicture.asset(
          assetName,
          colorFilter: ColorFilter.mode(
            controller.themeController.isDarkMode ? colorWhite : colorGrey900,
            BlendMode.srcIn,
          ),
        ),
      ),
    );
  }

  ResponsiveGridCol _commonCard(int count, Widget child) {
    return ResponsiveGridCol(xs: 12, sm: 12, md: count, lg: count, xl: count, child: _commonBg(child));
  }

  ResponsiveGridCol _topCommonCard(Widget child) {
    return ResponsiveGridCol(xs: 12, sm: 12, md: 6, lg: 3, xl: 3, child: _commonBg(child));
  }

  Widget _commonBg(Widget child) {
    return Container(
      margin: const EdgeInsetsDirectional.only(start: 8, end: 8, top: 15),
      padding: const EdgeInsets.all(7),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: controller.themeController.isDarkMode ? colorGrey900 : Colors.white,
        boxShadow: [
          if (!controller.themeController.isDarkMode)
            BoxShadow(
              color: colorG1.withValues(alpha: 0.24),
              blurRadius: 2,
              offset: const Offset(0, 1),
              spreadRadius: 0,
            ),
        ],
        border: Border.all(color: controller.themeController.isDarkMode ? colorGrey700 : colorGrey100),
      ),
      child: child,
    );
  }
}