import 'dart:convert';
import 'package:dash_master_toolkit/core/config/api_config.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'dart:io' show Platform;
import 'package:get/get.dart';
import 'package:http/http.dart' as http;
import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'package:dash_master_toolkit/dashboard/sales/sales_imports.dart';

class SalesDashboardController extends GetxController {
  // ================== UI DEMO DATA (charts) ==================
  final visitors = <VisitorData>[].obs;
  final topProductData = <ProductData>[].obs;

  // ================== BASE URL ==================
  String get baseUrl => ApiConfig.baseUrl;

  // ================== STATE ==================
  //final isLoadingKpi = false.obs;
  //final kpiError = "".obs;
var totalProjects = 0.obs;
var totalContacts = 0.obs;
var totalGlobal = 0.obs;

var projectsByStatus = <Map<String, dynamic>>[].obs;
var contactsByStatus = <Map<String, dynamic>>[].obs;
var validatedProjects = 0.obs;
var nonValidatedProjects = 0.obs;
var validatedPercentage = 0.0.obs;

final isLoadingKpi = false.obs;
final kpiError = "".obs;
  final projectValidationKpi = <String, dynamic>{}.obs;

  final projectSurfaceKpi = <Map<String, dynamic>>[].obs;
  final projectLocationKpi = <Map<String, dynamic>>[].obs;
  final projectValidationStatus = <Map<String, dynamic>>[].obs;
  final topUsers = <Map<String, dynamic>>[].obs;
  final latestProjects = <Map<String, dynamic>>[].obs;

  final projectStatusData = <Map<String, dynamic>>[].obs;
  final projectStatusAndDateData = <Map<String, dynamic>>[].obs;

  // ================== PAGINATION ==================
  final surfacePage = 1.obs;
  final surfacePerPage = 4.obs;
  
  int get surfaceTotalPages {
    final total = projectSurfaceKpi.length;
    final per = surfacePerPage.value <= 0 ? 4 : surfacePerPage.value;
    return (total / per).ceil().clamp(1, total);
  }

  List<Map<String, dynamic>> get surfacePagedRows {
    final all = projectSurfaceKpi;
    final per = surfacePerPage.value <= 0 ? 4 : surfacePerPage.value;
    final page = surfacePage.value <= 0 ? 1 : surfacePage.value;
    final start = (page - 1) * per;
    final end = (start + per).clamp(0, all.length);
    return all.sublist(start, end);
  }

  void nextSurfacePage() {
    if (surfacePage.value < surfaceTotalPages) surfacePage.value++;
  }

  void prevSurfacePage() {
    if (surfacePage.value > 1) surfacePage.value--;
  }

  void resetSurfacePagination() => surfacePage.value = 1;
void parseKpi(Map<String, dynamic> data) {
  totalProjects.value = data["totals"]["projects"] ?? 0;

  final List statuses = data["breakdown"]["projectsByStatus"] ?? [];

  int validated = 0;
  int nonValidated = 0;

  for (var s in statuses) {
    final status = (s["validationStatut"] ?? "").toString().toLowerCase();
    final count = int.tryParse(s["count"].toString()) ?? 0;

    if (status.contains("valid")) {
      validated += count;
    } else {
      nonValidated += count;
    }
  }

  validatedProjects.value = validated;
  nonValidatedProjects.value = nonValidated;

  validatedPercentage.value =
      totalProjects.value == 0 ? 0 : (validated / totalProjects.value) * 100;
}
List<Map<String, dynamic>> get combinedStatusData {
  final Map<String, Map<String, dynamic>> map = {};

  // 🔵 PROJECTS
  for (var p in projectsByStatus) {
    final status = p["validationStatut"];
    final count = int.tryParse(p["count"].toString()) ?? 0;

    map[status] = {
      "status": status,
      "projects": count,
      "contacts": 0,
    };
  }

  // 🟠 CONTACTS
  for (var c in contactsByStatus) {
    final status = c["statut"];
    final count = int.tryParse(c["count"].toString()) ?? 0;

    if (map.containsKey(status)) {
      map[status]!["contacts"] = count;
    } else {
      map[status] = {
        "status": status,
        "projects": 0,
        "contacts": count,
      };
    }
  }

  return map.values.toList();
}
void parseOverviewKpi(Map<String, dynamic> data) {
  // 🔥 TOTALS
  totalProjects.value = data["totals"]["projects"] ?? 0;
  totalContacts.value = data["totals"]["commercialContacts"] ?? 0;
  totalGlobal.value = data["totals"]["global"] ?? 0;

  // 🔥 BREAKDOWN
  projectsByStatus.assignAll(
    List<Map<String, dynamic>>.from(data["breakdown"]["projectsByStatus"] ?? []),
  );

  contactsByStatus.assignAll(
    List<Map<String, dynamic>>.from(data["breakdown"]["contactsByStatus"] ?? []),
  );
}
  // ================== INIT ==================
  @override
  void onInit() {
    super.onInit();
    fetchProjectKpis();
    //fetchProjectsByStatus();
  }

