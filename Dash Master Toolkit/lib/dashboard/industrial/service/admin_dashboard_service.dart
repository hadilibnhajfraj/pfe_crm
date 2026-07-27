// lib/dashboard/industrial/service/admin_dashboard_service.dart
//
// Client pour GET /admin-dashboard/stats — même client Dio, même parsing
// d'enveloppe tolérant que PorPromeshService.

import 'package:dash_master_toolkit/providers/api_client.dart';
import '../model/admin_dashboard_stats_model.dart';

class AdminDashboardService {
  static final AdminDashboardService instance = AdminDashboardService._();
  AdminDashboardService._();

  static const _basePath = '/admin-dashboard';

  Future<AdminDashboardStats> fetchStats() async {
    final res = await ApiClient.instance.dio.get('$_basePath/stats');
    return AdminDashboardStats.fromJson(_unwrapObject(res.data));
  }

  Map<String, dynamic> _unwrapObject(dynamic data) {
    if (data is Map && data['data'] is Map) {
      return Map<String, dynamic>.from(data['data'] as Map);
    }
    if (data is Map) return Map<String, dynamic>.from(data);
    return {};
  }
}
