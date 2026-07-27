import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../services/project_api.dart';
import '../model/project_grid_data.dart';
import 'package:dash_master_toolkit/forms/constants/product_family.dart';

class UserGridController extends GetxController {

  static UserGridController get to => Get.find<UserGridController>();

  final TextEditingController searchController = TextEditingController();
  final FocusNode f1 = FocusNode();

  final RxList<ProjectGridData> projects = <ProjectGridData>[].obs;
  final RxList<ProjectGridData> filtered = <ProjectGridData>[].obs;

  final RxBool loading = false.obs;

  @override
  void onInit() {
    super.onInit();

    /// 🔎 instant search
    searchController.addListener(() {
      searchProject(searchController.text);
    });

    loadProjects();
  }

  /// LOAD PROJECTS
  Future<void> loadProjects({String? userId}) async {

    loading.value = true;

    try {

      final list = await ProjectApi.instance.getProjects(userId: userId);

      print('TABLE COUNT = ${list.length}');

      projects.assignAll(list);
      filtered.assignAll(list);

    } catch (e) {

      debugPrint("loadProjects error: $e");

      projects.clear();
      filtered.clear();

    } finally {

      loading.value = false;

    }
  }

  /// SEARCH PROJECT
  void searchProject(String query) {

    final q = query.trim().toLowerCase();

    if (q.isEmpty) {

      filtered.assignAll(projects);
      return;

    }

    filtered.assignAll(

      projects.where((p) {

        final nom = (p.nomProjet ?? "").toLowerCase();
        final ent = (p.entreprise ?? "").toLowerCase();
        final st = (p.statut ?? "").toLowerCase();
        final adr = (p.adresse ?? "").toLowerCase();
        final engineer = (p.ingenieurResponsable ?? "").toLowerCase();
        final architect = (p.architecte ?? "").toLowerCase();
        final family = productFamilyLabel(p.productFamily).toLowerCase();
        final diameter = p.diameterLabel.toLowerCase();

        return nom.contains(q) ||
            ent.contains(q) ||
            st.contains(q) ||
            adr.contains(q) ||
            engineer.contains(q) ||
            architect.contains(q) ||
            family.contains(q) ||
            diameter.contains(q);

      }).toList(),

    );

  }

  /// INSERT OR UPDATE PROJECT
  void upsertProject(ProjectGridData p) {
    final idx = projects.indexWhere((x) => x.id == p.id);

    if (idx == -1) {
      projects.insert(0, p);
    } else {
      final old = projects[idx];
      // PUT responses often omit owner + permission.
      // fromJson defaults permission to 'viewer' when absent → canEdit=false.
      // Preserve old values so the UI never flickers while refreshProjectById
      // is pending.
      final ownerLost = (p.ownerName.isEmpty || p.ownerName == 'Unknown') &&
          old.ownerName.isNotEmpty && old.ownerName != 'Unknown';
      final permLost  = p.permission == 'viewer' &&
          old.permission.isNotEmpty && old.permission != 'viewer';

      projects[idx] = (ownerLost || permLost)
          ? _mergeFromOld(p, old)
          : p;
    }

    searchProject(searchController.text);
  }

  /// Returns [fresh] with owner + permission restored from [old] when the
  /// backend PUT response omitted those fields.
  ProjectGridData _mergeFromOld(ProjectGridData fresh, ProjectGridData old) {
    return ProjectGridData(
      id:                   fresh.id,
      nomProjet:            fresh.nomProjet,
      entreprise:           fresh.entreprise,
      statut:               fresh.statut,
      adresse:              fresh.adresse,
      dateDemarrage:        fresh.dateDemarrage,
      permission: (fresh.permission == 'viewer' &&
              old.permission.isNotEmpty && old.permission != 'viewer')
          ? old.permission
          : fresh.permission,
      commentCount:         fresh.commentCount,
      taskCount:            fresh.taskCount,
      surfaceProspectee:    fresh.surfaceProspectee,
      pourcentageReussite:  fresh.pourcentageReussite,
      ingenieurResponsable: fresh.ingenieurResponsable,
      architecte:           fresh.architecte,
      validationStatut:     fresh.validationStatut,
      ownerName: (fresh.ownerName.isEmpty || fresh.ownerName == 'Unknown') &&
              old.ownerName.isNotEmpty
          ? old.ownerName
          : fresh.ownerName,
      ownerId: (fresh.ownerId?.isEmpty ?? true) && old.ownerId != null
          ? old.ownerId
          : fresh.ownerId,
      hasDevis:             fresh.hasDevis,
      hasBonCommande:       fresh.hasBonCommande,
      isArchived:           fresh.isArchived,
      projectModele:        fresh.projectModele,
      productFamily:        fresh.productFamily,
      diameterMm:           fresh.diameterMm,
    );
  }

  /// DELETE PROJECT
  Future<void> deleteProject(String id) async {

    loading.value = true;

    try {

      await ProjectApi.instance.deleteProject(id);

      projects.removeWhere((p) => p.id == id);
      filtered.removeWhere((p) => p.id == id);

    } catch (e) {

      debugPrint("deleteProject error: $e");

    } finally {

      loading.value = false;

    }
  }

  /// ADD COMMENT
  Future<void> addComment(String projectId, String comment) async {

    try {

      await ProjectApi.instance.addComment(projectId, comment);

      /// 🔄 refresh project counts
      await refreshProjectById(projectId);

    } catch (e) {

      debugPrint("addComment error: $e");

    }

  }

  /// REFRESH SINGLE PROJECT
  Future<void> refreshProjectById(String id) async {

    try {

      final fresh = await ProjectApi.instance.getProjectById(id);

      upsertProject(fresh);

      forceRefresh();

    } catch (e) {

      debugPrint("refreshProjectById error: $e");

    }

  }

  /// REFRESH UI
  void forceRefresh() {

    projects.refresh();
    filtered.refresh();

    update();

  }
final RxInt currentPage = 1.obs;
final RxInt rowsPerPage = 5.obs;

int get totalPages =>
    (filtered.length / rowsPerPage.value).ceil();

List<ProjectGridData> get paginatedData {
  final start = (currentPage.value - 1) * rowsPerPage.value;
  final end = start + rowsPerPage.value;

  return filtered.sublist(
    start,
    end > filtered.length ? filtered.length : end,
  );
}
  /// AFTER UPDATE PROJECT
  Future<void> afterProjectUpdate(String id) async {

    await refreshProjectById(id);

  }

  @override
  void onClose() {

    searchController.dispose();
    f1.dispose();

    super.onClose();

  }
}