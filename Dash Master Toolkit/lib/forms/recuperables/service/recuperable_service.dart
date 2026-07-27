// lib/forms/recuperables/service/recuperable_service.dart
//
// CRUD API pour /recuperables. "Enregistrer" envoie toujours l'en-tête de
// fiche + le tableau complet des 12 diamètres en un seul appel (jamais de
// champs séparés) — le backend crée ou ouvre automatiquement la fiche
// existante pour ce Module/Machine/Ligne/Poste/Date.

import 'package:dash_master_toolkit/providers/api_client.dart';
import '../model/recuperable_models.dart';

class RecuperableService {
  static final RecuperableService instance = RecuperableService._();
  RecuperableService._();

  static const _basePath = '/recuperables';

  Future<List<RecuperableFicheModel>> fetchAll({String? module, String? machine, String? ligne, String? poste, String? statut}) async {
    final params = <String, String>{
      if (module != null && module.isNotEmpty) 'module': module,
      if (machine != null && machine.isNotEmpty) 'machine': machine,
      if (ligne != null && ligne.isNotEmpty) 'ligne': ligne,
      if (poste != null && poste.isNotEmpty) 'poste': poste,
      if (statut != null && statut.isNotEmpty) 'statut': statut,
    };
    final res = await ApiClient.instance.dio.get(_basePath, queryParameters: params);
    return _parseItems(res.data).map(RecuperableFicheModel.fromJson).toList();
  }

  Future<RecuperableFicheModel> fetchById(String id) async {
    final res = await ApiClient.instance.dio.get('$_basePath/$id');
    return RecuperableFicheModel.fromJson(_unwrapObject(res.data));
  }

  /// "Enregistrer" — crée ou ouvre automatiquement la fiche existante pour
  /// cette combinaison, puis upserte les lignes envoyées.
  Future<RecuperableFicheModel> saveFiche(RecuperableFicheModel model) async {
    final res = await ApiClient.instance.dio.post(_basePath, data: model.toSaveJson());
    return RecuperableFicheModel.fromJson(_unwrapObject(res.data));
  }

  /// "Terminer" — clôture immédiate, indépendante du délai de 6 jours.
  Future<RecuperableFicheModel> terminerFiche(String id) async {
    final res = await ApiClient.instance.dio.put('$_basePath/$id/terminer');
    return RecuperableFicheModel.fromJson(_unwrapObject(res.data));
  }

  Future<void> delete(String id) async {
    await ApiClient.instance.dio.delete('$_basePath/$id');
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
