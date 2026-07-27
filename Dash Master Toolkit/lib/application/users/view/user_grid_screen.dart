import 'package:dash_master_toolkit/application/users/controller/user_grid_controller.dart';
import 'package:dash_master_toolkit/application/users/model/project_grid_data.dart';
import 'package:dash_master_toolkit/forms/constants/product_family.dart';
import 'package:dash_master_toolkit/constant/app_color.dart';
import 'package:dash_master_toolkit/constant/app_images.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/theme/theme_controller.dart';
import 'package:dash_master_toolkit/widgets/common_app_widget.dart';
import 'package:dash_master_toolkit/widgets/common_search_field.dart';
import 'package:dash_master_toolkit/forms/view/ProjectCommentScreen.dart';
import 'package:dash_master_toolkit/app_shell_route/components/topbar/NotificationController.dart';
import 'package:dash_master_toolkit/forms/view/archive_request_dialog.dart';
import 'package:dash_master_toolkit/providers/archive_request_provider.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';
import 'package:responsive_grid/responsive_grid.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;
import 'package:dash_master_toolkit/providers/api_client.dart';
import 'package:dash_master_toolkit/application/users/model/user_projects_response.dart';
import 'dart:html' as html;
import 'package:excel/excel.dart' as excel;
class UserGridScreen extends StatefulWidget {
  // Filtres reçus depuis la navigation (cartes KPI cliquables du dashboard,
  // donut/barres statut, graphique famille/diamètre) — clés attendues :
  // 'statut', 'family', 'diameter', 'validation', 'followup'.
  final Map<String, String>? initialFilters;

  const UserGridScreen({super.key, this.initialFilters});

  @override
  State<UserGridScreen> createState() => _UserGridScreenState();
}

class _UserGridScreenState extends State<UserGridScreen> {