  // ================== HELPERS ==================
  double _toDouble(dynamic v, {double fallback = 0}) {
    if (v == null) return fallback;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString()) ?? fallback;
  }

  int _toInt(dynamic v, {int fallback = 0}) {
    if (v == null) return fallback;
    if (v is num) return v.toInt();
    return int.tryParse(v.toString()) ?? fallback;
  }

  List<Map<String, dynamic>> _asListOfMap(dynamic raw) {
    if (raw == null) return <Map<String, dynamic>>[];
    if (raw is List) {
      return raw
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    }
    return <Map<String, dynamic>>[];
  }

  Future<Map<String, String>> _headers() async {
    final token = await AuthService().accessToken;
    return {
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  // ================== KPI FETCH ==================
 Future<void> fetchProjectKpis() async {
  try {
    isLoadingKpi.value = true;
    kpiError.value = "";

    final headers = await _headers();

    // 🔥 3 APIs
    final dashboardRes = await http.get(
      Uri.parse("$baseUrl/projects/kpi/dashboard"),
      headers: headers,
    );

    final surfaceRes = await http.get(
      Uri.parse("$baseUrl/projects/kpi/validation-by-surface"),
      headers: headers,
    );

    final overviewRes = await http.get(
      Uri.parse("$baseUrl/projects/kpis/overview"),
      headers: headers,
    );

    // =============================
    // ❌ CHECK ERRORS
    // =============================
    if (dashboardRes.statusCode != 200) {
      throw Exception("Dashboard error: ${dashboardRes.statusCode}");
    }

    if (surfaceRes.statusCode != 200) {
      throw Exception("Surface error: ${surfaceRes.statusCode}");
    }

    if (overviewRes.statusCode != 200) {
      throw Exception("Overview error: ${overviewRes.statusCode}");
    }

    // =============================
    // ✅ PARSE DATA
    // =============================
    final dashData = json.decode(dashboardRes.body);
    final surfData = json.decode(surfaceRes.body);
    final overviewData = json.decode(overviewRes.body);

    // 🔥 1. KPI TOTALS + STATUS
    parseKpi(overviewData);
parseOverviewKpi(overviewData); // 🔥 IMPORTANT

    projectStatusData.assignAll(
      _asListOfMap(overviewData["breakdown"]["projectsByStatus"]),
    );

    // 🔥 2. MAP (IMPORTANT → ne pas casser)
    projectLocationKpi.assignAll(
      _asListOfMap(dashData["mapProjects"]),
    );

    // 🔥 3. AUTRES DONNÉES
    topUsers.assignAll(_asListOfMap(dashData["topUsers"]));
    latestProjects.assignAll(_asListOfMap(dashData["latestProjects"]));

    // 🔥 4. TABLE SURFACE
    projectSurfaceKpi.assignAll(_asListOfMap(surfData));
    resetSurfacePagination();

  } catch (e) {
    kpiError.value = e.toString();
  } finally {
    isLoadingKpi.value = false;
    update(["sales_dashboard"]);
  }
}

  // ================== PROJECTS BY STATUS ==================
  Future<void> fetchProjectsByStatus() async {
    try {
      isLoadingKpi.value = true;
      final headers = await _headers();
      final res = await http.get(
        Uri.parse("$baseUrl/projects/kpi/projects-by-status"),
        headers: headers,
      );

      if (res.statusCode != 200) {
        throw Exception("Projects by status error: ${res.statusCode}");
      }

      final data = json.decode(res.body);
      projectStatusData.assignAll(_asListOfMap(data));
    } catch (e) {
      kpiError.value = e.toString();
    } finally {
      isLoadingKpi.value = false;
      update(["sales_dashboard"]);
    }
  }

  // ================== ADMIN / USER FILTER ==================
  List<Map<String, dynamic>> filterProjectsForUser(String userId) {
    // Si admin, retourne tout
    if (AuthService().isAdmin) return projectSurfaceKpi;

    // Sinon, filtre uniquement les projets assignés à l’utilisateur
    return projectSurfaceKpi.where((p) => p["ownerId"] == userId).toList();
  }

  // ================== UI GETTERS ==================
  //int get totalProjects => _toInt(projectValidationKpi["totalProjects"]);
  //int get validatedProjects => _toInt(projectValidationKpi["validatedProjects"]);
  //double get validatedPercentage => _toDouble(projectValidationKpi["validatedPercentage"]);
  //int get nonValidatedProjects => totalProjects - validatedProjects;

  String pctText(dynamic v) => "${_toDouble(v).toStringAsFixed(2)}%";

  String surfaceLabel(Map<String, dynamic> item) => (item["surfaceProspectee"] ?? "—").toString();
  int surfaceTotal(Map<String, dynamic> item) => _toInt(item["totalProjects"]);
  int surfaceValidated(Map<String, dynamic> item) => _toInt(item["validatedProjects"]);
  double surfaceAvgReussite(Map<String, dynamic> item) =>
      _toDouble(item["avgReussite"] ?? item["validatedPercentage"], fallback: 0);

  double mapLat(Map<String, dynamic> item) => _toDouble(item["latitude"]);
  double mapLng(Map<String, dynamic> item) => _toDouble(item["longitude"]);
  String mapTitle(Map<String, dynamic> item) => (item["nomProjet"] ?? "Projet").toString();
}