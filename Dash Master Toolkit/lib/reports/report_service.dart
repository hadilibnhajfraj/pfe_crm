import 'package:dio/dio.dart';

import 'package:dash_master_toolkit/providers/api_client.dart';

import 'report_saver_stub.dart' if (dart.library.html) 'report_saver_web.dart';

/// Un rapport que le serveur autorise pour le profil connecté (GET /reports).
class ReportItem {
  final String type;
  final String title;
  final List<String> formats;
  final List<String> filters;

  const ReportItem({required this.type, required this.title, required this.formats, required this.filters});

  factory ReportItem.fromJson(Map<String, dynamic> json) => ReportItem(
        type: (json['type'] ?? '').toString(),
        title: (json['title'] ?? '').toString(),
        formats: (json['formats'] is List ? json['formats'] as List : const []).map((e) => e.toString()).toList(),
        filters: (json['filters'] is List ? json['filters'] as List : const []).map((e) => e.toString()).toList(),
      );
}

/// Source des rapports (remplaçable dans les tests).
abstract class ReportsDataSource {
  Future<List<ReportItem>> fetchCatalog();

  /// Génère le rapport côté serveur et l'enregistre. Aucun identifiant
  /// d'utilisateur n'est envoyé : le périmètre est décidé par le serveur.
  Future<void> download(ReportItem report, String format, {String? period});
}

class ReportService implements ReportsDataSource {
  ReportService({Dio? dio}) : _dio = dio;

  final Dio? _dio;

  static const String basePath = '/reports';

  /// Même module, sous le seul préfixe ouvert au rôle responsable_logistique_achat.
  static const String fallbackBasePath = '/production/reports';

  static const Map<String, String> _mime = {
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'pdf': 'application/pdf',
  };

  Future<Response<T>> _get<T>(String path, {Map<String, dynamic>? query, Options? options}) async {
    final dio = _dio ?? ApiClient.instance.dio;
    try {
      return await dio.get<T>('$basePath$path', queryParameters: query, options: options);
    } on DioException catch (e) {
      if (e.response?.statusCode != 403) rethrow;
      return dio.get<T>('$fallbackBasePath$path', queryParameters: query, options: options);
    }
  }

  @override
  Future<List<ReportItem>> fetchCatalog() async {
    final response = await _get<dynamic>('');
    final body = response.data;
    final data = body is Map && body['data'] is Map ? body['data'] as Map : const {};
    final reports = data['reports'] is List ? data['reports'] as List : const [];
    return reports.whereType<Map>().map((e) => ReportItem.fromJson(Map<String, dynamic>.from(e))).toList();
  }

  @override
  Future<void> download(ReportItem report, String format, {String? period}) async {
    final query = <String, dynamic>{
      'format': format,
      if (period != null && period.isNotEmpty && report.filters.contains('period')) 'period': period,
    };
    final response = await _get<List<int>>(
      '/${report.type}',
      query: query,
      options: Options(responseType: ResponseType.bytes, receiveTimeout: const Duration(seconds: 60)),
    );
    final bytes = response.data ?? const <int>[];
    saveReportFile(bytes, filenameFrom(response.headers.value('content-disposition'), report.type, format), _mime[format] ?? 'application/octet-stream');
  }

  /// Nom de fichier annoncé par le serveur, sinon un nom par défaut.
  static String filenameFrom(String? contentDisposition, String type, String format) {
    final match = RegExp(r'filename="?([^";]+)"?').firstMatch(contentDisposition ?? '');
    final name = match?.group(1)?.trim();
    return (name != null && name.isNotEmpty) ? name : 'rapport-$type.$format';
  }
}