  final controller = Get.put(UserGridController());
String? selectedStatusFilter;
String? selectedModele;
String? selectedProductFamily;
int? selectedDiameter;
String? selectedUser;
// Filtres additionnels pilotés uniquement par la navigation depuis le
// dashboard (pas de dropdown dédié) — "Mes Validations" / "Projets à suivre".
String? selectedValidationFilter;
bool followupOnly = false;
String? editableProjectId;   // id of the row currently unlocked for editing
List<String> users = [];
  UserProjectsResponse? _response;
Future<void> loadUsers() async {
  try {
    final res = await ApiClient.instance.dio.get("/users");

    final data = res.data as List;

    setState(() {
      users = data
          .map((u) => u["email"].toString()) // ou u["id"]
          .toList();
    });

  } catch (e) {
    print("❌ LOAD USERS ERROR: $e");
  }
}
String safe(dynamic v) {
  if (v == null || v.toString().trim().isEmpty || v.toString() == "null") {
    return "-";
  }
  return v.toString();
}
void _exportExcelFull() {
  final items = controller.filtered;

  var excelFile = excel.Excel.createExcel();
  excel.Sheet sheet = excelFile['Projects'];

  final headers = [
    'Project Name',    // 0
    'Start Date',      // 1
    'Engineer',        // 2
    'Company',         // 3
    'Product Family',  // 4
    'Diameter (mm)',   // 5
    'Status',          // 6
    'Validation',      // 7
    'Surface',         // 8 ✅ NUMBER
    'Réussite %',      // 9 ✅ NUMBER
  ];

  /// HEADER
  sheet.appendRow(headers);

  for (int i = 0; i < headers.length; i++) {
    sheet
        .cell(excel.CellIndex.indexByColumnRow(columnIndex: i, rowIndex: 0))
        .cellStyle = excel.CellStyle(
      bold: true,
      backgroundColorHex: "#111827",
      fontColorHex: "#FFFFFF",
      horizontalAlign: excel.HorizontalAlign.Center,
    );
  }

  /// GROUP BY USER
  Map<String, List<ProjectGridData>> grouped = {};

  for (var p in items) {
    final user = p.ownerName ?? "Unknown";
    grouped.putIfAbsent(user, () => []).add(p);
  }

  List<String> userColors = [
    "#DBEAFE",
    "#FEF3C7",
    "#DCFCE7",
    "#FCE7F3",
  ];

  int rowIndex = 1;
  int colorIndex = 0;

  grouped.forEach((user, projects) {
    String userColor = userColors[colorIndex % userColors.length];
    colorIndex++;

    /// 🔥 USER HEADER
    sheet.appendRow([
      "👤 $user (${projects.length})",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);

    for (int col = 0; col < headers.length; col++) {
      sheet
          .cell(excel.CellIndex.indexByColumnRow(
              columnIndex: col, rowIndex: rowIndex))
          .cellStyle = excel.CellStyle(
        backgroundColorHex: userColor,
        bold: true,
      );
    }

    rowIndex++;

    /// 🔥 PROJECTS
    for (var p in projects) {
      /// ✅ CONVERSION EN DOUBLE (IMPORTANT)
      double? surface =
          double.tryParse(p.surfaceProspectee ?? "");

      double? success =
          double.tryParse(p.pourcentageReussite ?? "");

      sheet.appendRow([
        safe(p.nomProjet),
        safe(p.dateDemarrage),
        safe(p.ingenieurResponsable),
        safe(p.entreprise),
        p.productFamilyLabelText,
        p.diameterLabel,
        "  ${safe(p.statut)}  ",
        "  ${safe(p.validationStatut)}  ",
        surface ?? "",   // ✅ NUMBER
        success ?? "",   // ✅ NUMBER
      ]);

      /// 🎨 STATUS
      sheet
          .cell(excel.CellIndex.indexByColumnRow(columnIndex: 6, rowIndex: rowIndex))
          .cellStyle = excel.CellStyle(
        backgroundColorHex: _getStatusColorHex(p.statut),
        bold: true,
        horizontalAlign: excel.HorizontalAlign.Center,
      );

      /// 🎨 VALIDATION
      sheet
          .cell(excel.CellIndex.indexByColumnRow(columnIndex: 7, rowIndex: rowIndex))
          .cellStyle = excel.CellStyle(
        backgroundColorHex: _getValidationColorHex(p.validationStatut),
        fontColorHex: "#FFFFFF",
        bold: true,
        horizontalAlign: excel.HorizontalAlign.Center,
      );

      /// 🎨 COLOR SUCCESS
      String color;
      if (success != null && success >= 80) {
        color = "#22C55E";
      } else if (success != null && success >= 50) {
        color = "#F59E0B";
      } else {
        color = "#EF4444";
      }

      sheet
          .cell(excel.CellIndex.indexByColumnRow(columnIndex: 9, rowIndex: rowIndex))
          .cellStyle = excel.CellStyle(
        backgroundColorHex: color,
        fontColorHex: "#FFFFFF",
        bold: true,
        horizontalAlign: excel.HorizontalAlign.Center,
      );

      rowIndex++;
    }

    /// ESPACE ENTRE USERS
    sheet.appendRow([""]);
    rowIndex++;
  });

  /// LARGEUR
  for (int i = 0; i < headers.length; i++) {
    sheet.setColWidth(i, 30);
  }

  /// SAVE
  final bytes = excelFile.encode();
  if (bytes == null) return;

  final blob = html.Blob(
    [bytes],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );

  final url = html.Url.createObjectUrlFromBlob(blob);

  html.AnchorElement(href: url)
    ..setAttribute('download', 'projects_grouped_advanced.xlsx')
    ..click();

  html.Url.revokeObjectUrl(url);
}
String _getModelColorHex(String? model) {
  switch (model) {
    case "project":
      return "#DBEAFE";
    case "revendeur":
      return "#FEF3C7";
    case "applicateur":
      return "#DCFCE7";
    default:
      return "#E5E7EB";
  }
}
String _getStatusColorHex(String? status) {
  switch (status) {
    case "Gagné":       case "Actif":        case "Fidélisation": return "#DCFCE7";
    case "Perdu":       case "Raté":                              return "#FEE2E2";
    case "Prospect":                                              return "#DBEAFE";
    case "Offre":       case "Négociation":                       return "#FEF3C7";
    case "Identification":                                        return "#EDE9FE";
    case "Contacté":    case "Visite":                            return "#E0F2FE";
    case "Plan technique": case "Devis envoyé":                   return "#F3E8FF";
    case "Echantillonnage":                                       return "#CCFBF1";
    default:                                                      return "#F3F4F6";
  }
}

String _getValidationColorHex(String? value) {
  if (value == "Validé") return "#22C55E"; // vert fort
  if (value == "Non validé") return "#F59E0B"; // orange
  return "#E5E7EB";
}

// Filtre automatique reçu depuis une carte KPI / donut / barre / graphique
// cliqué sur le dashboard (voir dashboard_screen.dart _goToProjectList) —
// 'statut'/'family'/'diameter' réutilisent les dropdowns existants,
// 'validation'/'followup' n'ont pas de dropdown dédié (voir _activeFilterBanner).
void _applyInitialFilters() {
  final f = widget.initialFilters;
  if (f == null || f.isEmpty) return;
  final statut     = f['statut'];
  final family     = f['family'];
  final diameter   = int.tryParse(f['diameter'] ?? '');
  final validation = f['validation'];
  final followup   = f['followup'] == '1';
  if (statut != null && statut.isNotEmpty)     selectedStatusFilter   = statut;
  if (family != null && family.isNotEmpty)     selectedProductFamily  = family;
  if (diameter != null)                        selectedDiameter       = diameter;
  if (validation != null && validation.isNotEmpty) selectedValidationFilter = validation;
  if (followup)                                 followupOnly           = true;
}

@override
void initState() {
  super.initState();
  _applyInitialFilters();
  loadUsers();
  // Auto-reload project list when an unarchive request is approved
  ever(
    ArchiveRequestProvider.to.lastApprovedAt,
    (_) => controller.loadProjects(),
  );
}
  int currentPage = 1;
  int rowsPerPage = 5;
// ── All statuses merged (used by filter dropdown) ──────────────────────────
final List<String> ALL_STATUSES = [
  // project
  'Identification', 'Prospect', 'Contacté', 'Visite',
  'Plan technique', 'Echantillonnage', 'Devis envoyé',
  'Négociation', 'Gagné', 'Perdu', 'Fidélisation',
  // revendeur
  'Offre', 'Actif', 'Raté',
];

// ── Statuses per model ──────────────────────────────────────────────────────
List<String> getStatuses(String model) {
  switch (model) {
    case 'revendeur':
      return ['Prospect', 'Offre', 'Actif', 'Raté'];
    case 'applicateur':
      return [];
    default: // project
      return [
        'Identification', 'Prospect', 'Contacté', 'Visite',
        'Plan technique', 'Echantillonnage', 'Devis envoyé',
        'Négociation', 'Gagné', 'Perdu', 'Fidélisation',
      ];
  }
}

Color getStatusColor(String status) {
  switch (status) {
    case 'Gagné':       case 'Actif':       case 'Fidélisation': return const Color(0xFF22C55E);
    case 'Perdu':       case 'Raté':                             return const Color(0xFFEF4444);
    case 'Prospect':                                             return const Color(0xFF3B82F6);
    case 'Offre':       case 'Négociation':                      return const Color(0xFFF59E0B);
    case 'Identification':                                       return const Color(0xFF6366F1);
    case 'Contacté':    case 'Visite':                           return const Color(0xFF0EA5E9);
    case 'Plan technique': case 'Devis envoyé':                  return const Color(0xFF8B5CF6);
    case 'Echantillonnage':                                      return const Color(0xFF14B8A6);
    default:                                                     return const Color(0xFF6B7280);
  }
}

  // ── Action button helper ─────────────────────────────────────────────────
  static const _kBg   = Color(0xFFF6F8FC);
  static const _kCard = Colors.white;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _kBg,
      body: Column(children: [

        // ── TOP BAR ───────────────────────────────────────────────────────
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 18),
          decoration: const BoxDecoration(
            color: _kCard,
            border: Border(bottom: BorderSide(color: Color(0xFFEEF2F7), width: 1)),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Projects',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800,
                        color: Color(0xFF0F172A), letterSpacing: -0.5)),
                const SizedBox(height: 2),
                Obx(() => Text(
                  '${controller.filtered.length} records',
                  style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                )),
              ]),
              Wrap(spacing: 10, runSpacing: 8, children: [
                _topBtn(Icons.view_kanban_rounded, 'Pipeline',
                    const Color(0xFF6366F1), () => context.go(MyRoute.projectPipeline)),
                _topBtn(Icons.add_rounded, 'New Project',
                    const Color(0xFF10B981), () => context.go(MyRoute.projectFormScreen)),
                _topBtn(Icons.download_rounded, 'Export',
                    const Color(0xFF0F172A), _exportExcelFull),
              ]),
            ],
          ),
        ),

        // ── FILTER BAR ────────────────────────────────────────────────────
        Container(
          color: _kCard,
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 14),
          child: Row(children: [
            Expanded(flex: 4, child: _searchField()),
            const SizedBox(width: 10),
            Expanded(flex: 2, child: _filterDropdown<String>(
              hint: AppLocalizations.of(context).translate('Tous les modèles'),
              value: selectedModele,
              items: [null, 'project', 'revendeur', 'applicateur'],
              labelOf: (v) => AppLocalizations.of(context).translate(switch (v) {
                'project'     => 'Project',
                'revendeur'   => 'Revendeur',
                'applicateur' => 'Applicateur',
                _             => 'Tous les modèles',
              }),
              onChanged: (v) => setState(() { selectedModele = v; currentPage = 1; }),
            )),
            const SizedBox(width: 10),
            Expanded(flex: 2, child: _filterDropdown<String>(
              hint: AppLocalizations.of(context).translate('All statuses'),
              value: selectedStatusFilter,
              items: [null, ...ALL_STATUSES],
              labelOf: (v) => AppLocalizations.of(context).translate(v ?? 'All statuses'),
              onChanged: (v) => setState(() { selectedStatusFilter = v; currentPage = 1; }),
            )),
            const SizedBox(width: 10),
            Expanded(flex: 2, child: _filterDropdown<String>(
              hint: AppLocalizations.of(context).translate('All users'),
              value: selectedUser,
              items: [null, ...users],
              labelOf: (v) => v ?? AppLocalizations.of(context).translate('All users'),
              onChanged: (v) => setState(() { selectedUser = v; currentPage = 1; }),
            )),
            const SizedBox(width: 10),
            Expanded(flex: 2, child: _filterDropdown<String>(
              hint: AppLocalizations.of(context).translate('Toutes familles'),
              value: selectedProductFamily,
              items: [null, ...kProductFamilies],
              labelOf: (v) => v == null ? AppLocalizations.of(context).translate('Toutes familles') : productFamilyLabel(v),
              onChanged: (v) => setState(() {
                selectedProductFamily = v;
                selectedDiameter = null;
                currentPage = 1;
              }),
            )),
            const SizedBox(width: 10),
            Expanded(flex: 2, child: _filterDropdown<int>(
              hint: AppLocalizations.of(context).translate('Tous diamètres'),
              value: selectedDiameter,
              items: [null, ...(kDiametersByFamily[selectedProductFamily] ?? const <int>[])],
              labelOf: (v) => v == null ? AppLocalizations.of(context).translate('Tous diamètres') : diameterLabel(v),
              onChanged: (v) => setState(() { selectedDiameter = v; currentPage = 1; }),
            )),
          ]),
        ),

        // ── FILTRE ACTIF (venu du dashboard, pas de dropdown dédié) ─────────
        if (selectedValidationFilter != null || followupOnly)
          Container(
            width: double.infinity,
            color: _kCard,
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 14),
            child: Wrap(spacing: 8, children: [
              if (selectedValidationFilter != null)
                _activeFilterChip(
                  selectedValidationFilter == 'Validé'
                      ? 'Projets terminés (validés)'
                      : 'En attente de validation',
                  () => setState(() { selectedValidationFilter = null; currentPage = 1; }),
                ),
              if (followupOnly)
                _activeFilterChip(
                  'Projets à suivre',
                  () => setState(() { followupOnly = false; currentPage = 1; }),
                ),
            ]),
          ),

        // ── TABLE ─────────────────────────────────────────────────────────
        Expanded(
          child: Obx(() {
            var list = controller.filtered.toList();
            if (selectedModele != null) {
              list = list.where((p) => p.projectModele == selectedModele).toList();
            }
            if (selectedStatusFilter != null) {
              list = list.where((p) =>
                p.statut.toLowerCase().trim() ==
                selectedStatusFilter!.toLowerCase().trim()).toList();
            }
            if (selectedUser != null) {
              list = list.where((p) => p.ownerName == selectedUser).toList();
            }
            if (selectedProductFamily != null) {
              list = list.where((p) => p.productFamily == selectedProductFamily).toList();
            }
            if (selectedDiameter != null) {
              list = list.where((p) => p.diameterMm == selectedDiameter).toList();
            }
            // "Mes Validations" (validation=Non validé / Validé) — filtre venu
            // du dashboard, pas de dropdown dédié (voir _applyInitialFilters).
            if (selectedValidationFilter != null) {
              list = list.where((p) => p.validationStatut == selectedValidationFilter).toList();
            }
            // "Projets à suivre" — statut actif, ni gagné ni perdu (même
            // définition que followupProjects côté backend, voir
            // dashboard.service.js getUserDashboard).
            if (followupOnly) {
              list = list.where((p) => p.statut != 'Gagné' && p.statut != 'Perdu').toList();
            }
            final totalPages = (list.isEmpty ? 1 :
                (list.length / rowsPerPage).ceil());
            final safePage   = currentPage.clamp(1, totalPages);
            final start      = (safePage - 1) * rowsPerPage;
            final paginated  = list.sublist(
                start, (start + rowsPerPage).clamp(0, list.length));

            return Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 16),
              child: Container(
                decoration: BoxDecoration(
                  color: _kCard,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(color: Colors.black.withOpacity(0.05),
                        blurRadius: 24, offset: const Offset(0, 8)),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: Column(children: [

                    // Header + rows scroll horizontally together;
                    // rows still scroll vertically inside.
                    Expanded(
                      child: LayoutBuilder(
                        builder: (ctx, constraints) {
                          final tableWidth = constraints.maxWidth < 900
                              ? 900.0
                              : constraints.maxWidth;
                          return SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: SizedBox(
                              width: tableWidth,
                              height: constraints.maxHeight,
                              child: Column(children: [
                                _tableHeader(),
                                Expanded(
                                  child: paginated.isEmpty
                                      ? _emptyState()
                                      : ListView.builder(
                                          itemCount: paginated.length,
                                          itemBuilder: (_, i) =>
                                              _row(paginated[i]),
                                        ),
                                ),
                              ]),
                            ),
                          );
                        },
                      ),
                    ),

                    _paginationFooter(list.length, safePage, totalPages),

                  ]),
                ),
              ),
            );
          }),
        ),
      ]),
    );
  }

  // ── Top bar button ────────────────────────────────────────────────────────
  Widget _topBtn(IconData icon, String label, Color color, VoidCallback onTap) =>
      Material(
        color: color,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(icon, size: 15, color: Colors.white),
              const SizedBox(width: 7),
              Text(label, style: const TextStyle(fontSize: 13,
                  fontWeight: FontWeight.w600, color: Colors.white)),
            ]),
          ),
        ),
      );

  // ── Active filter chip (venu du dashboard) ─────────────────────────────────
  Widget _activeFilterChip(String label, VoidCallback onClear) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: const Color(0xFFEEF2FF),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: const Color(0xFF6366F1).withOpacity(0.3)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.filter_alt_rounded, size: 14, color: Color(0xFF4F46E5)),
          const SizedBox(width: 6),
          Text('${AppLocalizations.of(context).translate('Filtre')} : ${AppLocalizations.of(context).translate(label)}',
              style: const TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF4F46E5))),
          const SizedBox(width: 6),
          MouseRegion(
            cursor: SystemMouseCursors.click,
            child: GestureDetector(
              onTap: onClear,
              child: const Icon(Icons.close_rounded, size: 14, color: Color(0xFF4F46E5)),
            ),
          ),
        ]),
      );

  // ── Search field ─────────────────────────────────────────────────────────
  Widget _searchField() => TextField(
    controller: controller.searchController,
    onChanged: controller.searchProject,
    style: const TextStyle(fontSize: 13),
    decoration: InputDecoration(
      hintText: 'Search projects…',
      hintStyle: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 13),
      prefixIcon: const Icon(Icons.search_rounded, size: 18, color: Color(0xFF94A3B8)),
      filled: true,
      fillColor: const Color(0xFFF8FAFC),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFE2E8F0))),
      enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFE2E8F0))),
      focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFF6366F1), width: 1.5)),
    ),
  );

  // ── Generic filter dropdown ───────────────────────────────────────────────
  Widget _filterDropdown<T>({
    required String hint,
    required T? value,
    required List<T?> items,
    required String Function(T?) labelOf,
    required void Function(T?) onChanged,
  }) =>
      DropdownButtonFormField<T>(
        value: value,
        isExpanded: true,
        style: const TextStyle(fontSize: 13, color: Color(0xFF0F172A)),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 13),
          filled: true,
          fillColor: const Color(0xFFF8FAFC),
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFFE2E8F0))),
          enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFFE2E8F0))),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFF6366F1), width: 1.5)),
        ),
        items: items.map((v) => DropdownMenuItem<T>(
          value: v,
          child: Text(labelOf(v),
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13)),
        )).toList(),
        onChanged: onChanged,
      );

  // ── Pagination footer ─────────────────────────────────────────────────────
  Widget _paginationFooter(int total, int page, int totalPages) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: Color(0xFFF1F5F9))),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text('$total result${total == 1 ? '' : 's'}',
              style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
          Row(children: [
            _pageBtn(Icons.chevron_left_rounded, page > 1,
                () => setState(() => currentPage = page - 1)),
            const SizedBox(width: 4),
            ...List.generate(totalPages.clamp(0, 7), (i) {
              final n = i + 1;
              final active = n == page;
              return GestureDetector(
                onTap: () => setState(() => currentPage = n),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  margin: const EdgeInsets.symmetric(horizontal: 2),
                  width: 30, height: 30,
                  decoration: BoxDecoration(
                    color: active ? const Color(0xFF6366F1) : Colors.transparent,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Center(child: Text('$n',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                          color: active ? Colors.white : const Color(0xFF64748B)))),
                ),
              );
            }),
            const SizedBox(width: 4),
            _pageBtn(Icons.chevron_right_rounded, page < totalPages,
                () => setState(() => currentPage = page + 1)),
          ]),
          DropdownButton<int>(
            value: rowsPerPage,
            underline: const SizedBox(),
            style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
            items: [5, 10, 20, 50].map((n) =>
                DropdownMenuItem(value: n, child: Text('$n / page'))).toList(),
            onChanged: (v) => setState(() { rowsPerPage = v!; currentPage = 1; }),
          ),
        ],
      ),
    );
  }

  Widget _pageBtn(IconData icon, bool enabled, VoidCallback onTap) =>
      InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          width: 30, height: 30,
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFFE2E8F0)),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, size: 16,
              color: enabled ? const Color(0xFF64748B) : const Color(0xFFCBD5E1)),
        ),
      );

  // ── Empty state ───────────────────────────────────────────────────────────
  Widget _emptyState() => const Center(child: Padding(
    padding: EdgeInsets.all(48),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      Icon(Icons.inbox_rounded, size: 48, color: Color(0xFFCBD5E1)),
      SizedBox(height: 12),
      Text('No projects found',
          style: TextStyle(fontSize: 14, color: Color(0xFF94A3B8),
              fontWeight: FontWeight.w500)),
    ]),
  ));

  // ── Table header ─────────────────────────────────────────────────────────
  Widget _tableHeader() {
    const style = TextStyle(
      fontSize: 10,
      fontWeight: FontWeight.w700,
      color: Color(0xFF94A3B8),
      letterSpacing: 1.2,
    );
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
      decoration: const BoxDecoration(
        color: Color(0xFFF8FAFC),
        border: Border(bottom: BorderSide(color: Color(0xFFEEF2F7), width: 1.5)),
      ),
      child: const Row(children: [
        Expanded(flex: 26, child: Text('PROJECT',  style: style)),
        Expanded(flex: 10, child: Text('DIAMETER', style: style)),
        Expanded(flex: 11, child: Text('MODÈLE',   style: style)),
        Expanded(flex: 11, child: Text('START',    style: style)),
        Expanded(flex: 18, child: Text('STATUT',   style: style)),
        Expanded(flex: 12, child: Text('ACTIVITY', style: style)),
        Expanded(flex: 12, child: Text('ACTIONS',  style: style)),
      ]),
    );
  }

  // ── Model badge ──────────────────────────────────────────────────────────
  Widget _modelBadge(String model) {
    final (Color color, String label) = switch (model) {
      'revendeur'   => (const Color(0xFFF59E0B), 'Revendeur'),
      'applicateur' => (const Color(0xFF10B981), 'Applicateur'),
      _             => (const Color(0xFF6366F1), 'Project'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(30),
        border: Border.all(color: color.withOpacity(0.22), width: 1),
      ),
      child: Text(label,
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color,
              letterSpacing: 0.2)),
    );
  }

  // ── Row ───────────────────────────────────────────────────────────────────
  Widget _row(ProjectGridData p) {
    final isArchived    = p.isArchived;
    final statuses      = getStatuses(p.projectModele);
    final safeStatut    = statuses.contains(p.statut)
        ? p.statut
        : (statuses.isNotEmpty ? statuses.first : '');

    // Selection state
    final bool isSelected   = editableProjectId == p.id;
    final bool hasSelection = editableProjectId != null;

    // Status dropdown is disabled when archived OR when another row is selected
    final bool statusDisabled = isArchived || (hasSelection && !isSelected);

    Widget row = _HoverRow(
      // Row-tap navigates to form only when no selection is active
      onTap: (isArchived || hasSelection) ? null : () => context.go(_editUrl(p.id)),
      archived: isArchived,
      hasDevis: p.hasDevis,
      hasBonCommande: p.hasBonCommande,
      isSelected: isSelected,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
        child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [

          // ── PROJECT ──────────────────────────────────────────────────────
          Expanded(flex: 26, child: Row(children: [
            _avatar(p.nomProjet, isArchived ? 'archived' : p.projectModele),
            const SizedBox(width: 12),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(children: [
                  Expanded(child: Text(
                    p.nomProjet,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: isArchived
                          ? const Color(0xFF94A3B8)
                          : const Color(0xFF0F172A),
                      decoration: isArchived ? TextDecoration.lineThrough : null,
                      letterSpacing: -0.2,
                    ),
                  )),
                  if (isArchived) _archiveBadge(),
                  _pendingBadge(p.id),
                ]),
                const SizedBox(height: 3),
                Text(
                  p.ownerName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8),
                      fontWeight: FontWeight.w500),
                ),
              ],
            )),
          ])),

          // ── DIAMETER ─────────────────────────────────────────────────────
          Expanded(flex: 10,
              child: p.projectModele != 'project'
                  ? const Text('—',
                      style: TextStyle(color: Color(0xFFCBD5E1), fontSize: 13))
                  : _diameterDropdown(p, isArchived || (hasSelection && !isSelected))),

          // ── MODÈLE ───────────────────────────────────────────────────────
          Expanded(flex: 11, child: _modelBadge(p.projectModele)),

          // ── START DATE ───────────────────────────────────────────────────
          Expanded(flex: 11, child: Row(children: [
            if (p.dateDemarrage.isNotEmpty) ...[
              const Icon(Icons.calendar_today_rounded,
                  size: 11, color: Color(0xFFCBD5E1)),
              const SizedBox(width: 5),
            ],
            Expanded(child: Text(
              p.dateDemarrage.isEmpty ? '—' : p.dateDemarrage,
              style: const TextStyle(fontSize: 12, color: Color(0xFF475569),
                  fontWeight: FontWeight.w500),
            )),
          ])),

          // ── STATUT ───────────────────────────────────────────────────────
          Expanded(flex: 18,
              child: p.projectModele == 'applicateur'
                  ? const Text('—',
                      style: TextStyle(color: Color(0xFFCBD5E1), fontSize: 13))
                  : _statusDropdown(p, statuses, safeStatut, statusDisabled)),

          // ── ACTIVITY ─────────────────────────────────────────────────────
          Expanded(flex: 12, child: Wrap(
            spacing: 5,
            runSpacing: 4,
            children: [
              _activityBadge('📅', p.taskCount,   const Color(0xFF6366F1)),
              _activityBadge('💬', p.commentCount, const Color(0xFF3B82F6)),
            ],
          )),

          // ── ACTIONS ──────────────────────────────────────────────────────
          Expanded(flex: 12, child: Wrap(
            spacing: 4,
            runSpacing: 4,
            children: [
              _circleBtn(Icons.timeline_rounded, const Color(0xFF6366F1),
                  'Timeline', () => context.go('/forms/project-timeline?projectId=${p.id}')),
              if (isArchived) ...[
                // Discussion: open archive requests chat page
                _circleBtn(Icons.forum_outlined, const Color(0xFF8B5CF6),
                    'Discussion', () => context.go('/forms/archive-requests')),
                // Unarchive request dialog — réservé au propriétaire du projet
                _circleBtn(Icons.unarchive_outlined, const Color(0xFFF59E0B),
                    'Demande de désarchivage',
                    () => _requestArchiveAction(p, type: 'DESARCHIVAGE')),
              ] else ...[
                // Archive request dialog — réservé au propriétaire du projet
                // (project stays active until approved)
                _circleBtn(Icons.archive_outlined, const Color(0xFF64748B),
                    "Demande d'archivage",
                    () => _requestArchiveAction(p, type: 'ARCHIVAGE')),
                // Edit/Done toggle: selects this row or deselects it
                _circleBtn(
                  isSelected
                      ? Icons.check_circle_rounded
                      : Icons.edit_rounded,
                  isSelected
                      ? const Color(0xFF10B981)
                      : const Color(0xFF3B82F6),
                  isSelected ? 'Terminer' : 'Modifier',
                  () => setState(() {
                    editableProjectId = isSelected ? null : p.id;
                  }),
                ),
                _moreBtn(p),
              ],
            ],
          )),

        ]),
      ),
    );

    // Non-selected rows (while another row is in edit mode): fade + block input
    if (hasSelection && !isSelected) {
      return AnimatedOpacity(
        duration: const Duration(milliseconds: 250),
        opacity: 0.45,
        child: IgnorePointer(ignoring: true, child: row),
      );
    }
    return row;
  }

  // ── Garde propriétaire — demande d'archivage/désarchivage ──────────────────
  // Seul le propriétaire du projet (project.ownerId == currentUser.id) peut
  // déclencher une demande. Vérifié AVANT d'ouvrir la popup de confirmation :
  // aucune requête API n'est envoyée si l'utilisateur n'est pas propriétaire.
  // Le backend revalide indépendamment (voir archiveRequest.service.js).
  void _requestArchiveAction(ProjectGridData p, {required String type}) {
    final currentUserId = AuthService().userId ?? '';
    final ownerId = p.ownerId ?? '';
    final isOwner = ownerId.isNotEmpty && ownerId == currentUserId;

    if (!isOwner) {
      showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Accès refusé'),
          content: const Text(
            "Vous n'êtes pas le propriétaire de ce projet.\n"
            "Seul le propriétaire peut demander son archivage ou son désarchivage.",
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('OK'),
            ),
          ],
        ),
      );
      return;
    }

    showArchiveRequestDialog(
      context,
      projectId:   p.id,
      projectName: p.nomProjet,
      type:        type,
    );
  }

  // ── Status dropdown ───────────────────────────────────────────────────────
  Widget _statusDropdown(
      ProjectGridData p, List<String> statuses, String safeStatut, bool isArchived) {
    final color = getStatusColor(safeStatut);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(30),
        border: Border.all(color: color.withOpacity(0.22), width: 1),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: safeStatut.isEmpty ? null : safeStatut,
          isExpanded: true,
          isDense: true,
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color),
          iconEnabledColor: color.withOpacity(0.7),
          iconSize: 16,
          dropdownColor: Colors.white,
          borderRadius: BorderRadius.circular(16),
          elevation: 8,
          items: statuses.map((s) {
            final c = getStatusColor(s);
            return DropdownMenuItem<String>(
              value: s,
              child: Row(children: [
                Container(width: 7, height: 7,
                    decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
                const SizedBox(width: 9),
                Text(AppLocalizations.of(context).translate(s), style: TextStyle(fontSize: 12, color: c,
                    fontWeight: FontWeight.w600)),
              ]),
            );
          }).toList(),
          onChanged: isArchived ? null : (value) async {
            if (value == null) return;

            final modele = p.projectModele.toLowerCase().trim();
            debugPrint('MODELE = $modele');
            debugPrint('STATUT = $value');

            // Optimistic update — sync BOTH projects + filtered so Obx sees the change
            final updated = p.copyWith(statut: value);
            final pi = controller.projects.indexWhere((x) => x.id == p.id);
            if (pi != -1) controller.projects[pi] = updated;
            final fi = controller.filtered.indexWhere((x) => x.id == p.id);
            if (fi != -1) controller.filtered[fi] = updated;
            controller.forceRefresh();

            try {
              await ApiClient.instance.dio
                  .put('/projects/${p.id}', data: {'statut': value});
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                  content: Row(children: [
                    const Icon(Icons.check_circle_rounded,
                        color: Colors.white, size: 16),
                    const SizedBox(width: 8),
                    Text('Statut → $value'),
                  ]),
                  backgroundColor: const Color(0xFF10B981),
                  duration: const Duration(seconds: 2),
                  behavior: SnackBarBehavior.floating,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                ));
              }
            } catch (e) {
              debugPrint('STATUS UPDATE ERROR: $e');
              // Rollback both lists
              final ri = controller.projects.indexWhere((x) => x.id == p.id);
              if (ri != -1) controller.projects[ri] = p;
              final rfi = controller.filtered.indexWhere((x) => x.id == p.id);
              if (rfi != -1) controller.filtered[rfi] = p;
              controller.forceRefresh();
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                  content: Text('Échec de la mise à jour du statut'),
                  backgroundColor: Color(0xFFEF4444),
                  behavior: SnackBarBehavior.floating,
                ));
              }
            }
          },
        ),
      ),
    );
  }

  // ── Diameter dropdown (inline edit, mirrors _statusDropdown) ────────────────
  Widget _diameterDropdown(ProjectGridData p, bool disabled) {
    final options = kDiametersByFamily[p.productFamily] ?? const <int>[];
    final value = options.contains(p.diameterMm) ? p.diameterMm : null;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFF6366F1).withOpacity(0.08),
        borderRadius: BorderRadius.circular(30),
        border: Border.all(color: const Color(0xFF6366F1).withOpacity(0.22), width: 1),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<int>(
          value: value,
          isExpanded: true,
          isDense: true,
          hint: const Text('—',
              style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF6366F1)),
          iconEnabledColor: const Color(0xFF6366F1).withOpacity(0.7),
          iconSize: 16,
          dropdownColor: Colors.white,
          borderRadius: BorderRadius.circular(16),
          elevation: 8,
          items: options.map((mm) => DropdownMenuItem<int>(
            value: mm,
            child: Text(diameterLabel(mm), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
          )).toList(),
          onChanged: (disabled || options.isEmpty) ? null : (mmValue) async {
            if (mmValue == null) return;

            // Optimistic update — sync BOTH projects + filtered so Obx sees the change
            final updated = p.copyWith(diameterMm: mmValue);
            final pi = controller.projects.indexWhere((x) => x.id == p.id);
            if (pi != -1) controller.projects[pi] = updated;
            final fi = controller.filtered.indexWhere((x) => x.id == p.id);
            if (fi != -1) controller.filtered[fi] = updated;
            controller.forceRefresh();

            try {
              await ApiClient.instance.dio
                  .put('/projects/${p.id}', data: {'diameterMm': mmValue});
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                  content: Row(children: [
                    const Icon(Icons.check_circle_rounded,
                        color: Colors.white, size: 16),
                    const SizedBox(width: 8),
                    Text('Diamètre → ${diameterLabel(mmValue)}'),
                  ]),
                  backgroundColor: const Color(0xFF10B981),
                  duration: const Duration(seconds: 2),
                  behavior: SnackBarBehavior.floating,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                ));
              }
            } catch (e) {
              debugPrint('DIAMETER UPDATE ERROR: $e');
              // Rollback both lists
              final ri = controller.projects.indexWhere((x) => x.id == p.id);
              if (ri != -1) controller.projects[ri] = p;
              final rfi = controller.filtered.indexWhere((x) => x.id == p.id);
              if (rfi != -1) controller.filtered[rfi] = p;
              controller.forceRefresh();
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                  content: Text('Échec de la mise à jour du diamètre'),
                  backgroundColor: Color(0xFFEF4444),
                  behavior: SnackBarBehavior.floating,
                ));
              }
            }
          },
        ),
      ),
    );
  }

  // ── Gradient avatar ───────────────────────────────────────────────────────
  Widget _avatar(String name, String model) {
    final (Color c1, Color c2) = switch (model) {
      'revendeur'   => (const Color(0xFFF59E0B), const Color(0xFFEF7C0A)),
      'applicateur' => (const Color(0xFF10B981), const Color(0xFF059669)),
      'archived'    => (const Color(0xFF94A3B8), const Color(0xFF64748B)),
      _             => (const Color(0xFF6366F1), const Color(0xFF4F46E5)),
    };
    return Container(
      width: 40, height: 40,
      decoration: BoxDecoration(
        gradient: LinearGradient(
            colors: [c1, c2],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(color: c2.withOpacity(0.35),
              blurRadius: 8, offset: const Offset(0, 3)),
        ],
      ),
      child: Center(child: Text(
        name.isNotEmpty ? name[0].toUpperCase() : 'P',
        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800,
            color: Colors.white),
      )),
    );
  }

  // ── Activity badge ────────────────────────────────────────────────────────
  Widget _activityBadge(String emoji, int count, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
    decoration: BoxDecoration(
      color: color.withOpacity(0.07),
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: color.withOpacity(0.18)),
    ),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Text(emoji, style: const TextStyle(fontSize: 10)),
      const SizedBox(width: 3),
      Text('$count',
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color)),
    ]),
  );

  // ── Circular action button ────────────────────────────────────────────────
  Widget _circleBtn(
      IconData icon, Color color, String tooltip, VoidCallback onTap) =>
      Tooltip(
        message: tooltip,
        child: _CircleActionButton(icon: icon, color: color, onTap: onTap),
      );

  // ── More (⋯) menu ─────────────────────────────────────────────────────────
  Widget _moreBtn(ProjectGridData p) => PopupMenuButton<String>(
    tooltip: 'More',
    offset: const Offset(0, 36),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    elevation: 8,
    icon: Container(
      width: 30, height: 30,
      decoration: BoxDecoration(
        color: const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Icon(Icons.more_horiz_rounded,
          size: 15, color: Color(0xFF64748B)),
    ),
    itemBuilder: (_) => [
      PopupMenuItem(
        value: 'delete',
        child: Row(children: const [
          Icon(Icons.delete_outline_rounded, size: 16, color: Color(0xFFEF4444)),
          SizedBox(width: 8),
          Text('Delete', style: TextStyle(color: Color(0xFFEF4444),
              fontWeight: FontWeight.w600, fontSize: 13)),
        ]),
      ),
    ],
    onSelected: (v) { if (v == 'delete') controller.deleteProject(p.id); },
  );

  Widget _archiveBadge() => Container(
    margin: const EdgeInsets.only(left: 6),
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(
      color: Colors.grey.shade200,
      borderRadius: BorderRadius.circular(30),
    ),
    child: Text('ARCHIVED',
        style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold,
            color: Colors.grey.shade700)),
  );

  Widget _pendingBadge(String projectId) {
    return Obx(() {
      final provider = ArchiveRequestProvider.to;
      final hasPending = provider.requests.any(
        (r) => r.projectId == projectId && r.status == 'pending',
      );
      if (!hasPending) return const SizedBox.shrink();
      return Container(
        margin: const EdgeInsets.only(left: 4),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: const Color(0xFFEF4444),
          borderRadius: BorderRadius.circular(30),
        ),
        child: const Text(
          'EN ATTENTE',
          style: TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w800,
              color: Colors.white,
              letterSpacing: 0.4),
        ),
      );
    });
  }
  String _editUrl(String id) => Uri(
    path: MyRoute.projectFormScreen,
    queryParameters: {'id': id},
  ).toString();

  Future<void> _goToComment(BuildContext context, ProjectGridData p) async {
    await Navigator.push(context,
        MaterialPageRoute(builder: (_) => ProjectCommentScreen(
          projectId: p.id, projectName: p.nomProjet)));
    controller.loadProjects();
  }
}

