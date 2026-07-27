// lib/forms/providers/pipeline_provider.dart
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:get_storage/get_storage.dart';
import 'package:dash_master_toolkit/services/pipeline_service.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/model/project_pipeline_model.dart';

class PipelineProvider extends GetxController {
  static PipelineProvider get to => Get.find<PipelineProvider>();

  final _service = PipelineService.instance;
  // ignore: unused_field
  final _box = GetStorage();

  // ── Observables ────────────────────────────────────────────────────────────
  /// Full-screen shimmer — only true during the very first load.
  final RxBool loading = true.obs;

  /// Subtle top progress bar during subsequent reloads — board stays visible.
  final RxBool refreshing = false.obs;

  /// Auto-selected on first open: show only the current user's projects.
  final RxBool myOnly = true.obs;

  /// Debounced search term (actual filtered value — not the raw keystroke).
  final RxString search = ''.obs;

  final RxnString filterStage = RxnString();

  /// Active project-model tab: null = All | 'project' | 'revendeur' | 'applicateur'
  final RxnString filterModele = RxnString();

  /// Non-null when a load attempt failed and the board is still empty.
  final RxnString errorMessage = RxnString();

  final RxList<PipelineStage> stages =
      <PipelineStage>[...kDefaultPipelineStages].obs;

  final RxMap<String, List<Map<String, dynamic>>> grouped =
      <String, List<Map<String, dynamic>>>{}.obs;

  // KPI counters
  final RxInt total    = 0.obs;
  final RxInt won      = 0.obs;
  final RxInt lost     = 0.obs;
  final RxInt active   = 0.obs;
  final RxInt archived = 0.obs;

  // ── Internal ───────────────────────────────────────────────────────────────
  // Full shimmer is shown only once — on the very first load after creation.
  bool _isFirstLoad = true;
  Timer? _searchDebounce;

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  @override
  void onInit() {
    super.onInit();
    _initGrouped();
    // Default to 'project' type — never mix Projects, Revendeurs, Applicateurs.
    filterModele.value = 'project';
    load();
  }

  @override
  void onClose() {
    _searchDebounce?.cancel();
    super.onClose();
  }

  void _initGrouped() {
    grouped.value = {for (final s in stages) s.id: <Map<String, dynamic>>[]};
  }

  // ── Filtered view ──────────────────────────────────────────────────────────
  /// Search + stage + modele are client-side (instant).
  /// myOnly and filterModele also trigger a server re-fetch via load().
  Map<String, List<Map<String, dynamic>>> get filtered {
    final q   = search.value.toLowerCase().trim();
    final sf  = filterStage.value;
    final fm  = filterModele.value;

    if (q.isEmpty && sf == null && fm == null) return Map.from(grouped);

    final result = <String, List<Map<String, dynamic>>>{};
    for (final s in stages) {
      if (sf != null && sf != s.id) {
        result[s.id] = [];
        continue;
      }
      result[s.id] = (grouped[s.id] ?? []).where((p) {
        // Archive column bypasses model filter — show all archived regardless of type.
        if (s.id != 'archive-stage') {
          if (fm != null) {
            final modele = (p['projectModele'] ?? '').toString().toLowerCase();
            if (modele != fm.toLowerCase()) return false;
          }
        }
        // Search filter
        if (q.isNotEmpty) {
          final nom = (p['nomProjet']  ?? '').toString().toLowerCase();
          final cie = (p['entreprise'] ?? '').toString().toLowerCase();
          if (!nom.contains(q) && !cie.contains(q)) return false;
        }
        return true;
      }).toList();
    }
    return result;
  }

  // ── Load ───────────────────────────────────────────────────────────────────
  /// [silent] = true skips the refreshing indicator (used internally after
  /// optimistic drag-drop updates where the board is already in sync).
  Future<void> load({bool silent = false}) async {
    errorMessage.value = null;

    if (_isFirstLoad && !silent) {
      // Very first open → show full skeleton shimmer.
      loading.value   = true;
      refreshing.value = false;
    } else if (!silent) {
      // Explicit refresh button tap → show subtle progress bar.
      refreshing.value = true;
    } else {
      // Filter / toggle changes → subtle bar.
      refreshing.value = true;
    }

    try {
      final projects = await _service.fetchKanban(
        mine: myOnly.value,
        projectModele: filterModele.value,
      );

      final stageIds = stages.map((s) => s.id).toList();
      final map = <String, List<Map<String, dynamic>>>{
        for (final id in stageIds) id: [],
      };

      // All action fetches fire concurrently via Future.wait.
      final enriched = await Future.wait(
        projects.map((raw) => _enrichProject(Map<String, dynamic>.from(raw))),
      );

      final nonArchiveIds = stageIds.where((id) => id != 'archive-stage').toList();

      for (final project in enriched) {
        // Archived projects always land in the archive column, regardless of statut.
        final isArch = project['isArchived'] == true ||
            project['isArchived']?.toString() == 'true';
        final stageId = isArch && stageIds.contains('archive-stage')
            ? 'archive-stage'
            : _resolveStageId(project, nonArchiveIds);
        project['computedStage'] = stageId;
        (map[stageId] ?? map[stageIds.first])!.add(project);
      }

      grouped.value = map;
      _recalcKpi();
    } catch (e) {
      debugPrint('PipelineProvider.load error: $e');
      // Only surface the error message when the board is still empty.
      if (grouped.values.every((l) => l.isEmpty)) {
        errorMessage.value = 'Failed to load pipeline. Tap refresh to retry.';
      }
    } finally {
      loading.value    = false;
      refreshing.value = false;
      _isFirstLoad     = false;
    }
  }

