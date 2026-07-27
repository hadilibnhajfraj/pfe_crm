import 'dart:convert';
import 'dart:html' as html;
import 'package:flutter/material.dart';
import 'package:dash_master_toolkit/core/config/api_config.dart';
import 'package:dash_master_toolkit/application/users/model/user_project_model.dart';
import 'package:dash_master_toolkit/services/user_project_service.dart';
import 'package:http/http.dart' as http;
import 'package:jwt_decoder/jwt_decoder.dart';
import 'package:go_router/go_router.dart';
import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/application/users/model/user_projects_response.dart';
import 'package:csv/csv.dart';
import 'package:excel/excel.dart' as excel;
import 'package:dash_master_toolkit/localization/app_localizations.dart';
class UserProjectsScreen extends StatefulWidget {
  final String token;

  const UserProjectsScreen({
    super.key,
    required this.token,
  });

  @override
  State<UserProjectsScreen> createState() => _UserProjectsScreenState();
}

class _UserProjectsScreenState extends State<UserProjectsScreen> {
  static const Color kPrimary = Color(0xFF1F6FEB);
  static const Color kBg = Color(0xFFF4F7FC);
  static const Color kCard = Colors.white;
  static const Color kBorder = Color(0xFFE5EAF2);
  static const Color kTextDark = Color(0xFF111827);
  static const Color kTextMuted = Color(0xFF6B7280);
  static const Color kSuccessBg = Color(0xFFDCFCE7);
  static const Color kSuccessText = Color(0xFF166534);
  static const Color kWarningBg = Color(0xFFFEF3C7);
  static const Color kWarningText = Color(0xFFB45309);
  static const Color kNeutralBg = Color(0xFFF3F4F6);
  static const Color kNeutralText = Color(0xFF6B7280);

  final UserProjectService service = UserProjectService(
    baseUrl: ApiConfig.baseUrl,
  );

  final TextEditingController _searchCtrl = TextEditingController();
  final TextEditingController _architectCtrl = TextEditingController();
  final TextEditingController _promoteurCtrl = TextEditingController();
  final TextEditingController _ingenieurCtrl = TextEditingController();
  final TextEditingController _societeCtrl = TextEditingController();
  final TextEditingController _createdByCtrl = TextEditingController();
 String? userRole;
 String? selectedStatusFilter;
String? selectedUser;
String? selectedProjectModele;
List<Map<String, dynamic>> users = [];
  bool _loading = false;
  String? _error;
  UserProjectsResponse? _response;

  int _page = 1;
  final int _limit = 10;
  final List<Map<String, String>> STATUS_LIST = [
  {"label": "Identification", "value": "Identification"},
  {"label": "Technical Proposal", "value": "Proposition technique"},
  {"label": "Commercial Proposal", "value": "Proposition commerciale"},
  {"label": "Negotiation", "value": "Négociation"},
  {"label": "Delivery", "value": "Livraison"},
  {"label": "Loyalty", "value": "Fidélisation"},
];

Color getStatusColor(String status) {
  switch (status) {
    case "Identification":
      return Colors.blue;
    case "Proposition technique":
      return Colors.orange;
    case "Proposition commerciale":
      return Colors.purple;
    case "Négociation":
      return Colors.red;
    case "Livraison":
      return Colors.green;
    case "Fidélisation":
      return Colors.teal;
    default:
      return Colors.grey;
  }
}

