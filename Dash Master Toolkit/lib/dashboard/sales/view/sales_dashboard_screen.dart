import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:dash_master_toolkit/dashboard/sales/sales_imports.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;
import 'package:syncfusion_flutter_maps/maps.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:dash_master_toolkit/core/theme/app_text_styles.dart';

class SalesDashboardScreen extends StatefulWidget {
  const SalesDashboardScreen({super.key});

  @override
  State<SalesDashboardScreen> createState() => _SalesDashboardScreenState();
}

class _SalesDashboardScreenState extends State<SalesDashboardScreen> {
  final ThemeController themeController = Get.put(ThemeController());
  final SalesDashboardController controller = Get.put(SalesDashboardController());

  // ================== Helpers ==================
  double _toDouble(dynamic v, {double fallback = 0}) {
    if (v == null) return fallback;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString()) ?? fallback;
  }
Widget _kpiBox(String title, int value, Color color) {
  return Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: color.withOpacity(0.1),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Column(
      children: [
        Text(
          '$value',
          style: AppTextStyles.metric.copyWith(color: color, fontSize: 28),
        ),
        const SizedBox(height: 4),
        Text(title, style: AppTextStyles.bodyMuted),
      ],
    ),
  );
}
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return GetBuilder<SalesDashboardController>(
      init: controller,
      tag: 'sales_dashboard',
      builder: (_) {
        return Scaffold(
          backgroundColor: themeController.isDarkMode ? colorGrey900 : colorWhite,
          body: SingleChildScrollView(
            padding: EdgeInsets.all(
              rf.ResponsiveValue<double>(
                context,
                conditionalValues: [
                  const rf.Condition.between(start: 0, end: 340, value: 2),
                  const rf.Condition.between(start: 341, end: 992, value: 8),
                ],
                defaultValue: 12,
              ).value,
            ),
            child: ResponsiveGridRow(
              children: [
                _commonCard(5, _buildTodaySaleWidget(theme)),
                _commonCard(7, _buildVisitorChart(theme)),
                _commonCard(5, _buildTopProductsWidget(theme)),
                _commonCard(7, _buildCountryMapSalesWidget()),
               // _commonCard(7, _buildCombinedPieChart(theme)),
//_commonCard(5, _buildCombinedBarChart(theme)),
_commonCard(12, _buildKpiOverview(theme)),
              ],
            ),
          ),
        );
      },
    );
  }

  // ================== Today KPI ==================
Widget _buildTodaySaleWidget(ThemeData theme) {
  return Obx(() {
    final total = controller.totalProjects.value;
    final validated = controller.validatedProjects.value;
    final nonValidated = controller.nonValidatedProjects.value;
    final pct = controller.validatedPercentage.value;

    if (controller.isLoadingKpi.value) {
      return const Center(child: CircularProgressIndicator());
    }

    if (controller.kpiError.value.isNotEmpty) {
      return Center(
        child: Text(
          controller.kpiError.value,
          style: const TextStyle(color: Colors.red),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        /// 🔥 HEADER
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              "Project Intelligence",
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: Colors.blue.withOpacity(0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Text(
                "Overview",
                style: TextStyle(color: Colors.blue, fontSize: 12),
              ),
            )
          ],
        ),

        const SizedBox(height: 20),

        /// 🔥 KPI GRID
        ResponsiveGridRow(
          children: [
            _modernCard(
              title: "Total Projects",
              value: "$total",
              icon: Icons.dashboard,
              gradient: [Color(0xffFF7E79), Color(0xffFFB199)],
            ),
            _modernCard(
              title: "Validated",
              value: "$validated",
              icon: Icons.check_circle,
              gradient: [Color(0xff56ab2f), Color(0xffa8e063)],
            ),
            _modernCard(
              title: "Validation Rate",
              value: "${pct.toStringAsFixed(1)}%",
              icon: Icons.show_chart,
              gradient: [Color(0xfff7971e), Color(0xffffd200)],
            ),
            _modernCard(
              title: "Pending",
              value: "$nonValidated",
              icon: Icons.pending_actions,
              gradient: [Color(0xff8E2DE2), Color(0xffC33764)],
            ),
          ],
        ),
      ],
    );
  });
}
ResponsiveGridCol _modernCard({
  required String title,
  required String value,
  required IconData icon,
  required List<Color> gradient,
}) {
  return ResponsiveGridCol(
    xs: 12,
    sm: 6,
    md: 6,
    lg: 6,
    xl: 6,
    child: Container(
      margin: const EdgeInsets.all(8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: gradient,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: gradient.first.withOpacity(0.3),
            blurRadius: 12,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          /// ICON
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.2),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: Colors.white, size: 22),
          ),

          const SizedBox(width: 12),

          /// TEXT
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 13,
                  color: Colors.white70,
                ),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}
  ResponsiveGridCol _commonSaleCardWidget(ThemeData theme, String title, String totalCount, String icon, Color cardBgColor, Color iconBgColor) {
    return ResponsiveGridCol(
      xs: 6,
      sm: 6,
      md: 6,
      lg: 6,
      xl: 6,
      child: Container(
        margin: const EdgeInsets.all(5),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(10), color: cardBgColor),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(shape: BoxShape.circle, color: iconBgColor),
              child: Padding(
                padding: const EdgeInsets.all(8.0),
                child: SvgPicture.asset(icon, colorFilter: const ColorFilter.mode(Colors.white, BlendMode.srcIn)),
              ),
            ),
            const SizedBox(height: 10),
            Text(totalCount, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Text(title, style: theme.textTheme.bodyMedium),
          ],
        ),
      ),
    );
  }

  // ================== Visitor chart ==================
