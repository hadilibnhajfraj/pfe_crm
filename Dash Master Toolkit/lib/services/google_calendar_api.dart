import 'package:dio/dio.dart';
import 'package:dash_master_toolkit/providers/api_client.dart';

class GoogleCalendarStatus {
  final bool connected;
  final String? googleEmail;

  GoogleCalendarStatus({required this.connected, this.googleEmail});

  factory GoogleCalendarStatus.fromJson(Map<String, dynamic> json) {
    return GoogleCalendarStatus(
      connected: json["connected"] == true,
      googleEmail: json["googleEmail"]?.toString(),
    );
  }
}

class GoogleCalendarApi {
  GoogleCalendarApi._();
  static final instance = GoogleCalendarApi._();

  Dio get _dio => ApiClient.instance.dio;

  Future<String> getAuthUrl() async {
    final res = await _dio.get("/google-calendar/auth-url");
    return (res.data["url"] ?? "").toString();
  }

  Future<GoogleCalendarStatus> getStatus() async {
    final res = await _dio.get("/google-calendar/status");
    return GoogleCalendarStatus.fromJson(Map<String, dynamic>.from(res.data));
  }

  Future<void> disconnect() async {
    await _dio.post("/google-calendar/disconnect");
  }
}
