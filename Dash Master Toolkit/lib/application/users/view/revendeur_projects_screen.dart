import 'package:flutter/material.dart';
import 'package:dash_master_toolkit/providers/api_client.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'package:dio/dio.dart';
import 'package:go_router/go_router.dart';
import 'package:dash_master_toolkit/route/my_route.dart';
import 'dart:html' as html;
import 'package:excel/excel.dart' as excel;
import 'package:dash_master_toolkit/localization/app_localizations.dart';
class RevendeurProjectsScreen extends StatefulWidget {
  const RevendeurProjectsScreen({super.key});

  @override
  State<RevendeurProjectsScreen> createState() =>
      _RevendeurProjectsScreenState();
}

class _RevendeurProjectsScreenState extends State<RevendeurProjectsScreen> {

  static const Color kPrimary = Color(0xFF1F6FEB);
  static const Color kBg = Color(0xFFF4F7FC);
  static const Color kCard = Colors.white;
  static const Color kBorder = Color(0xFFE5EAF2);

  List<dynamic> items = [];
  bool loading = false;
  String? error;

  late String token;

  int page = 1;
  int totalPages = 1;
  int total = 0;
  final int limit = 10;

  final TextEditingController searchCtrl = TextEditingController();
void _exportExcelFull() {
  final itemsList = items;

  var excelFile = excel.Excel.createExcel();
  excel.Sheet sheet = excelFile['Revendeurs'];

  final headers = [
    'Project Name',
    'Start Date',
    'Model',

    // 🔥 REVENDEUR
    'Comptoir',
    'Phone Comptoir',
    'Phone Comptoir 2',
    'Registre Commerce',
    'Fonction',

    'Nom Revendeur',
    'Prénom Revendeur',
    'Email Revendeur',
    'Statut Revendeur',
    'Adresse Revendeur',

    // AUTRES
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

  int rowIndex = 1;

  for (var p in itemsList) {
    sheet.appendRow([
      p["nomProjet"] ?? "",
      p["dateDemarrage"] ?? "",
      p["projectModele"] ?? "",

      // 🔥 REVENDEUR
      p["comptoir"] ?? "",
      p["telephoneComptoir"] ?? "",
      p["telephoneComptoir2"] ?? "",
      p["registreCommerce"] ?? "",
      p["fonction"] ?? "",

      p["revendeurNom"] ?? "",
      p["revendeurPrenom"] ?? "",
      p["revendeurEmail"] ?? "",
      p["revendeurStatut"] ?? "",
      p["adresseRevendeur"] ?? "",

      // AUTRES
      p["createdAt"] ?? "",
      p["updatedAt"] ?? "",
      p["lastRelanceAt"] ?? "",
    ]);

    rowIndex++;
  }

  /// AUTO WIDTH
  for (int i = 0; i < headers.length; i++) {
    sheet.setColWidth(i, 25);
  }

  final bytes = excelFile.encode();
  if (bytes == null) return;

  final blob = html.Blob(
    [bytes],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );

  final url = html.Url.createObjectUrlFromBlob(blob);

  html.AnchorElement(href: url)
    ..setAttribute('download', 'revendeur_projects.xlsx')
    ..click();

  html.Url.revokeObjectUrl(url);
}
  @override
  void initState() {
    super.initState();

    token = AuthService().accessToken ?? "";

    loadProjects();
  }

  Future<void> loadProjects() async {
    setState(() => loading = true);

    try {
      final res = await ApiClient.instance.dio.get(
        "/projects/my-projects",
        queryParameters: {
          "projectModele": "revendeur",
          "q": searchCtrl.text,
          "page": page,
          "limit": limit,
        },
        options: Options(
          headers: {"Authorization": "Bearer $token"},
        ),
      );

      setState(() {
        items = res.data["items"];
        total = res.data["total"];
        totalPages = res.data["totalPages"];
      });

    } catch (e) {
      error = e.toString();
    }

    setState(() => loading = false);
  }

  String editUrl(String id) {
    return Uri(
      path: MyRoute.projectFormScreen,
      queryParameters: {'id': id},
    ).toString();
  }

  @override
  Widget build(BuildContext context) {

    return Scaffold(
      backgroundColor: kBg,
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [

            /// HEADER
            Text(
              AppLocalizations.of(context).translate("Revendeur Projects"),
              style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800),
            ),

            const SizedBox(height: 20),

            /// STATS
            Row(
              children: [
                _card(context, "Total", total.toString(), Icons.folder),
                _card(context, "Page", page.toString(), Icons.layers),
                _card(context, "Pages", totalPages.toString(), Icons.grid_view),
              ],
            ),

            const SizedBox(height: 24),

            /// FILTER
           Row(
  children: [
    Expanded(
      child: TextField(
        controller: searchCtrl,
        decoration: InputDecoration(
          hintText: AppLocalizations.of(context).translate("Search..."),
          border: const OutlineInputBorder(),
        ),
      ),
    ),
    const SizedBox(width: 10),

    ElevatedButton(
      onPressed: () {
        page = 1;
        loadProjects();
      },
      child: Text(AppLocalizations.of(context).translate("Apply")),
    ),

    const SizedBox(width: 10),

    OutlinedButton(
      onPressed: () {
        searchCtrl.clear();
        page = 1;
        loadProjects();
      },
      child: Text(AppLocalizations.of(context).translate("Reset")),
    ),

    const SizedBox(width: 10),

    /// 🔥 EXPORT BUTTON
    ElevatedButton.icon(
      onPressed: items.isEmpty ? null : _exportExcelFull,
      icon: const Icon(Icons.download),
      label: Text(AppLocalizations.of(context).translate("Export Excel")),
      style: ElevatedButton.styleFrom(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
      ),
    ),
  ],
),

            const SizedBox(height: 24),

            /// TABLE
            Container(
              decoration: BoxDecoration(
                color: kCard,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: kBorder),
              ),
              child: Column(
                children: [

                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        const Icon(Icons.table_chart, color: kPrimary),
                        const SizedBox(width: 10),
                        Text(AppLocalizations.of(context).translate("Revendeur Table"),
                            style: const TextStyle(fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ),

                  const Divider(),

                  if (loading)
                    const Padding(
                      padding: EdgeInsets.all(30),
                      child: CircularProgressIndicator(),
                    )
                  else
                    LayoutBuilder(
                      builder: (context, constraints) {
                        return SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: ConstrainedBox(
                            constraints: BoxConstraints(
                              minWidth: constraints.maxWidth,
                            ),
                            child: DataTable(
                              columnSpacing: 40,
                              horizontalMargin: 20,
                              headingRowColor:
                                  MaterialStateProperty.all(Color(0xFFF8FAFC)),

                              columns: [
                                DataColumn(label: Text(AppLocalizations.of(context).translate("Projet"))),
                                DataColumn(label: Text(AppLocalizations.of(context).translate("Comptoir"))),
                                DataColumn(label: Text(AppLocalizations.of(context).translate("Téléphone"))),
                                DataColumn(label: Text(AppLocalizations.of(context).translate("Statut"))),
                                DataColumn(label: Text(AppLocalizations.of(context).translate("Adresse"))),
                                DataColumn(label: Text(AppLocalizations.of(context).translate("Actions"))),
                              ],

                              rows: items.map<DataRow>((p) {
                                return DataRow(
                                  onSelectChanged: (v) {
                                    if (v == true && p["isArchived"] != true) {
    context.go(editUrl(p["id"]));
  }
                                  },
                                  cells: [

                                    /// NOM + AVATAR
                                   DataCell(
  Row(
    children: [
      CircleAvatar(
        backgroundColor: Colors.blue.shade100,
        child: Text((p["nomProjet"] ?? "P")[0].toUpperCase()),
      ),
      const SizedBox(width: 10),

      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(p["nomProjet"] ?? "-"),

          /// 🔥 ARCHIVED BADGE
          if (p["isArchived"] == true)
            Container(
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.grey.withOpacity(.3),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                AppLocalizations.of(context).translate("ARCHIVED"),
                style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
        ],
      ),
    ],
  ),
),

                                    DataCell(Text(p["comptoir"] ?? "-")),
                                    DataCell(Text(p["telephoneComptoir"] ?? "-")),

                                    /// STATUS
                                    DataCell(
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 10, vertical: 5),
                                        decoration: BoxDecoration(
                                          color: Colors.blue.withOpacity(.1),
                                          borderRadius: BorderRadius.circular(20),
                                        ),
                                        child: Text(
                                          p["revendeurStatut"] ?? "-",
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w600),
                                        ),
                                      ),
                                    ),

                                    /// ADRESSE
                                    DataCell(
                                      SizedBox(
                                        width: 200,
                                        child: Text(
                                          p["adresseRevendeur"] ?? "-",
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                    ),

                                    /// ACTIONS
                                    DataCell(
                                      Row(
                                        children: [
                                          IconButton(
  icon: const Icon(Icons.timeline),
  onPressed: p["isArchived"] == true
      ? null
      : () {
          context.go(
            "/forms/project-timeline?projectId=${p["id"]}",
          );
        },
),
                                         IconButton(
  icon: const Icon(Icons.edit),
  onPressed: p["isArchived"] == true
      ? null
      : () {
          context.go(editUrl(p["id"]));
        },
),
                                        ],
                                      ),
                                    ),
                                  ],
                                );
                              }).toList(),
                            ),
                          ),
                        );
                      },
                    ),

                  const Divider(),

                  /// PAGINATION
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        Text("${AppLocalizations.of(context).translate('Page')} $page / $totalPages"),
                        const Spacer(),

                        OutlinedButton(
                          onPressed: page > 1
                              ? () {
                                  page--;
                                  loadProjects();
                                }
                              : null,
                          child: Text(AppLocalizations.of(context).translate("Previous")),
                        ),

                        const SizedBox(width: 10),

                        ElevatedButton(
                          onPressed: page < totalPages
                              ? () {
                                  page++;
                                  loadProjects();
                                }
                              : null,
                          child: Text(AppLocalizations.of(context).translate("Next")),
                        ),
                      ],
                    ),
                  )
                ],
              ),
            )
          ],
        ),
      ),
    );
  }

  Widget _card(BuildContext context, String title, String value, IconData icon) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.only(right: 10),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: kCard,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            Icon(icon, color: kPrimary),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(AppLocalizations.of(context).translate(title)),
                Text(value,
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.bold)),
              ],
            )
          ],
        ),
      ),
    );
  }
}