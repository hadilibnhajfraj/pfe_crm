// lib/forms/hr/service/hr_request_service.dart
//
// CRUD API pour /hr-requests — calque de IndustrialRecordService (même
// client Dio, même parsing d'enveloppe tolérant).

import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:dash_master_toolkit/providers/api_client.dart';
import '../model/hr_request_model.dart';

class HrJustificatifFile {
  final Uint8List bytes;
  final String filename;
  HrJustificatifFile({required this.bytes, required this.filename});
}

class HrRequestService {
  static final HrRequestService instance = HrRequestService._();
  HrRequestService._();

  static const _basePath = '/hr-requests';

  Future<List<HrRequestModel>> fetchAll({String? type, String? statut}) async {
    final params = <String, String>{
      if (type != null && type.isNotEmpty) 'type': type,
      if (statut != null && statut.isNotEmpty) 'statut': statut,
    };
    final res = await ApiClient.instance.dio.get(_basePath, queryParameters: params);
    return _parseItems(res.data).map(HrRequestModel.fromJson).toList();
  }

  Future<HrRequestModel> fetchById(String id) async {
    final res = await ApiClient.instance.dio.get('$_basePath/$id');
    return HrRequestModel.fromJson(_unwrapObject(res.data));
  }

  Future<HrRequestModel> create(HrRequestModel model, {List<HrJustificatifFile> justificatifs = const []}) async {
    final formData = FormData.fromMap({
      ...model.toCreateJson(),
      'justificatifs': justificatifs.map((f) => MultipartFile.fromBytes(f.bytes, filename: f.filename)).toList(),
    });
    final res = await ApiClient.instance.dio.post(_basePath, data: formData);
    return HrRequestModel.fromJson(_unwrapObject(res.data));
  }

  Future<void> accept(String id, {String? comment}) async {
    await ApiClient.instance.dio.put('$_basePath/$id/accept', data: comment == null ? null : {'comment': comment});
  }

  Future<void> reject(String id, {String? comment}) async {
    await ApiClient.instance.dio.put('$_basePath/$id/reject', data: comment == null ? null : {'comment': comment});
  }

  Future<void> markProcessed(String id) async {
    await ApiClient.instance.dio.put('$_basePath/$id/process');
  }

  Future<void> addComment(String id, String comment) async {
    await ApiClient.instance.dio.put('$_basePath/$id/comment', data: {'comment': comment});
  }

  Future<List<HrRequestActivityModel>> fetchHistory(String id) async {
    final res = await ApiClient.instance.dio.get('$_basePath/$id/history');
    return _parseItems(res.data).map(HrRequestActivityModel.fromJson).toList();
  }

  Future<void> delete(String id) async {
    await ApiClient.instance.dio.delete('$_basePath/$id');
  }

  /// Octets bruts du PDF officiel généré par le backend — utilisés pour
  /// l'aperçu/impression (`Printing.layoutPdf`) et le téléchargement
  /// (`Printing.sharePdf`), jamais affichés pendant la saisie.
  Future<Uint8List> fetchPdfBytes(String id) async {
    final res = await ApiClient.instance.dio.get<List<int>>(
      '$_basePath/$id/pdf',
      options: Options(responseType: ResponseType.bytes),
    );
    return Uint8List.fromList(res.data ?? const []);
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
