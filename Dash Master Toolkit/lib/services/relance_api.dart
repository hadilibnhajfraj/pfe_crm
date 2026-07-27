import 'package:dio/dio.dart';
import 'package:dash_master_toolkit/providers/api_client.dart';
import 'package:dash_master_toolkit/application/calendar/model/relance_calendar_item.dart';

class RelanceApi {
  RelanceApi._();
  static final instance = RelanceApi._();

  Dio get _dio => ApiClient.instance.dio;

  Future<List<RelanceCalendarItem>> listRelances({DateTime? start, DateTime? end}) async {
    final res = await _dio.get("/commercial-contacts/calendar/relances", queryParameters: {
      if (start != null) "start": _fmtDate(start),
      if (end != null) "end": _fmtDate(end),
    });

    final data = res.data;
    if (data is List) {
      return data.map((e) => RelanceCalendarItem.fromJson(Map<String, dynamic>.from(e))).toList();
    }
    return [];
  }

  Future<void> updateRelance({
    required String contactId,
    required String relanceId,
    required Map<String, dynamic> payload,
  }) async {
    await _dio.put("/commercial-contacts/$contactId/relances/$relanceId", data: payload);
  }

  String _fmtDate(DateTime d) =>
      "${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}";
}