  // ── Stage resolver ─────────────────────────────────────────────────────────
  /// Priority (highest → lowest):
  ///   1. computedStage already stamped (e.g. from a grouped kanban response)
  ///   2. currentAction / action / pipelineStage flat fields
  ///   3. lastAction.typeAction (most recent action enriched later)
  ///   4. statut
  ///   5. first stage
  String _resolveStageId(Map<String, dynamic> project, List<String> validIds) {
    String _try(String? raw) {
      if (raw == null || raw.isEmpty) return '';
      if (validIds.contains(raw)) return raw;
      final n = normalizeStage(raw);
      return validIds.contains(n) ? n : '';
    }

    // 1. Already stamped (e.g. from kanban grouped response)
    final stamped = _try(project['computedStage']?.toString());
    if (stamped.isNotEmpty) return stamped;

    // 2. Flat CRM action fields
    for (final key in ['currentAction', 'action', 'pipelineStage', 'currentStage']) {
      final v = _try(project[key]?.toString());
      if (v.isNotEmpty) return v;
    }

    // 3. Last action type
    final lastType =
        (project['lastAction'] as Map?)?['typeAction']?.toString() ?? '';
    final fromAction = _try(lastType);
    if (fromAction.isNotEmpty) return fromAction;

    // 4. Statut fallback
    final fromStatut = _try((project['statut'] ?? '').toString().trim());
    if (fromStatut.isNotEmpty) return fromStatut;

    return validIds.isNotEmpty ? validIds.first : kDefaultPipelineStages.first.id;
  }

  // ── Enrich project with its actions ───────────────────────────────────────
  Future<Map<String, dynamic>> _enrichProject(
      Map<String, dynamic> project) async {
    // ── Normalize field names immediately ─────────────────────────────────────
    // ProjectPipelineModel resolves nomProjet + owner from any API variant
    // and writes canonical keys back into [project] so the card can read
    // p['nomProjet'] and p['ownerName'] unconditionally.
    ProjectPipelineModel.fromJson(project).normalizeIntoMap(project);

    // MongoDB may return _id instead of id — check both.
    final id = (project['id'] ?? project['_id'] ?? '').toString();
    if (id.isEmpty) {
      project['lastAction'] = null;
      project['allActions'] = <Map<String, dynamic>>[];
      return project;
    }
    try {
      final actions = await _service.fetchProjectActions(id);
      project['lastAction'] = actions.isNotEmpty ? actions.first : null;
      project['allActions'] = actions;
    } catch (_) {
      project['lastAction'] = null;
      project['allActions'] = <Map<String, dynamic>>[];
    }
    return project;
  }

  // ── Restore archived project ───────────────────────────────────────────────
  Future<void> restoreProject(Map<String, dynamic> project) async {
    final pid = (project['id'] ?? project['_id'] ?? '').toString();
    if (pid.isEmpty) return;
    final archiveList = grouped['archive-stage'];
    archiveList?.removeWhere((p) => (p['id'] ?? p['_id']).toString() == pid);
    _recalcKpi();
    grouped.refresh();
    try {
      await _service.restoreProject(pid);
    } catch (e) {
      debugPrint('[Pipeline] restoreProject failed: $e');
    }
    await load(silent: true);
  }

