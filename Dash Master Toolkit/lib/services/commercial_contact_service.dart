import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:dash_master_toolkit/core/config/api_config.dart';
import '../application/users/model/commercial_contact_model.dart';
import '../application/users/model/commercial_analytics_model.dart';

class CommercialContactService {
  static String get baseUrl => '${ApiConfig.baseUrl}/commercial-contacts';

Future<List<CommercialContact>> fetchMyContacts({
  required String token,
  String? query,
  String? userNom,
  String? typeClient,
}) async {
  final queryParams = <String, String>{};

  if (query != null && query.trim().isNotEmpty) {
    queryParams['q'] = query.trim();
  }
  if (userNom != null && userNom.isNotEmpty) {
    queryParams['user_nom'] = userNom;
  }
  if (typeClient != null && typeClient.isNotEmpty) {
    queryParams['typeClient'] = typeClient;
  }

  final uri = Uri.parse(baseUrl).replace(queryParameters: queryParams);

  debugPrint('API URL = $uri');

  final response = await http.get(
    uri,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    },
  );

  debugPrint('STATUS = ${response.statusCode}');
  debugPrint('BODY = ${response.body.length > 600 ? "${response.body.substring(0, 600)}..." : response.body}');

  if (response.statusCode == 200) {
    final decoded = jsonDecode(response.body);

    // Détection automatique du format de réponse :
    //  - tableau direct        : [...]
    //  - objet paginé          : {"items":[...]} / {"data":[...]} / {"contacts":[...]} / {"results":[...]}
    List<dynamic> items;
    if (decoded is List) {
      items = decoded;
    } else if (decoded is Map) {
      final raw = decoded['items'] ?? decoded['data'] ?? decoded['contacts'] ?? decoded['results'];
      items = raw is List ? raw : [];
    } else {
      items = [];
    }

    debugPrint('Contacts count = ${items.length}');

    return items
        .map((e) => CommercialContact.fromJson(e as Map<String, dynamic>))
        .toList();
  } else {
    throw Exception('Failed to load commercial contacts (${response.statusCode})');
  }
}

  Future<CommercialContact> updateContact({
    required String token,
    required String id,
    required Map<String, dynamic> data,
  }) async {
    final response = await http.put(
      Uri.parse('$baseUrl/$id'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
      body: jsonEncode(data),
    );

    if (response.statusCode == 200) {
      return CommercialContact.fromJson(
        jsonDecode(response.body) as Map<String, dynamic>,
      );
    } else {
      final body = response.body.isNotEmpty ? jsonDecode(response.body) : {};
      throw Exception(body['message']?.toString() ?? 'Update failed');
    }
  }

  Future<void> deleteContact({
    required String token,
    required String id,
  }) async {
    final response = await http.delete(
      Uri.parse('$baseUrl/$id'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
    );

    if (response.statusCode != 200) {
      final body = response.body.isNotEmpty ? jsonDecode(response.body) : {};
      throw Exception(body['message']?.toString() ?? 'Delete failed');
    }
  }

  // GET /commercial-contacts/:id — fiche complète, utilisée ici uniquement
  // pour récupérer l'historique des statuts (statusHistory), le plus
  // récent en premier (déjà trié côté backend).
  Future<List<CommercialContactStatusHistoryItem>> fetchStatusHistory({
    required String token,
    required String contactId,
  }) async {
    final response = await http.get(
      Uri.parse('$baseUrl/$contactId'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to load status history (${response.statusCode})');
    }

    final decoded = jsonDecode(response.body);
    final raw = decoded is Map ? decoded['statusHistory'] : null;
    if (raw is! List) return [];

    return raw
        .map((e) => CommercialContactStatusHistoryItem.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // POST /commercial-contacts/assign — action admin "Affecter des contacts" :
  // attribue en masse une liste de contacts à un commercial.
  Future<int> assignContacts({
    required String token,
    required List<String> contactIds,
    required String commercialId,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/assign'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
      body: jsonEncode({
        'contactIds': contactIds,
        'commercialId': commercialId,
      }),
    );

    final body = response.body.isNotEmpty ? jsonDecode(response.body) : {};

    if (response.statusCode == 200) {
      return (body['updatedCount'] as num?)?.toInt() ?? 0;
    }
    throw Exception(body['message']?.toString() ?? 'Assign failed');
  }

  // GET /users/commercials — tous les utilisateurs sélectionnables comme
  // "Commercial" (chargés dynamiquement depuis la table users côté backend,
  // aucune liste codée en dur), pour le dropdown Follow-up "Commercial".
  Future<List<CommercialUserOption>> fetchCommercialUsers(String token) async {
    final response = await http.get(
      Uri.parse('${ApiConfig.baseUrl}/users/commercials'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
    );

    if (response.statusCode == 200) {
      final decoded = jsonDecode(response.body);
      final items = decoded is List ? decoded : <dynamic>[];
      return items
          .map((e) => CommercialUserOption.fromJson(e as Map<String, dynamic>))
          .toList();
    }
    throw Exception('Failed to load commercial users (${response.statusCode})');
  }

  Future<List<String>> getUserNames(String token) async {
  final response = await http.get(
    Uri.parse('$baseUrl/user-names/list'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    },
  );

  if (response.statusCode == 200) {
    final data = jsonDecode(response.body);
    return List<String>.from(data);
  } else {
    throw Exception('Failed to load user names');
  }
}

  // ── Helpers internes ───────────────────────────────────────────────────────

  List<CommercialContact> _parseContactList(String body) {
    final decoded = jsonDecode(body);
    List<dynamic> items;
    if (decoded is List) {
      items = decoded;
    } else if (decoded is Map) {
      final raw = decoded['items'] ?? decoded['data'] ?? decoded['contacts'] ?? decoded['results'];
      items = raw is List ? raw : [];
    } else {
      items = [];
    }
    debugPrint('Contacts count = ${items.length}');
    return items
        .map((e) => CommercialContact.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── GET /commercial-contacts/my-kpi — données personnelles ────────────────
  // Retourne CommercialAnalyticsModel si le backend envoie {totalContacts,...}
  // Retourne null si le format est inattendu (le screen fera un fallback)
  Future<CommercialAnalyticsModel?> fetchMyKpiAggregated({required String token}) =>
      _fetchKpiAggregated(endpoint: 'my-kpi', token: token);

  // ── GET /commercial-contacts/kpi — données globales admin ──────────────────
  Future<CommercialAnalyticsModel?> fetchGlobalKpiAggregated({required String token}) =>
      _fetchKpiAggregated(endpoint: 'kpi', token: token);

  // ── Méthode interne avec logs complets ─────────────────────────────────────
  Future<CommercialAnalyticsModel?> _fetchKpiAggregated({
    required String endpoint,
    required String token,
  }) async {
    final uri = Uri.parse('$baseUrl/$endpoint');

    debugPrint('========== KPI FRONT DEBUG ==========');
    debugPrint('API URL = $uri');

    final response = await http.get(uri, headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    });

    debugPrint('STATUS KPI = ${response.statusCode}');
    debugPrint('BODY KPI = ${response.body.length > 800 ? "${response.body.substring(0, 800)}..." : response.body}');

    if (response.statusCode != 200) {
      debugPrint('Endpoint /$endpoint non disponible (${response.statusCode}) — fallback contact list');
      debugPrint('========== END KPI FRONT ==========');
      return null;
    }

    try {
      final decoded = jsonDecode(response.body);

      if (decoded is! Map<String, dynamic>) {
        debugPrint('KPI JSON MAL FORMÉ — attendu Map, reçu ${decoded.runtimeType}');
        debugPrint('========== END KPI FRONT ==========');
        return null;
      }

      final json = decoded;

      if (json['totalContacts'] == null) {
        debugPrint('KPI JSON MAL FORMÉ — clé totalContacts absente');
        debugPrint('========== END KPI FRONT ==========');
        return null;
      }

      debugPrint('TOTAL CONTACTS = ${json["totalContacts"]}');
      debugPrint('TOTAL CALLS = ${json["totalCalls"]}');
      debugPrint('TOTAL COMPANIES = ${json["totalCompanies"] ?? json["totalEntreprises"]}');
      debugPrint('CONTACTS BY STATUS = ${json["contactsByStatut"] ?? json["contactsByStatus"]}');
      debugPrint('CONTACTS BY TYPE = ${json["contactsByType"]}');
      debugPrint('========== END KPI FRONT ==========');

      return CommercialAnalyticsModel.fromJson(json);
    } catch (e) {
      debugPrint('KPI JSON MAL FORMÉ — erreur parsing: $e');
      debugPrint('========== END KPI FRONT ==========');
      return null;
    }
  }

  // ── Fallback historique (liste brute) ──────────────────────────────────────
  Future<List<CommercialContact>> fetchMyKpi({required String token}) async {
    final uri = Uri.parse('$baseUrl/my-kpi');
    debugPrint('API URL = $uri');
    final response = await http.get(uri, headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    });
    debugPrint('STATUS my-kpi = ${response.statusCode}');
    if (response.statusCode == 200) return _parseContactList(response.body);
    debugPrint('my-kpi non disponible — fallback GET /commercial-contacts');
    return fetchMyContacts(token: token);
  }

  Future<List<CommercialContact>> fetchGlobalKpi({required String token}) async {
    final uri = Uri.parse('$baseUrl/kpi');
    debugPrint('API URL = $uri');
    final response = await http.get(uri, headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    });
    debugPrint('STATUS kpi = ${response.statusCode}');
    if (response.statusCode == 200) return _parseContactList(response.body);
    debugPrint('kpi non disponible — fallback GET /commercial-contacts');
    return fetchMyContacts(token: token);
  }

  // GET /commercial-contacts/analytics
  Future<CommercialAnalyticsModel> fetchAnalytics(String token) async {
    final response = await http.get(
      Uri.parse('$baseUrl/analytics'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
    );

    if (response.statusCode == 200) {
      return CommercialAnalyticsModel.fromJson(
        jsonDecode(response.body) as Map<String, dynamic>,
      );
    }

    final contacts = await fetchMyContacts(token: token);
    return CommercialAnalyticsModel.fromContacts(contacts);
  }
}