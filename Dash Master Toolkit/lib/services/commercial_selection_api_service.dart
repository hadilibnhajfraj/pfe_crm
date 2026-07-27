import 'package:flutter/foundation.dart';
import '../providers/api_client.dart';

class CommercialUserItem {
  final String id;
  final String name;

  const CommercialUserItem({required this.id, required this.name});

  factory CommercialUserItem.fromJson(Map<String, dynamic> json) {
    final name = json['nom'] ?? json['name'] ?? json['_id'] ?? '';
    final id = json['_id'] ?? json['id'] ?? name;
    return CommercialUserItem(id: id.toString(), name: name.toString());
  }

  factory CommercialUserItem.fromString(String value) {
    return CommercialUserItem(id: value, name: value);
  }
}

class CommercialSelectionApiService {
  static final CommercialSelectionApiService instance =
      CommercialSelectionApiService._();
  CommercialSelectionApiService._();

  Future<List<CommercialUserItem>> fetchCommercialUsers() async {
    debugPrint('[CommercialApi] GET /commercial-contacts/user-names/list');

    final response = await ApiClient.instance.dio.get(
      '/commercial-contacts/user-names/list',
    );

    final data = response.data;
    debugPrint('[CommercialApi] response type = ${data.runtimeType}');

    if (data is! List) return [];

    return data.map<CommercialUserItem>((e) {
      if (e is Map<String, dynamic>) return CommercialUserItem.fromJson(e);
      return CommercialUserItem.fromString(e.toString());
    }).toList();
  }
}