  // ── Move project between stages (optimistic) ───────────────────────────────
  Future<bool> moveProject(
      Map<String, dynamic> project, String newStageId) async {
    final oldStageId =
        (project['computedStage'] as String?) ?? stages.first.id;
    if (oldStageId == newStageId) return false;

    // Optimistic update — board reacts instantly.
    grouped[oldStageId]?.removeWhere((p) => p['id'] == project['id']);
    project['computedStage'] = newStageId;
    (grouped[newStageId] ??= []).add(project);
    _recalcKpi();
    grouped.refresh();

    try {
      await _service.moveProject(
          projectId: project['id'].toString(), newStage: newStageId);
      return true;
    } catch (_) {
      // Rollback on failure.
      grouped[newStageId]?.removeWhere((p) => p['id'] == project['id']);
      project['computedStage'] = oldStageId;
      (grouped[oldStageId] ??= []).add(project);
      _recalcKpi();
      grouped.refresh();
      return false;
    }
  }

  // ── Stage CRUD ─────────────────────────────────────────────────────────────
  Future<void> addStage({
    required String id,
    required String label,
    required Color color,
  }) async {
    final stage = PipelineStage(
      id: id,
      label: label,
      color: color,
      icon: Icons.folder_special_rounded,
      order: stages.length,
      isSystem: false,
    );
    stages.add(stage);
    grouped[stage.id] = [];
    try {
      await _service.addStage(
        name: id,
        color: '#${color.value.toRadixString(16).substring(2).toUpperCase()}',
        order: stage.order,
      );
    } catch (_) {
      stages.removeLast();
      grouped.remove(stage.id);
    }
  }

  Future<void> renameStage(String stageId, String newLabel) async {
    final idx = stages.indexWhere((s) => s.id == stageId);
    if (idx < 0) return;
    stages[idx] = stages[idx].copyWith(label: newLabel);
    stages.refresh();
    try {
      await _service.updateStage(stageId, name: newLabel);
    } catch (_) {}
  }

  Future<void> recolorStage(String stageId, Color color) async {
    final idx = stages.indexWhere((s) => s.id == stageId);
    if (idx < 0) return;
    stages[idx] = stages[idx].copyWith(color: color);
    stages.refresh();
    grouped.refresh();
    try {
      await _service.updateStage(stageId,
          color:
              '#${color.value.toRadixString(16).substring(2).toUpperCase()}');
    } catch (_) {}
  }

  Future<void> removeStage(String stageId) async {
    final stage = stages.firstWhereOrNull((s) => s.id == stageId);
    if (stage == null || stage.isSystem) return;

    final displaced =
        List<Map<String, dynamic>>.from(grouped[stageId] ?? []);
    stages.removeWhere((s) => s.id == stageId);
    grouped.remove(stageId);

    if (stages.isNotEmpty && displaced.isNotEmpty) {
      final firstId = stages.first.id;
      for (final p in displaced) {
        p['computedStage'] = firstId;
      }
      (grouped[firstId] ??= []).addAll(displaced);
    }
    _recalcKpi();
    grouped.refresh();
    try {
      await _service.deleteStage(stageId);
    } catch (_) {}
  }

  // ── Filter helpers ─────────────────────────────────────────────────────────
  /// Toggle "My Projects": re-fetches from server.
  void toggleMyOnly() {
    myOnly.toggle();
    debugPrint('[Pipeline] MY PROJECTS = ${myOnly.value}');
    load(silent: true);
  }

  /// Debounced search — 350 ms after the last keystroke.
  /// Clearing immediately resets the board (no delay on empty).
  void setSearch(String q) {
    _searchDebounce?.cancel();
    if (q.isEmpty) {
      search.value = '';
      return;
    }
    _searchDebounce = Timer(const Duration(milliseconds: 350), () {
      search.value = q;
    });
  }

  void setFilterStage(String? s) => filterStage.value = s;

  /// Switch project-model tab and reload from server.
  void setFilterModele(String? modele) {
    filterModele.value = modele;
    debugPrint('[Pipeline] filterModele = $modele');
    load(silent: true);
  }

  /// Resets search/stage filters but keeps modele='project' (never show all mixed).
  void clearFilters() {
    _searchDebounce?.cancel();
    search.value       = '';
    filterStage.value  = null;
    filterModele.value = 'project';
    myOnly.value       = false;
    debugPrint('[Pipeline] clearFilters → myOnly=false, filterModele=project, reload');
    load(silent: true);
  }

  bool get hasActiveFilters =>
      search.value.isNotEmpty ||
      filterStage.value != null ||
      myOnly.value;

  // ── KPI ────────────────────────────────────────────────────────────────────
  void _recalcKpi() {
    final all = grouped.values.expand((l) => l).toList();
    archived.value = (grouped['archive-stage'] ?? []).length;
    total.value    = all.length - archived.value;
    won.value      = (grouped['Commande gagnée'] ?? []).length;
    lost.value     = (grouped['Commande perdue'] ?? []).length;
    active.value   = total.value - won.value - lost.value;
  }

  double get convRate =>
      total.value > 0 ? won.value / total.value * 100 : 0.0;
}
