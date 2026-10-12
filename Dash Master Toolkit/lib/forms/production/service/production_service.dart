// lib/forms/production/service/production_service.dart
//
// API du module Production (lecture seule) — /production/dashboard renvoie
// en UNE requête tous les KPI, machines, séries de graphiques et dernières
// productions. Même client Dio que PorPromeshService. L'export (Excel / PDF)
// est généré côté backend puis téléchargé avec le même mécanisme dart:html
// que por_promesh_excel_service.dart.

import 'dart:html' as html;
import 'dart:typed_data';

import 'package:dio/dio.dart';

import 'package:dash_master_toolkit/providers/api_client.dart';
import '../model/production_models.dart';

class ProductionListFilters {
  final int? machine;
  final String? poste;
  final String? user;
  final String? status;
  final String? search;

  const ProductionListFilters({this.machine, this.poste, this.user, this.status, this.search});

  Map<String, String> toQuery() => {
        if (machine != null) 'machine': machine.toString(),
        if (poste != null && poste!.isNotEmpty) 'poste': poste!,
        if (user != null && user!.isNotEmpty) 'user': user!,
        if (status != null && status!.isNotEmpty) 'status': status!,
        if (search != null && search!.isNotEmpty) 'search': search!,
      };
}

class ProductionService {
  static final ProductionService instance = ProductionService._();
  ProductionService._();

  static const _basePath = '/production';

  /// [refresh] contourne le cache court du backend (bouton « Actualiser »).
  Future<ProductionDashboardData> fetchDashboard(ProductionPeriod period, {bool refresh = false}) async {
    final res = await _get('$_basePath/dashboard', {...period.toQuery(), if (refresh) 'refresh': '1'});
    return ProductionDashboardData.fromJson(_unwrap(res.data));
  }

  Future<ProductionListResult> fetchList({
    required String line,
    required ProductionPeriod period,
    ProductionListFilters filters = const ProductionListFilters(),
    int page = 1,
    int pageSize = 25,
  }) async {
    final res = await _get('$_basePath/fiches', {
      'line': line,
      ...period.toQuery(),
      ...filters.toQuery(),
      'page': page.toString(),
      'pageSize': pageSize.toString(),
    });
    return ProductionListResult.fromJson(res.data is Map ? Map<String, dynamic>.from(res.data as Map) : {});
  }

  Future<ProductionFicheDetail> fetchFiche(String line, String id) async {
    final res = await _get('$_basePath/fiches/$line/$id', const {});
    return ProductionFicheDetail.fromJson(_unwrap(res.data));
  }

  /// Télécharge l'export généré par le backend. [line] null = PROMESH + PROBAR.
  Future<void> export({
    required String format, // xlsx | pdf
    required ProductionPeriod period,
    String? line,
    ProductionListFilters filters = const ProductionListFilters(),
  }) async {
    try {
      final res = await ApiClient.instance.dio.get<List<int>>(
        '$_basePath/export',
        queryParameters: {
          'format': format,
          if (line != null) 'line': line,
          ...period.toQuery(),
          if (line != null) ...filters.toQuery(),
        },
        options: Options(responseType: ResponseType.bytes, receiveTimeout: const Duration(seconds: 60)),
      );
      final now = DateTime.now();
      final stamp =
          '${now.year}${now.month.toString().padLeft(2, '0')}${now.day.toString().padLeft(2, '0')}';
      _download(
        Uint8List.fromList(res.data ?? const []),
        '${line ?? 'production'}_${period.key}_$stamp.$format',
        format == 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    } on DioException catch (e) {
      throw Exception(_message(e, bytes: true));
    }
  }

  void _download(Uint8List bytes, String filename, String mime) {
    final blob = html.Blob([bytes], mime);
    final url = html.Url.createObjectUrlFromBlob(blob);
    html.AnchorElement(href: url)
      ..setAttribute('download', filename)
      ..click();
    html.Url.revokeObjectUrl(url);
  }

  Future<Response<dynamic>> _get(String path, Map<String, String> query) async {
    try {
      return await ApiClient.instance.dio.get(path, queryParameters: query);
    } on DioException catch (e) {
      throw Exception(_message(e));
    }
  }

  // Message lisible renvoyé par le backend ({ message }) plutôt que le texte
  // technique de Dio.
  String _message(DioException e, {bool bytes = false}) {
    final data = e.response?.data;
    if (!bytes && data is Map && data['message'] != null) return data['message'].toString();
    final code = e.response?.statusCode;
    if (code == 403) return 'Accès refusé au module Production.';
    if (code != null) return 'Erreur serveur ($code).';
    return 'Serveur injoignable. Vérifiez votre connexion.';
  }

  Map<String, dynamic> _unwrap(dynamic data) {
    if (data is Map && data['data'] is Map) return Map<String, dynamic>.from(data['data'] as Map);
    if (data is Map) return Map<String, dynamic>.from(data);
    return {};
  }
}