int touchedIndex = -1; // 👉 ajouter dans ton State

Widget _buildVisitorChart(ThemeData theme) {
  return Obx(() {
    if (controller.isLoadingKpi.value) {
      return const Center(child: CircularProgressIndicator());
    }

    if (controller.kpiError.value.isNotEmpty) {
      return Center(
        child: Text(controller.kpiError.value,
            style: const TextStyle(color: Colors.red)),
      );
    }

    final rows = controller.projectsByStatus;

    if (rows.isEmpty) {
      return const Center(child: Text("No status data"));
    }

    final total = controller.totalProjects;

    final colors = [
      Colors.blue,
      Colors.green,
      Colors.orange,
      Colors.purple,
      Colors.red,
      Colors.teal,
      Colors.pink,
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("Projects by Status", style: theme.textTheme.titleLarge),
        const SizedBox(height: 20),

        SizedBox(
          height: 300,
          child: Stack(
            alignment: Alignment.center,
            children: [
              PieChart(
                PieChartData(
                  sectionsSpace: 3,
                  centerSpaceRadius: 70,
                  pieTouchData: PieTouchData(
                    touchCallback: (event, response) {
                      setState(() {
                        if (!event.isInterestedForInteractions ||
                            response == null ||
                            response.touchedSection == null) {
                          touchedIndex = -1;
                          return;
                        }
                        touchedIndex =
                            response.touchedSection!.touchedSectionIndex;
                      });
                    },
                  ),
                  sections: List.generate(rows.length, (index) {
                    final d = rows[index];
                    final value = _toDouble(d["count"]);
                    final percent = total.value == 0 ? 0 : (value / total.value) * 100;

                    final isTouched = index == touchedIndex;

                    return PieChartSectionData(
                      color: colors[index % colors.length],
                      value: value,
                      radius: isTouched ? 95 : 85,
                      title: "${percent.toStringAsFixed(1)}%",
                      titleStyle: TextStyle(
                        fontSize: isTouched ? 14 : 12,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    );
                  }),
                ),
                swapAnimationDuration: const Duration(milliseconds: 500),
              ),

              /// ✅ TOTAL AU CENTRE
              Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    "${total.toInt()}",
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    "Total Projects",
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            ],
          ),
        ),

        const SizedBox(height: 20),

        /// ✅ TOOLTIP / LABEL dynamique
        if (touchedIndex != -1)
          Container(
            padding: const EdgeInsets.all(10),
            margin: const EdgeInsets.only(bottom: 10),
            decoration: BoxDecoration(
              color: Colors.black87,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              "${rows[touchedIndex]["validationStatut"]} : ${rows[touchedIndex]["count"]} projects",
              style: const TextStyle(color: Colors.white),
            ),
          ),

        /// ✅ LEGEND
        Wrap(
          spacing: 12,
          runSpacing: 8,
          children: List.generate(rows.length, (index) {
            final d = rows[index];

            return Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    color: colors[index % colors.length],
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  "${d["validationStatut"]} (${d["count"]})",
                  style: theme.textTheme.bodySmall,
                ),
              ],
            );
          }),
        ),
      ],
    );
  });
}
Widget _buildCombinedPieChart(ThemeData theme) {
  return Obx(() {
    final data = controller.combinedStatusData;

    if (data.isEmpty) {
      return const Center(child: Text("No data"));
    }

    final colors = [
      Colors.blue,
      Colors.green,
      Colors.orange,
      Colors.purple,
      Colors.red,
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("Projects vs Contacts",
            style: theme.textTheme.titleLarge),

        const SizedBox(height: 20),

        SizedBox(
          height: 300,
          child: PieChart(
            PieChartData(
              sections: data.asMap().entries.map((entry) {
                final index = entry.key;
                final d = entry.value;

                final total =
                    d["projects"] + d["contacts"];

                return PieChartSectionData(
                  color: colors[index % colors.length],
                  value: total.toDouble(),
                  title: d["status"],
                  radius: 90,
                );
              }).toList(),
            ),
          ),
        ),

        const SizedBox(height: 20),

        /// 🔥 LEGEND DETAIL
        ...data.map((d) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: [
                Text("${d["status"]} : "),
                Text(
                  "Projects ${d["projects"]} | Contacts ${d["contacts"]}",
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ],
            ),
          );
        }),
      ],
    );
  });
}
Widget _buildCombinedBarChart(ThemeData theme) {
  return Obx(() {
    final data = controller.contactsByStatus;

    if (data.isEmpty) {
      return const Center(child: Text("No data"));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("Projects vs Contacts (Bar)",
            style: theme.textTheme.titleLarge),

        const SizedBox(height: 20),

        SizedBox(
          height: 300,
          child: BarChart(
            BarChartData(
              barGroups: data.asMap().entries.map((entry) {
                final index = entry.key;
                final d = entry.value;

                return BarChartGroupData(
                  x: index,
                  barRods: [
                    /// 🔵 PROJECTS
                    BarChartRodData(
                      toY: (d["projects"]).toDouble(),
                      color: Colors.blue,
                      width: 8,
                    ),

                    /// 🟠 CONTACTS
                    BarChartRodData(
                      toY: (d["contacts"]).toDouble(),
                      color: Colors.orange,
                      width: 8,
                    ),
                  ],
                );
              }).toList(),
            ),
          ),
        ),

        const SizedBox(height: 10),

        /// LABELS
        Wrap(
          spacing: 12,
          children: data.map((d) {
            return Chip(label: Text(d["status"]));
          }).toList(),
        ),
      ],
    );
  });
}
Widget _buildKpiOverview(ThemeData theme) {
  return Obx(() {
    if (controller.isLoadingKpi.value) {
      return const Center(child: CircularProgressIndicator());
    }

    final projects = controller.projectsByStatus;
    final contacts = controller.contactsByStatus;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("KPI Overview", style: theme.textTheme.titleLarge),

        const SizedBox(height: 20),

        /// 🔥 TOTALS
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _kpiBox("Projects", controller.totalProjects.value, Colors.blue),
            _kpiBox("Contacts", controller.totalContacts.value, Colors.orange),
            _kpiBox("Global", controller.totalGlobal.value, Colors.green),
          ],
        ),

        const SizedBox(height: 20),

        /// 🔥 PROJECT STATUS
        Text("Projects by Status", style: theme.textTheme.titleMedium),
        const SizedBox(height: 10),

        ...projects.map((p) {
          return ListTile(
            leading: const Icon(Icons.work),
            title: Text(p["validationStatut"]),
            trailing: Text(p["count"].toString()),
          );
        }),

        const SizedBox(height: 20),

        /// 🔥 CONTACT STATUS
        Text("Contacts by Status", style: theme.textTheme.titleMedium),
        const SizedBox(height: 10),

        ...contacts.map((c) {
          return ListTile(
            leading: const Icon(Icons.contact_page),
            title: Text(c["statut"]),
            trailing: Text(c["count"].toString()),
          );
        }),
      ],
    );
  });
}
  // ================== Top Products / Surface table ==================
