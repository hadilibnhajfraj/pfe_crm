import 'package:flutter/foundation.dart';
import '../providers/api_client.dart';

// ── Modèle ────────────────────────────────────────────────────────────────────
class CommercialProfile {
  final String id;
  final String name;

  const CommercialProfile({required this.id, required this.name});

  /// Depuis un objet JSON (au cas où le backend évolue)
  factory CommercialProfile.fromJson(Map<String, dynamic> json) {
    final name = (json['name'] ?? json['nom'] ?? '').toString();
    final id = (json['_id'] ?? json['id'] ?? name).toString();
    return CommercialProfile(id: id, name: name);
  }

  /// Depuis une string brute (format actuel de /commercial-contacts/user-names/list)
  factory CommercialProfile.fromString(String value) =>
      CommercialProfile(id: value, name: value);

  @override
  bool operator ==(Object other) =>
      other is CommercialProfile && other.id == id;

  @override
  int get hashCode => id.hashCode;
}

// ── Service API ───────────────────────────────────────────────────────────────
class CommercialProfileApiService {
  static final CommercialProfileApiService instance =
      CommercialProfileApiService._();
  CommercialProfileApiService._();

  /// GET /commercial-contacts/user-names/list
  /// Réponse : ["najeh", "mooemen", "mayssa", "wajdi"]
  Future<List<CommercialProfile>> getProfiles() async {
    debugPrint('[CommercialProfileApi] GET /commercial-contacts/user-names/list');
    final response = await ApiClient.instance.dio
        .get('/commercial-contacts/user-names/list');

    final data = response.data;
    debugPrint('[CommercialProfileApi] type=${data.runtimeType} data=$data');

    if (data is! List) return [];

    return data.map<CommercialProfile>((e) {
      if (e is Map<String, dynamic>) return CommercialProfile.fromJson(e);
      return CommercialProfile.fromString(e.toString());
    }).toList();
  }
}