  @override
void initState() {
  super.initState();

  Map<String, dynamic> decoded = JwtDecoder.decode(widget.token);

  userRole = decoded["role"];

  print("ROLE CONNECTED: $userRole"); // 🔥 DEBUG

  _loadUsers();
  _loadProjects();
}
String _editUrl(String id) {
    return Uri(
      path: MyRoute.projectFormScreen,
      queryParameters: {'id': id},
    ).toString();
  }
Future<void> _loadUsers() async {
  try {
    final response = await http.get(
      Uri.parse('${service.baseUrl}/users'),
      headers: {
        'Authorization': 'Bearer ${widget.token}',
      },
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);

      setState(() {
        final allUsers = List<Map<String, dynamic>>.from(data);

users = allUsers.where((u) {
  final role = (u['role'] ?? '').toString().toLowerCase();
  return role == "user"; // 🔥 ou "agent" selon ton système
}).toList();
      });
    }
  } catch (e) {
    print("Error loading users: $e");
  }
}
  Future<void> _loadProjects() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final result = await service.fetchMyProjects(
        token: widget.token,
        architecte: _architectCtrl.text,
        promoteur: _promoteurCtrl.text,
        createdBy: selectedUser,
        ingenieur: _ingenieurCtrl.text,
        societe: _societeCtrl.text,
        q: _searchCtrl.text,
         projectModele: selectedProjectModele,
         statut: selectedStatusFilter, // 🔥 AJOUT
        page: _page,
        limit: _limit,
      );

      setState(() {
        _response = result;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
      });
    } finally {
      setState(() {
        _loading = false;
      });
    }
  }

  void _resetFilters() {
  _searchCtrl.clear();
  _architectCtrl.clear();
  _promoteurCtrl.clear();
  _ingenieurCtrl.clear();
  _societeCtrl.clear();
  selectedProjectModele = null; // ✅ IMPORTANT
selectedStatusFilter=null;

  selectedUser = null; // 🔥 IMPORTANT

  _page = 1;
  _loadProjects();
}
String safe(dynamic v) {
  if (v == null || v.toString().trim().isEmpty || v.toString() == "null") {
    return "-";
  }
  return v.toString();
}
void _exportCsv() {
  final items = _response?.items ?? [];

  /// CREATE FILE
  var excelFile = excel.Excel.createExcel();
  excel.Sheet sheet = excelFile['Projects'];

  /// HEADER
  sheet.appendRow([
    'Project Name',
    'Start Date',
    'Engineer',
    'Architect',
    'Promoter',
    'Company',
    'Status',
    'Validation',
    'Project Type',
    'Address'
  ]);

  /// STYLE HEADER
  for (int i = 0; i < 10; i++) {
    var cell = sheet.cell(
      excel.CellIndex.indexByColumnRow(columnIndex: i, rowIndex: 0),
    );

    cell.cellStyle = excel.CellStyle(
      bold: true,
      backgroundColorHex: "#D9E1F2",
    );
  }

  /// DATA
  for (int i = 0; i < items.length; i++) {
    final p = items[i];

    sheet.appendRow([
      p.nomProjet ?? '',
      p.dateDemarrage ?? '',
      p.ingenieurResponsable ?? '',
      p.architecte ?? '',
      p.promoteur ?? '',
      p.entreprise ?? '',
      p.statut ?? '',
      p.validationStatut ?? '',
      p.typeProjet ?? '',
      p.adresse ?? '',
    ]);

    int rowIndex = i + 1;

    /// 🎨 STATUS COLOR
    var statusCell = sheet.cell(
      excel.CellIndex.indexByColumnRow(columnIndex: 6, rowIndex: rowIndex),
    );

    statusCell.cellStyle = excel.CellStyle(
      backgroundColorHex: _getStatusColorHex(p.statut),
    );

    /// 🎨 VALIDATION COLOR
    var validationCell = sheet.cell(
      excel.CellIndex.indexByColumnRow(columnIndex: 7, rowIndex: rowIndex),
    );

    validationCell.cellStyle = excel.CellStyle(
      backgroundColorHex: _getValidationColorHex(p.validationStatut),
    );
  }

  /// SAVE FILE
  final bytes = excelFile.encode();

  if (bytes == null) {
    print("❌ Excel generation failed");
    return;
  }

  final blob = html.Blob(
    [bytes],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );

  final url = html.Url.createObjectUrlFromBlob(blob);

  html.AnchorElement(href: url)
    ..setAttribute('download', 'projects.xlsx')
    ..click();

  html.Url.revokeObjectUrl(url);
}
void _exportExcel() {
  final items = _response?.items ?? [];

  var excelFile = excel.Excel.createExcel();
  excel.Sheet sheet = excelFile['Projects'];

  final headers = [
    'Project Name',
    'Start Date',
    'Engineer',
    'Phone Engineer',
    'Architect',
    'Promoter',
    'Company',
    'Bureau Controle',
    'Status',
    'Validation',
    'Project Type',
    'Model',
    'Surface',
    'Latitude',
    'Longitude',
    'Address'
  ];

  sheet.appendRow(headers);

  /// HEADER STYLE
  for (int i = 0; i < headers.length; i++) {
    var cell = sheet.cell(
      excel.CellIndex.indexByColumnRow(columnIndex: i, rowIndex: 0),
    );

    cell.cellStyle = excel.CellStyle(
      bold: true,
      backgroundColorHex: "#1F2937",
      fontColorHex: "#FFFFFF",
    );
  }

  /// DATA
  for (int i = 0; i < items.length; i++) {
    final p = items[i];

    sheet.appendRow([
      p.nomProjet ?? '',
      p.dateDemarrage ?? '',
      p.ingenieurResponsable ?? '',
      p.telephoneIngenieur ?? '',
      p.architecte ?? '',
      p.promoteur ?? '',
      p.entreprise ?? '',
      p.bureauControle ?? '',
      p.statut ?? '',
      p.validationStatut ?? '',
      p.typeProjet ?? '',
      p.projectModele ?? '',
      p.surfaceProspectee ?? '',
      p.latitude ?? '',
      p.longitude ?? '',
      p.adresse ?? '',
    ]);

    int rowIndex = i + 1;

    /// STATUS COLOR
    var statusCell = sheet.cell(
      excel.CellIndex.indexByColumnRow(columnIndex: 8, rowIndex: rowIndex),
    );

    statusCell.cellStyle = excel.CellStyle(
      backgroundColorHex: _getStatusColorHex(p.statut),
      bold: true,
    );

    /// VALIDATION COLOR
    var validationCell = sheet.cell(
      excel.CellIndex.indexByColumnRow(columnIndex: 9, rowIndex: rowIndex),
    );

    validationCell.cellStyle = excel.CellStyle(
      backgroundColorHex: _getValidationColorHex(p.validationStatut),
      bold: true,
    );
  }

  /// AUTO WIDTH
  for (int i = 0; i < headers.length; i++) {
    sheet.setColWidth(i, 25);
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
    ..setAttribute('download', 'projects_pro.xlsx')
    ..click();

  html.Url.revokeObjectUrl(url);
}
void _exportExcelFull() {
  final items = _response?.items ?? [];

  var excelFile = excel.Excel.createExcel();
  excel.Sheet sheet = excelFile['Projects'];

final headers = [
  'Project Name',
  'Start Date',
  'Created By',
  'Model',

  'Engineer',
  'Phone Engineer',
  'Email Engineer',

  'Architect',
  'Phone Architect',
  'Email Architect',

  'Promoter',
  'Company',
  'Bureau Etude',
  'Bureau Controle',

  'Adresse',
  'Latitude',
  'Longitude',

  'Status',
  'Validation',

  'Type Projet',

  'Surface',
  'Fluide',
  'Electricité',

  'Réussite %',

  'Created At',
  'Updated At',
  'Last Relance',
];

  sheet.appendRow(headers);

  /// HEADER STYLE
  for (int i = 0; i < headers.length; i++) {
    sheet
        .cell(excel.CellIndex.indexByColumnRow(columnIndex: i, rowIndex: 0))
        .cellStyle = excel.CellStyle(
      bold: true,
      backgroundColorHex: "#111827",
      fontColorHex: "#FFFFFF",
    );
  }

  /// =========================
  /// 🔥 GROUP BY USER
  /// =========================
  Map<String, List<dynamic>> grouped = {};

  for (var p in items) {
    final user = p.createdByName ?? "Unknown";
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
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
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
      /// ✅ CONVERSION NUMBERS (IMPORTANT)
      double? surface =
          double.tryParse(p.surfaceProspectee ?? "");

      double? success =
          double.tryParse(p.pourcentageReussite ?? "");

   sheet.appendRow([
  safe(p.nomProjet),
  safe(p.dateDemarrage),
  safe(p.createdByName),
  safe(p.projectModele),

  safe(p.ingenieurResponsable),
  safe(p.telephoneIngenieur),
  safe(p.emailIngenieur),

  safe(p.architecte),
  safe(p.telephoneArchitecte),
  safe(p.emailArchitecte),

  safe(p.promoteur),
  safe(p.entreprise),
  safe(p.bureauEtude),
  safe(p.bureauControle),

  safe(p.adresse),
  safe(p.latitude),
  safe(p.longitude),

  safe(p.statut),
  safe(p.validationStatut),

  safe(p.typeProjet),

  surface ?? "",
  safe(p.entrepriseFluide),
  safe(p.entrepriseElectricite),

  success ?? "",

  safe(p.createdAt),
  safe(p.updatedAt),
  safe(p.lastRelanceAt),
]);

      /// 🎨 STATUS
      sheet
          .cell(excel.CellIndex.indexByColumnRow(columnIndex: 18, rowIndex: rowIndex))
          .cellStyle = excel.CellStyle(
        backgroundColorHex: _getStatusColorHex(p.statut),
        bold: true,
      );

      /// 🎨 VALIDATION
      sheet
          .cell(excel.CellIndex.indexByColumnRow(columnIndex: 19, rowIndex: rowIndex))
          .cellStyle = excel.CellStyle(
        backgroundColorHex: _getValidationColorHex(p.validationStatut),
        bold: true,
      );

      /// 🎨 MODEL
      sheet
          .cell(excel.CellIndex.indexByColumnRow(columnIndex: 3, rowIndex: rowIndex))
          .cellStyle = excel.CellStyle(
        backgroundColorHex: _getModelColorHex(p.projectModele),
        bold: true,
      );

      /// 🎨 SUCCESS COLOR
      String color;
      if (success != null && success >= 80) {
        color = "#22C55E";
      } else if (success != null && success >= 50) {
        color = "#F59E0B";
      } else {
        color = "#EF4444";
      }

      sheet
          .cell(excel.CellIndex.indexByColumnRow(columnIndex: 24, rowIndex: rowIndex))
          .cellStyle = excel.CellStyle(
        backgroundColorHex: color,
        fontColorHex: "#FFFFFF",
        bold: true,
      );

      rowIndex++;
    }

    /// ESPACE
    sheet.appendRow([""]);
    rowIndex++;
  });

  /// LARGEUR
  for (int i = 0; i < headers.length; i++) {
    sheet.setColWidth(i, 28);
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
    ..setAttribute('download', 'projects_grouped_FULL.xlsx')
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
    case "Identification":
      return "#DBEAFE";
    case "Préparation":
      return "#E0F2FE";
    case "Proposition technique":
      return "#FEF3C7";
    case "Proposition commerciale":
      return "#E9D5FF";
    case "Négociation":
      return "#FECACA";
    case "Livraison":
      return "#DCFCE7";
    default:
      return "#F3F4F6";
  }
}