Widget _buildTopProductsWidget(ThemeData theme) {
  return Obx(() {
    final rows = controller.surfacePagedRows;

    if (controller.isLoadingKpi.value) {
      return const Center(child: CircularProgressIndicator());
    }

    if (controller.kpiError.value.isNotEmpty) {
      return Center(
        child: Text(controller.kpiError.value,
            style: const TextStyle(color: Colors.red)),
      );
    }

    if (rows.isEmpty) {
      return const Center(child: Text("No data"));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        /// 🔥 HEADER
        Text(
          "Projects Performance by Surface",
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 16),

        /// 🔥 TABLE
        Container(
          decoration: BoxDecoration(
            color: theme.cardColor,
            borderRadius: BorderRadius.circular(16),
            boxShadow: const [
              BoxShadow(color: Colors.black12, blurRadius: 8),
            ],
          ),
          child: Column(
            children: [
              /// HEADER
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  children: const [
                    Expanded(
                      flex: 2,
                      child: Text("Project",
                          style: TextStyle(fontWeight: FontWeight.bold)),
                    ),
                    Expanded(child: Text("Surface")),
                    Expanded(child: Text("Status")),
                    Expanded(child: Text("Success")),
                  ],
                ),
              ),

              const Divider(height: 1),

              /// ROWS
              ...List.generate(rows.length, (index) {
                final d = rows[index];

                /// ✅ DATA SAFE
                final projectName =
                    d["projectName"] ?? d["name"] ?? "Unnamed";

                final surface = d["surfaceProspectee"] ?? "-";

                final percent =
                    double.tryParse(d["successPercentage"]?.toString() ?? "0") ??
                        0;

                final statut = d["statut"] ?? "Unknown";

                Color statusColor;
                if (statut == "Validé") {
                  statusColor = Colors.green;
                } else if (statut == "En cours") {
                  statusColor = Colors.orange;
                } else {
                  statusColor = Colors.red;
                }

                return Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 14),
                  decoration: BoxDecoration(
                    border: Border(
                      bottom:
                          BorderSide(color: Colors.grey.shade200),
                    ),
                  ),
                  child: Row(
                    children: [
                      /// 📌 PROJECT NAME
                      Expanded(
                        flex: 2,
                        child: Row(
                          children: [
                            CircleAvatar(
                              radius: 14,
                              backgroundColor:
                                  Colors.blue.withOpacity(0.1),
                              child: Text(
                                projectName.isNotEmpty
                                    ? projectName[0].toUpperCase()
                                    : "?",
                                style: const TextStyle(
                                  color: Colors.blue,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                projectName,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w500),
                              ),
                            ),
                          ],
                        ),
                      ),

                      /// 📐 SURFACE
                      Expanded(
                        child: Text("$surface m²"),
                      ),

                      /// 🏷 STATUS BADGE
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: statusColor.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            statut,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: statusColor,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ),

                      /// 📊 SUCCESS %
                      Expanded(
                        child: Column(
                          crossAxisAlignment:
                              CrossAxisAlignment.start,
                          children: [
                            Text("${percent.toStringAsFixed(0)}%"),
                            const SizedBox(height: 4),
                            ClipRRect(
                              borderRadius:
                                  BorderRadius.circular(6),
                              child: LinearProgressIndicator(
                                value: percent / 100,
                                minHeight: 6,
                                backgroundColor:
                                    Colors.grey.shade200,
                                valueColor:
                                    AlwaysStoppedAnimation<Color>(
                                  percent > 70
                                      ? Colors.green
                                      : percent > 40
                                          ? Colors.orange
                                          : Colors.red,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ],
          ),
        ),

        const SizedBox(height: 15),

        /// 🔥 PAGINATION
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            IconButton(
              icon: const Icon(Icons.arrow_back_ios),
              onPressed: controller.prevSurfacePage,
            ),
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                "Page ${controller.surfacePage} / ${controller.surfaceTotalPages}",
                style: const TextStyle(fontWeight: FontWeight.w500),
              ),
            ),
            IconButton(
              icon: const Icon(Icons.arrow_forward_ios),
              onPressed: controller.nextSurfacePage,
            ),
          ],
        ),
      ],
    );
  });
}
  // ================== Projects Map ==================
  Widget _buildCountryMapSalesWidget() {
    return Obx(() {
      final rows = controller.projectLocationKpi;
      if (controller.isLoadingKpi.value) return const Center(child: CircularProgressIndicator());
      if (controller.kpiError.value.isNotEmpty) return Center(child: Text(controller.kpiError.value, style: const TextStyle(color: Colors.red)));
      if (rows.isEmpty) return const Center(child: Text("No map data"));

      final center = rows.isNotEmpty
          ? MapLatLng(_toDouble(rows.first["latitude"], fallback: 36.8), _toDouble(rows.first["longitude"], fallback: 10.2))
          : MapLatLng(36.8, 10.2);

      return SfMaps(
        layers: [
          MapTileLayer(
            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            initialFocalLatLng: center,
            initialZoomLevel: 6,
            initialMarkersCount: rows.length,
            markerBuilder: (context, index) {
              final d = rows[index];
              final status = (d["validationStatut"] ?? "").toString();
              final isValid = status == "Validated";
              return MapMarker(
                latitude: _toDouble(d["latitude"]),
                longitude: _toDouble(d["longitude"]),
                child: Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: isValid ? Colors.green : Colors.red,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(d["nomProjet"] ?? "Project", style: const TextStyle(color: Colors.white)),
                ),
              );
            },
          ),
        ],
      );
    });
  }

 ResponsiveGridCol _commonCard(int count, Widget child) {
  return ResponsiveGridCol(
    xs: 12,
    sm: 12,
    md: count,
    lg: count,
    xl: count,
    child: Container(
      margin: const EdgeInsets.symmetric(horizontal: 6, vertical: 6), // 🔥 réduit
      padding: const EdgeInsets.all(12), // 🔥 propre
      decoration: BoxDecoration(
        color: themeController.isDarkMode ? colorDark : colorWhite,
        borderRadius: BorderRadius.circular(12),
        boxShadow: const [
          BoxShadow(
            blurRadius: 4, // 🔥 plus subtil
            color: Colors.black12,
          )
        ],
      ),
      child: child,
    ),
  );
}
}