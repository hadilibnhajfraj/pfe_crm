import 'package:dash_master_toolkit/providers/api_client.dart';

class UserProfileService {
  static Future<Map<String, dynamic>> getMyProfile() async {
    final res = await ApiClient.instance.dio.get("/users/profile");
    return Map<String, dynamic>.from(res.data);
  }

  static Future<Map<String, dynamic>> updateMyProfile(Map<String, dynamic> payload) async {
    final res = await ApiClient.instance.dio.put("/users/profile", data: payload);
    return Map<String, dynamic>.from(res.data);
  }

  static Future<void> logout() async {
    await ApiClient.instance.dio.post("/auth/logout");
  }
}
