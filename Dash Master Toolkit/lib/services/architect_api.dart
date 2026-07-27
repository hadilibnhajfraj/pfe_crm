import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../forms/model/architect_model.dart';
import '../providers/api_client.dart';

class ArchitectApi {
  ArchitectApi._();

  static final ArchitectApi instance = ArchitectApi._();

  Dio get _dio => ApiClient.instance.dio;

  Future<List<ArchitectModel>> getAllArchitects() async {
    final response = await _dio.get('/architects/all');
    final data = response.data;

    debugPrint('ARCHITECTS API RESPONSE: $data');

    if (data is! List) {
      throw Exception('Invalid architects response');
    }

    final architects = data
        .whereType<Map>()
        .map((item) => ArchitectModel.fromJson(Map<String, dynamic>.from(item)))
        .where(
            (architect) => architect.id.isNotEmpty && architect.name.isNotEmpty)
        .toList();

    debugPrint('ARCHITECTS LENGTH: ${architects.length}');

    return architects;
  }
}