String _getValidationColorHex(String? value) {
  if (value == "Validé") return "#22C55E"; // vert fort
  if (value == "Non validé") return "#F59E0B"; // orange
  return "#E5E7EB";
}
  String _escapeCsv(String value) {
    return value.replaceAll('"', '""');
  }

  Color _validationBg(String? value) {
    final v = (value ?? '').toLowerCase().trim();
    if (v == 'validé' || v == 'valid') return kSuccessBg;
    if (v == 'non validé' || v == 'not valid') return kWarningBg;
    return kNeutralBg;
  }

  Color _validationText(String? value) {
    final v = (value ?? '').toLowerCase().trim();
    if (v == 'validé' || v == 'valid') return kSuccessText;
    if (v == 'non validé' || v == 'not valid') return kWarningText;
    return kNeutralText;
  }

  Color _statusBg(String? value) {
    final v = (value ?? '').toLowerCase().trim();
    if (v == 'terminé' || v == 'completed') return kSuccessBg;
    if (v == 'préparation' || v == 'preparation') return const Color(0xFFEEF2FF);
    if (v == 'en cours' || v == 'in progress') return const Color(0xFFDBEAFE);
    return kNeutralBg;
  }

  Color _statusText(String? value) {
    final v = (value ?? '').toLowerCase().trim();
    if (v == 'terminé' || v == 'completed') return kSuccessText;
    if (v == 'préparation' || v == 'preparation') return const Color(0xFF4338CA);
    if (v == 'en cours' || v == 'in progress') return const Color(0xFF1D4ED8);
    return kNeutralText;
  }

  Widget _filterField({
    required TextEditingController controller,
    required String hint,
    double width = 220,
  }) {
    return SizedBox(
      width: width,
      child: TextField(
        controller: controller,
        decoration: InputDecoration(
          hintText: AppLocalizations.of(context).translate(hint),
          filled: true,
          fillColor: Colors.white,
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: kBorder),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: kBorder),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: kPrimary, width: 1.4),
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _architectCtrl.dispose();
    _promoteurCtrl.dispose();
    _ingenieurCtrl.dispose();
    _societeCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
  List<UserProjectModel> items = _response?.items ?? [];

// 🔥 FILTRE PROJECT UNIQUEMENT
items = items.where((p) => p.projectModele == "project").toList();
// ✅ FILTER ARCHIVED
//if (userRole != "admin" && userRole != "superadmin") {
  //items = items.where((p) => p.isArchived != true).toList();
//}

    final total = _response?.total ?? 0;
    final totalPages = _response?.totalPages ?? 1;

    return Scaffold(
      backgroundColor: kBg,
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              AppLocalizations.of(context).translate('My Projects'),
              style: const TextStyle(
                fontSize: 30,
                fontWeight: FontWeight.w800,
                color: kTextDark,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              AppLocalizations.of(context)
                  .translate('View your associated projects and filter them professionally by architect, promoter, engineer, and company.'),
              style: const TextStyle(
                fontSize: 15,
                color: kTextMuted,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 24),

            Wrap(
              spacing: 16,
              runSpacing: 16,
              children: [
                _SummaryCard(
                  title: 'Total Projects',
                  value: total.toString(),
                  icon: Icons.folder_copy_rounded,
                  color: kPrimary,
                ),
                _SummaryCard(
                  title: 'Current Page',
                  value: _page.toString(),
                  icon: Icons.layers_rounded,
                  color: const Color(0xFF0EA5E9),
                ),
                _SummaryCard(
                  title: 'Total Pages',
                  value: totalPages.toString(),
                  icon: Icons.auto_awesome_mosaic_rounded,
                  color: const Color(0xFF10B981),
                ),
              ],
            ),

            const SizedBox(height: 24),

            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: kCard,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: kBorder),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x12000000),
                    blurRadius: 18,
                    offset: Offset(0, 8),
                  ),
                ],
              ),
              child: Column(
                children: [
                  Wrap(
                    spacing: 14,
                    runSpacing: 14,
                    children: [
                      _filterField(
                        controller: _searchCtrl,
                        hint: 'Search project...',
                        width: 280,
                      ),
                      _filterField(
                        controller: _architectCtrl,
                        hint: 'Architect',
                      ),
                      _filterField(
                        controller: _promoteurCtrl,
                        hint: 'Promoter',
                      ),
                      _filterField(
                        controller: _ingenieurCtrl,
                        hint: 'Engineer',
                      ),
                      _filterField(
                        controller: _societeCtrl,
                        hint: 'Company',
                      ),

DropdownButtonFormField<String>(
  value: selectedStatusFilter ?? "ALL", // ✅ IMPORTANT
  hint: Text(AppLocalizations.of(context).translate("Status")),
  items: [
    DropdownMenuItem(
      value: "ALL",
      child: Text(AppLocalizations.of(context).translate("All")),
    ),
    ...STATUS_LIST.map((s) => DropdownMenuItem<String>(
          value: s["value"],
          child: Text(AppLocalizations.of(context).translate(s["label"]!)),
        ))
  ],
  onChanged: (value) {
    setState(() {
      selectedStatusFilter = value == "ALL" ? null : value;
      _page = 1;
    });
  },
),
                      if (userRole == "superadmin" || userRole == "superadmin2")
  SizedBox(
    width: 300,
    child: DropdownButtonFormField<String>(
      value: selectedUser,
      isExpanded: true,
      itemHeight: null,
      hint: Text(AppLocalizations.of(context).translate("Created By")),
      decoration: InputDecoration(
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        constraints: const BoxConstraints(minHeight: 72),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: kBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: kBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: kPrimary, width: 1.4),
        ),
      ),
      selectedItemBuilder: (context) => users.map<Widget>((u) {
        final name = (u['name'] ?? u['firstName'] ?? '').toString().trim();
        final email = (u['email'] ?? '').toString();
        final initial = email.isNotEmpty ? email[0].toUpperCase() : '?';
        final isSelected = u['id'].toString() == selectedUser;
        final count = isSelected ? (_response?.total ?? 0) : null;
        return Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: const Color(0xFFDBEAFE),
              child: Text(
                initial,
                style: const TextStyle(
                  color: Color(0xFF1D4ED8),
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (name.isNotEmpty)
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                        color: kTextDark,
                      ),
                    ),
                  Text(
                    email,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      color: kTextMuted,
                    ),
                  ),
                ],
              ),
            ),
            if (count != null)
              Container(
                margin: const EdgeInsets.only(left: 6),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFDBEAFE),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '$count ${AppLocalizations.of(context).translate('projets')}',
                  style: const TextStyle(
                    fontSize: 11,
                    color: Color(0xFF1D4ED8),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
          ],
        );
      }).toList(),
      items: users.map<DropdownMenuItem<String>>((u) {
        final name = (u['name'] ?? u['firstName'] ?? '').toString().trim();
        final email = (u['email'] ?? '').toString();
        final initial = email.isNotEmpty ? email[0].toUpperCase() : '?';
        return DropdownMenuItem<String>(
          value: u['id'].toString(),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor: const Color(0xFFDBEAFE),
                  child: Text(
                    initial,
                    style: const TextStyle(
                      color: Color(0xFF1D4ED8),
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (name.isNotEmpty)
                        Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                            color: kTextDark,
                          ),
                        ),
                      Text(
                        email,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 11,
                          color: kTextMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
      onChanged: (value) {
        setState(() {
          selectedUser = value;
          _page = 1;
        });
        _loadProjects();
      },
    ),
  ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      ElevatedButton.icon(
                        onPressed: () {
                          _page = 1;
                          _loadProjects();
                        },
                        icon: const Icon(Icons.search_rounded),
                        label: Text(AppLocalizations.of(context).translate('Apply Filters')),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: kPrimary,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      OutlinedButton.icon(
                        onPressed: _resetFilters,
                        icon: const Icon(Icons.refresh_rounded),
                        label: Text(AppLocalizations.of(context).translate('Reset')),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: kTextDark,
                          side: const BorderSide(color: kBorder),
                          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                      const Spacer(),
                      ElevatedButton.icon(
                        onPressed: items.isEmpty ? null : _exportExcelFull,
                        icon: const Icon(Icons.download_rounded),
                        label: Text(AppLocalizations.of(context).translate('Export CSV')),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF111827),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            if (_loading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(30),
                  child: CircularProgressIndicator(),
                ),
              ),

            if (_error != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: const Color(0xFFFECACA)),
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(
                    color: Colors.red,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),

            if (!_loading && _error == null)
              Container(
                decoration: BoxDecoration(
                  color: kCard,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: kBorder),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x12000000),
                      blurRadius: 20,
                      offset: Offset(0, 8),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 20, 20, 14),
                      child: Row(
                        children: [
                          const Icon(Icons.table_chart_rounded, color: kPrimary),
                          const SizedBox(width: 10),
                          Text(
                            AppLocalizations.of(context).translate('Projects Table'),
                            style: const TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                              color: kTextDark,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Divider(height: 1, thickness: 1, color: kBorder),

                    if (items.isEmpty)
                      Padding(
                        padding: const EdgeInsets.all(30),
                        child: Text(
                          AppLocalizations.of(context).translate('No projects found for the selected filters.'),
                          style: const TextStyle(
                            fontSize: 15,
                            color: kTextMuted,
                          ),
                        ),
                      )
                    else
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: DataTable(
                          headingRowHeight: 58,
                          dataRowMinHeight: 64,
                          dataRowMaxHeight: 72,
                          columnSpacing: 28,
                          horizontalMargin: 20,
                          dividerThickness: 0.8,
                          headingRowColor: WidgetStateProperty.resolveWith<Color?>(
                            (states) => const Color(0xFFF8FAFC),
                          ),
                          columns: [
                            DataColumn(
                              label: Text(
                                AppLocalizations.of(context).translate('Project Name'),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: kTextDark,
                                ),
                              ),
                            ),
                            DataColumn(
                              label: Text(
                                AppLocalizations.of(context).translate('Engineer'),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: kTextDark,
                                ),
                              ),
                            ),
                            DataColumn(
                              label: Text(
                                AppLocalizations.of(context).translate('Architect'),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: kTextDark,
                                ),
                              ),
                            ),
                            DataColumn(
                              label: Text(
                                AppLocalizations.of(context).translate('Promoter'),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: kTextDark,
                                ),
                              ),
                            ),
                            DataColumn(
                              label: Text(
                                AppLocalizations.of(context).translate('Company'),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: kTextDark,
                                ),
                              ),
                            ),
                            DataColumn(
                              label: Text(
                                AppLocalizations.of(context).translate('Start Date'),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: kTextDark,
                                ),
                              ),
                            ),
                            DataColumn(
                              label: Text(
                                AppLocalizations.of(context).translate('Status'),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: kTextDark,
                                ),
                              ),
                            ),

                            DataColumn(
                              label: Text(
                                AppLocalizations.of(context).translate('Validation'),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: kTextDark,
                                ),
                              ),
                            ),
                            DataColumn(
                              label: Text(
                                AppLocalizations.of(context).translate('Project Type'),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: kTextDark,
                                ),
                              ),
                            ),
                              DataColumn(
                              label: Text(
                                AppLocalizations.of(context).translate('Actions'),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: kTextDark,
                                ),
                              ),
                            ),
                          ],
                          rows: items.map((p) {
                            return DataRow(
                              onSelectChanged: (selected) {
    if (selected == true) {
      context.go(_editUrl(p.id));
    }
  },
                              cells: [
                                DataCell(
                                  SizedBox(
                                    width: 180,
                                    child: Row(
                                      children: [
                                        CircleAvatar(
                                          radius: 18,
                                          backgroundColor: const Color(0xFFDBEAFE),
                                          child: Text(
                                            p.nomProjet.isNotEmpty
                                                ? p.nomProjet[0].toUpperCase()
                                                : 'P',
                                            style: const TextStyle(
                                              color: Color(0xFF1D4ED8),
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                        ),
                                        const SizedBox(width: 10),
                                        Expanded(
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        p.nomProjet,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          fontWeight: FontWeight.w600,
          color: kTextDark,
        ),
      ),

      // 🔥 BADGE ARCHIVED
      if (p.isArchived == true) ...[
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: Colors.grey.withOpacity(0.3),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            AppLocalizations.of(context).translate("ARCHIVED"),
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: Colors.black54,
            ),
          ),
        ),
      ],
    ],
  ),
),
                                      ],
                                    ),
                                  ),
                                ),
                               DataCell(
  Builder(
    builder: (_) {

      if (p.projectModele == "revendeur") {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(p.comptoir ?? "-", style: const TextStyle(fontWeight: FontWeight.w600)),
          ],
        );
      }

      if (p.projectModele == "applicateur") {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(p.dallagiste ?? "-", style: const TextStyle(fontWeight: FontWeight.w600)),
           
          ],
        );
      }

      // DEFAULT = PROJECT
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(p.ingenieurResponsable ?? "-", style: const TextStyle(fontWeight: FontWeight.w600)),
         
        ],
      );
    },
  ),
),
                                DataCell(Text(p.architecte ?? '-')),
                                DataCell(Text(p.promoteur ?? '-')),
                                DataCell(Text(p.entreprise)),
                                DataCell(Text(p.dateDemarrage)),
  DataCell(
  Builder(
    builder: (_) {

      /// ✅ SAFE VALUE (évite crash dropdown)
      final safeValue = STATUS_LIST.any((s) => s["value"] == p.statut)
          ? p.statut
          : "Identification";

      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: getStatusColor(safeValue!).withOpacity(.15),
          borderRadius: BorderRadius.circular(20),
        ),
        child: DropdownButton<String>(
          value: safeValue,
          isExpanded: true,
          underline: const SizedBox(),

          style: const TextStyle(
            color: Colors.black,
            fontWeight: FontWeight.w600,
          ),

          items: STATUS_LIST.map((status) {
            return DropdownMenuItem<String>(
              value: status["value"],
              child: Text(AppLocalizations.of(context).translate(status["label"]!)),
            );
          }).toList(),

          onChanged: p.isArchived == true
    ? null
    : (value) async {
            if (value == null) return;

            try {
              await http.put(
                Uri.parse("${service.baseUrl}/projects/${p.id}"),
                headers: {
                  "Authorization": "Bearer ${widget.token}",
                  "Content-Type": "application/json",
                },
                body: jsonEncode({
                  "statut": value,
                }),
              );

              _loadProjects();

            } catch (e) {
              print("❌ STATUS UPDATE ERROR: $e");
            }
          },
        ),
      );
    },
  ),
),
                                
                                DataCell(
                                  _TagChip(
                                    text: p.validationStatut ?? 'Unknown',
                                    bg: _validationBg(p.validationStatut),
                                    fg: _validationText(p.validationStatut),
                                  ),
                                ),
                                DataCell(
                                  _TagChip(
                                    text: p.typeProjet ?? 'No type',
                                    bg: const Color(0xFFF3F4F6),
                                    fg: const Color(0xFF374151),
                                  ),
                                ),
                                DataCell(
  Row(
    children: [

      /// 🔵 TIMELINE
      IconButton(
        icon: const Icon(Icons.timeline, color: Colors.indigo),
        onPressed: () {
          context.go(
            "/forms/project-timeline?projectId=${p.id}",
          );
        },
      ),

      /// 🟢 EDIT
      IconButton(
        icon: const Icon(Icons.edit, color: Colors.blue),
        onPressed: p.isArchived == true
    ? null
    : () => context.go(_editUrl(p.id)),
      ),

    ],
  ),
),
                              ],
                            );
                          }).toList(),
                        ),
                      ),

                    const Divider(height: 1, thickness: 1, color: kBorder),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                      child: Row(
                        children: [
                          Text(
                            '${AppLocalizations.of(context).translate('Page')} $_page / $totalPages',
                            style: const TextStyle(
                              color: kTextMuted,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const Spacer(),
                          OutlinedButton(
                            onPressed: _page > 1
                                ? () {
                                    setState(() {
                                      _page--;
                                    });
                                    _loadProjects();
                                  }
                                : null,
                            child: Text(AppLocalizations.of(context).translate('Previous')),
                          ),
                          const SizedBox(width: 10),
                          ElevatedButton(
                            onPressed: _page < totalPages
                                ? () {
                                    setState(() {
                                      _page++;
                                    });
                                    _loadProjects();
                                  }
                                : null,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: kPrimary,
                              foregroundColor: Colors.white,
                            ),
                            child: Text(AppLocalizations.of(context).translate('Next')),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;

  const _SummaryCard({
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 250,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE5EAF2)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x12000000),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: color.withOpacity(.12),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: color, size: 26),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  AppLocalizations.of(context).translate(title),
                  style: const TextStyle(
                    fontSize: 13,
                    color: Color(0xFF6B7280),
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 26,
                    color: Color(0xFF111827),
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TagChip extends StatelessWidget {
  final String text;
  final Color bg;
  final Color fg;

  const _TagChip({
    required this.text,
    required this.bg,
    required this.fg,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(30),
      ),
      child: Text(
        AppLocalizations.of(context).translate(text),
        style: TextStyle(
          color: fg,
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }
}