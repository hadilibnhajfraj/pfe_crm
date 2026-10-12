// lib/forms/industrial/service/machine_service.dart
//
// API /machines (backend modules/machines) — consultation et gestion par
// responsable_logistique_achat et les administrateurs. Pas de suppression :
// une machine se désactive (statut INACTIVE).

import 'package:dio/dio.dart';
import 'package:dash_master_toolkit/providers/api_client.dart';
import '../model/machine_model.dart';

class MachineService {
  static final MachineService instance = MachineService._();
  MachineService._();

  static const _basePath = '/machines';

  Dio get _dio => ApiClient.instance.dio;

  Future<List<MachineModel>> fetchAll({String? typeMachine, String? statut}) async {
    try {
      final res = await _dio.get(_basePath, queryParameters: {
        if (typeMachine != null) 'typeMachine': typeMachine,
        if (statut != null) 'statut': statut,
      });
      final data = res.data is Map ? res.data['data'] : res.data;
      if (data is! List) return [];
      return data
          .map((e) => MachineModel.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
    } on DioException catch (e) {
      throw Exception(_message(e));
    }
  }

  /// code et nom sont facultatifs : déduits côté serveur ("PROBAR-05",
  /// "Machine PROBAR 5").
  Future<MachineModel> create({
    required String typeMachine,
    required int numero,
    String? code,
    String? nom,
    String? description,
  }) async {
    try {
      final res = await _dio.post(_basePath, data: {
        'typeMachine': typeMachine,
        'numero': numero,
        if (code != null && code.trim().isNotEmpty) 'code': code.trim(),
        if (nom != null && nom.trim().isNotEmpty) 'nom': nom.trim(),
        if (description != null) 'description': description,
      });
      return MachineModel.fromJson(Map<String, dynamic>.from(res.data['data'] as Map));
    } on DioException catch (e) {
      throw Exception(_message(e));
    }
  }

  Future<MachineModel> update(String id, Map<String, dynamic> fields) async {
    try {
      final res = await _dio.put('$_basePath/$id', data: fields);
      return MachineModel.fromJson(Map<String, dynamic>.from(res.data['data'] as Map));
    } on DioException catch (e) {
      throw Exception(_message(e));
    }
  }

  Future<MachineModel> setStatut(String id, String statut) async {
    try {
      final res = await _dio.put('$_basePath/$id/statut', data: {'statut': statut});
      return MachineModel.fromJson(Map<String, dynamic>.from(res.data['data'] as Map));
    } on DioException catch (e) {
      throw Exception(_message(e));
    }
  }

  String _message(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['message'] != null) {
      final errors = data['errors'];
      return errors is List && errors.isNotEmpty
          ? '${data['message']} : ${errors.join(', ')}'
          : data['message'].toString();
    }
    final status = e.response?.statusCode;
    return status != null ? 'HTTP $status' : 'Erreur réseau (backend inaccessible)';
  }
}
