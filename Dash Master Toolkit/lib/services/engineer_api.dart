import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../forms/model/engineer_model.dart';
import '../providers/api_client.dart';

class EngineerApi {
  EngineerApi._();

  static final EngineerApi instance = EngineerApi._();

  Dio get _dio => ApiClient.instance.dio;

  Future<List<EngineerModel>> getAllEngineers() async {
    final response = await _dio.get('/engineers/all');
    final data = response.data;

    debugPrint('ENGINEERS API RESPONSE: $data');

    if (data is! List) {
      throw Exception('Invalid engineers response');
    }

    final engineers = data
        .whereType<Map>()
        .map((item) => EngineerModel.fromJson(Map<String, dynamic>.from(item)))
        .where((engineer) => engineer.id.isNotEmpty && engineer.name.isNotEmpty)
        .toList();

    debugPrint('ENGINEERS LENGTH: ${engineers.length}');

    return engineers;
  }
}
