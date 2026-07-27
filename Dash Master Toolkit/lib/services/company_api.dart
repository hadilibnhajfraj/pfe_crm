import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../forms/model/company_model.dart';
import '../providers/api_client.dart';

class CompanyApi {
  CompanyApi._();

  static final CompanyApi instance = CompanyApi._();

  Dio get _dio => ApiClient.instance.dio;

  Future<List<CompanyModel>> getAllCompanies() async {
    final response = await _dio.get('/companies/all');
    final data = response.data;

    debugPrint('COMPANIES API RESPONSE: $data');

    if (data is! List) {
      throw Exception('Invalid companies response');
    }

    final companies = data
        .whereType<Map>()
        .map((item) => CompanyModel.fromJson(Map<String, dynamic>.from(item)))
        .where((company) => company.id.isNotEmpty && company.name.isNotEmpty)
        .toList();

    debugPrint('COMPANIES LENGTH: ${companies.length}');

    return companies;
  }
}