// ── Hover-aware row wrapper ───────────────────────────────────────────────────
class _HoverRow extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final bool archived;
  final bool hasDevis;
  final bool hasBonCommande;
  final bool isSelected;

  const _HoverRow({
    required this.child,
    required this.onTap,
    required this.archived,
    required this.hasDevis,
    required this.hasBonCommande,
    this.isSelected = false,
  });

  @override
  State<_HoverRow> createState() => _HoverRowState();
}

class _HoverRowState extends State<_HoverRow> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    // Base background colour per row state
    Color base;
    if (widget.isSelected) {
      base = const Color(0xFFEEF2FF); // indigo-50 — selected highlight
    } else if (widget.archived) {
      base = const Color(0xFFF3F4F6);
    } else if (widget.hasBonCommande) {
      base = const Color(0xFFF0FDF4);
    } else if (widget.hasDevis) {
      base = const Color(0xFFFFF7F7);
    } else {
      base = Colors.white;
    }

    // Left accent border for selected row
    final Widget rowContent = AnimatedContainer(
      duration: const Duration(milliseconds: 120),
      decoration: BoxDecoration(
        color: _hovered && !widget.archived && !widget.isSelected
            ? const Color(0xFFF0F4FF)
            : base,
        border: widget.isSelected
            ? const Border(left: BorderSide(color: Color(0xFF6366F1), width: 3))
            : null,
      ),
      child: Column(children: [
        widget.child,
        const Divider(height: 1, color: Color(0xFFF3F4F6)),
      ]),
    );

    return MouseRegion(
      cursor: widget.onTap != null
          ? SystemMouseCursors.click
          : SystemMouseCursors.basic,
      onEnter: (_) => setState(() => _hovered = true),
      onExit:  (_) => setState(() => _hovered = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: rowContent,
      ),
    );
  }
}

class _CircleActionButton extends StatefulWidget {
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  const _CircleActionButton({required this.icon, required this.color, required this.onTap});

  @override
  State<_CircleActionButton> createState() => _CircleActionButtonState();
}

class _CircleActionButtonState extends State<_CircleActionButton> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit:  (_) => setState(() => _hovered = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            color: _hovered
                ? widget.color.withOpacity(0.12)
                : const Color(0xFFF1F5F9),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(widget.icon, size: 14, color: widget.color),
        ),
      ),
    );
  }
}