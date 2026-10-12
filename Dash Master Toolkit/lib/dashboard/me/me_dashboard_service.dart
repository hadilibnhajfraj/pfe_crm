import 'package:dio/dio.dart';

import 'package:dash_master_toolkit/providers/api_client.dart';

import 'me_dashboard_model.dart';

/// Source du tableau de bord personnalisé (remplaçable dans les tests).
abstract class MeDashboardDataSource {
  Future<MeDashboard> fetch({String? period});
}

/// GET /dashboard/me. Aucun identifiant ni rôle n'est envoyé : le serveur
/// détermine le profil à partir du jeton et de la base.
class MeDashboardService implements MeDashboardDataSource {
  MeDashboardService({Dio? dio}) : _dio = dio;

  final Dio? _dio;

  static const String primaryPath = '/dashboard/me';

  /// Même réponse, sous le préfixe /users/me : le seul que le serveur ouvre
  /// au rôle responsable_logistique_achat (le préfixe /dashboard lui est fermé).
  static const String fallbackPath = '/users/me/dashboard';

  @override
  Future<MeDashboard> fetch({String? period}) async {
    final dio = _dio ?? ApiClient.instance.dio;
    final query = <String, dynamic>{if (period != null && period.isNotEmpty) 'period': period};
    Response<dynamic> response;
    try {
      response = await dio.get<dynamic>(primaryPath, queryParameters: query);
    } on DioException catch (e) {
      if (e.response?.statusCode != 403) rethrow;
      response = await dio.get<dynamic>(fallbackPath, queryParameters: query);
    }
    final body = response.data;
    if (body is! Map) throw const FormatException('Réponse inattendue du serveur');
    return MeDashboard.fromJson(Map<String, dynamic>.from(body));
  }
}
