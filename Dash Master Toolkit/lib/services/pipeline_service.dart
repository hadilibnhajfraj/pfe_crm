// lib/services/pipeline_service.dart
import 'package:flutter/foundation.dart';
import 'package:dash_master_toolkit/providers/api_client.dart';

class PipelineService {
  static final PipelineService instance = PipelineService._();
  PipelineService._();

  // ── Public API ─────────────────────────────────────────────────────────────
  /// [mine] = true  → current user's projects only (calls /projects/my-projects first)
  /// [mine] = false → all projects
  /// [projectModele] — optional: 'project' | 'revendeur' | 'applicateur'
  Future<List<Map<String, dynamic>>> fetchKanban({
    bool mine = false,
    String? projectModele,
  }) async {
    return mine
        ? fetchMyProjects(projectModele: projectModele)
        : _fetchAll(projectModele: projectModele);
  }

  /// Dedicated "my projects" fetch — always calls /projects/my-projects first.
  /// Never passes 'my-projects' as a dynamic :id segment.
  Future<List<Map<String, dynamic>>> fetchMyProjects({
    String? projectModele,
  }) async {
    final params = <String, String>{'limit': '1000'};
    if (projectModele != null) params['projectModele'] = projectModele;

    debugPrint('[Pipeline] fetchMyProjects → GET /projects/my-projects $params');
    try {
      final res = await ApiClient.instance.dio.get(
        '/projects/my-projects',
        queryParameters: params,
      );
      final items = _parseItems(res.data);
      debugPrint('[Pipeline] fetchMyProjects ← ${items.length} projects');
      if (items.isNotEmpty) return items;
    } catch (e) {
      debugPrint('[Pipeline] /projects/my-projects failed ($e) — trying fallbacks');
    }
    return _fetchMine(projectModele: projectModele);
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  Future<List<Map<String, dynamic>>> fetchProjectActions(
      String projectId) async {
    final res =
        await ApiClient.instance.dio.get('/projects/$projectId/actions');
    final raw = _unwrapList(res.data);
    final actions = _toList(raw)
      ..sort((a, b) {
        final da = DateTime.tryParse(a['dateAction'] ?? '') ?? DateTime(2000);
        final db = DateTime.tryParse(b['dateAction'] ?? '') ?? DateTime(2000);
        return db.compareTo(da);
      });
    return actions
        .where((a) {
          final t = (a['typeAction'] ?? '').toString().toLowerCase();
          return !t.contains('relance') && !t.contains('rappel');
        })
        .toList();
  }

  Future<void> moveProject({
    required String projectId,
    required String newStage,
    String comment = 'Stage updated via pipeline',
  }) async {
    await ApiClient.instance.dio.post(
      '/projects/$projectId/actions',
      data: {'typeAction': newStage, 'commentaire': comment},
    );
  }

  Future<void> restoreProject(String projectId) async {
    await ApiClient.instance.dio.put(
      '/projects/$projectId',
      data: {'isArchived': false},
    );
  }

  Future<void> addNote(String projectId, String content) async {
    await ApiClient.instance.dio.post(
      '/projects/$projectId/actions',
      data: {'typeAction': 'Note', 'commentaire': content},
    );
  }

  // ── Stages ─────────────────────────────────────────────────────────────────
  Future<List<Map<String, dynamic>>> fetchStages() async {
    try {
      final res = await ApiClient.instance.dio.get('/pipeline/stages');
      return _toList(res.data ?? []);
    } catch (_) {
      return [];
    }
  }

  Future<void> addStage({
    required String name,
    required String color,
    int order = 0,
  }) async {
    await ApiClient.instance.dio.post('/pipeline/stages',
        data: {'name': name, 'color': color, 'order': order});
  }

  Future<void> updateStage(String id,
      {String? name, String? color, int? order}) async {
    await ApiClient.instance.dio.put('/pipeline/stages/$id', data: {
      if (name != null) 'name': name,
      if (color != null) 'color': color,
      if (order != null) 'order': order,
    });
  }

  Future<void> deleteStage(String id) async {
    await ApiClient.instance.dio.delete('/pipeline/stages/$id');
  }

  // ── Private fetch helpers ──────────────────────────────────────────────────

  Future<List<Map<String, dynamic>>> _fetchAll({String? projectModele}) async {
    for (final path in ['/projects', '/pipeline/kanban', '/projects/all']) {
      try {
        final params = <String, String>{'limit': '1000'};
        if (projectModele != null) params['projectModele'] = projectModele;
        final res = await ApiClient.instance.dio
            .get(path, queryParameters: params);
        final items = _parseItems(res.data);
        if (items.isNotEmpty) return items;
      } catch (_) {
        continue;
      }
    }
    return [];
  }

  Future<List<Map<String, dynamic>>> _fetchMine({String? projectModele}) async {
    final endpoints = [
      ('/pipeline/projects',  {'myProjects': 'true'}),
      ('/projects',           {'myProjects': 'true', 'limit': '1000'}),
      ('/pipeline/kanban',    {'myProjects': 'true', 'mine': 'true'}),
      ('/projects/myprojects',{'limit': '1000'}),
    ];
    for (final (path, base) in endpoints) {
      try {
        final params = Map<String, String>.from(base);
        if (projectModele != null) params['projectModele'] = projectModele;
        debugPrint('[Pipeline] _fetchMine → GET $path $params');
        final res = await ApiClient.instance.dio
            .get(path, queryParameters: params);
        final items = _parseItems(res.data);
        debugPrint('[Pipeline] _fetchMine ← ${items.length} projects');
        if (items.isNotEmpty) return items;
      } catch (e) {
        debugPrint('[Pipeline] _fetchMine $path failed: $e');
        continue;
      }
    }
    return [];
  }

  // ── Parse helpers ──────────────────────────────────────────────────────────

  static const _kListKeys = [
    'items', 'data', 'projects', 'results', 'cards', 'docs',
  ];
  static const _kStageProjectKeys = ['projects', 'cards', 'items', 'docs'];
  static const _kStageLabelKeys   = ['stage', 'name', 'id', 'stageId', 'stageName'];

  List<Map<String, dynamic>> _parseItems(dynamic data) {
    final raw = _toList(_unwrapList(data));
    if (raw.isEmpty) return raw;

    final first = raw.first;
    final hasStageLabel = _kStageLabelKeys.any(first.containsKey);
    final projectKey = _kStageProjectKeys
        .firstWhere((k) => first[k] is List, orElse: () => '');

    if (hasStageLabel && projectKey.isNotEmpty) {
      return _flattenStageGroups(raw, projectKey);
    }
    return raw;
  }

  List<Map<String, dynamic>> _flattenStageGroups(
      List<Map<String, dynamic>> stages, String projectKey) {
    final result = <Map<String, dynamic>>[];
    for (final stage in stages) {
      final stageId = _firstStr(stage, _kStageLabelKeys);
      final list = stage[projectKey];
      if (list is! List) continue;
      for (final raw in list) {
        if (raw is! Map) continue;
        final p = Map<String, dynamic>.from(raw);
        p.putIfAbsent('computedStage', () => stageId);
        result.add(p);
      }
    }
    return result;
  }

  static String _firstStr(Map<String, dynamic> m, List<String> keys) {
    for (final k in keys) {
      final v = m[k];
      if (v != null) {
        final s = v.toString().trim();
        if (s.isNotEmpty) return s;
      }
    }
    return '';
  }

  List _unwrapList(dynamic data) {
    if (data is List) return data;
    if (data is Map) {
      for (final key in _kListKeys) {
        final val = data[key];
        if (val is List) return val;
        if (val is Map) {
          for (final k2 in _kListKeys) {
            final v2 = val[k2];
            if (v2 is List) return v2;
          }
        }
      }
    }
    return [];
  }

  List<Map<String, dynamic>> _toList(List raw) => raw
      .whereType<Map>()
      .map((e) => Map<String, dynamic>.from(e))
      .toList();
}
