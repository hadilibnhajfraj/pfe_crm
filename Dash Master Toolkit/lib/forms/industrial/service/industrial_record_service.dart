// lib/forms/industrial/service/industrial_record_service.dart
//
// CRUD API pour /industrial-records — calque de PorPromeshService (même
// client Dio, même parsing d'enveloppe tolérant).
//
// Cache mémoire par session : fetchAll() ne rappelle jamais le réseau pour
// une combinaison module/machine/poste déjà chargée (invalidée uniquement
// par create/update/delete ou par `forceRefresh: true`, ex. pull-to-refresh).

import 'package:dash_master_toolkit/providers/api_client.dart';
import '../model/industrial_record_model.dart';

class IndustrialRecordService {
  static final IndustrialRecordService instance = IndustrialRecordService._();
  IndustrialRecordService._();

  static const _basePath = '/industrial-records';

  final Map<String, List<IndustrialRecordModel>> _listCache = {};

  String _cacheKey({String? module, String? machine, String? poste}) =>
      '${module ?? ''}|${machine ?? ''}|${poste ?? ''}';

  Future<List<IndustrialRecordModel>> fetchAll({
    String? module,
    String? machine,
    String? poste,
    bool forceRefresh = false,
  }) async {
    final key = _cacheKey(module: module, machine: machine, poste: poste);
    final cached = _listCache[key];
    if (!forceRefresh && cached != null) {
      return cached;
    }

    final params = <String, String>{
      if (module != null && module.isNotEmpty) 'module': module,
      if (machine != null && machine.isNotEmpty) 'machine': machine,
      if (poste != null && poste.isNotEmpty) 'poste': poste,
      // Borne haute généreuse — voir industrialRecord.service.js#listRecords
      // (pagination serveur, défaut 500 côté backend).
      'pageSize': '500',
    };
    final res = await ApiClient.instance.dio.get(_basePath, queryParameters: params);
    final items = _parseItems(res.data).map(IndustrialRecordModel.fromJson).toList();

    _listCache[key] = items;
    return items;
  }

  Future<IndustrialRecordModel> fetchById(String id) async {
    final res = await ApiClient.instance.dio.get('$_basePath/$id');
    return IndustrialRecordModel.fromJson(_unwrapObject(res.data));
  }

  Future<IndustrialRecordModel> create(IndustrialRecordModel model) async {
    final res = await ApiClient.instance.dio.post(_basePath, data: model.toJson());
    final saved = IndustrialRecordModel.fromJson(_unwrapObject(res.data));
    _invalidateModule(model.module);
    return saved;
  }

  Future<IndustrialRecordModel> update(String id, IndustrialRecordModel model) async {
    final res = await ApiClient.instance.dio.put('$_basePath/$id', data: model.toJson());
    final saved = IndustrialRecordModel.fromJson(_unwrapObject(res.data));
    _invalidateModule(model.module);
    return saved;
  }

  Future<void> delete(String id) async {
    await ApiClient.instance.dio.delete('$_basePath/$id');
    _listCache.clear();
  }

  void _invalidateModule(String module) {
    _listCache.removeWhere((k, _) => k.startsWith('$module|'));
  }

  List<Map<String, dynamic>> _parseItems(dynamic data) {
    final raw = _unwrapList(data);
    return raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  List _unwrapList(dynamic data) {
    if (data is List) return data;
    if (data is Map) {
      for (final key in ['items', 'data', 'results', 'docs']) {
        final val = data[key];
        if (val is List) return val;
      }
    }
    return [];
  }

  Map<String, dynamic> _unwrapObject(dynamic data) {
    if (data is Map && data['data'] is Map) {
      return Map<String, dynamic>.from(data['data'] as Map);
    }
    if (data is Map) return Map<String, dynamic>.from(data);
    return {};
  }
}
