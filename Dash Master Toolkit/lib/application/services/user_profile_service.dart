import 'package:dash_master_toolkit/providers/api_client.dart';

class UserProfileService {
  static Future<Map<String, dynamic>> getMyProfile() async {
    final dio = ApiClient.instance.dio;
    final res = await dio.get("/users/me/profile");
    return (res.data is Map<String, dynamic>)
        ? (res.data as Map<String, dynamic>)
        : <String, dynamic>{};
  }

  static Future<Map<String, dynamic>> updateMyProfile(
    Map<String, dynamic> payload,
  ) async {
    final dio = ApiClient.instance.dio;
    final res = await dio.put("/users/me/profile", data: payload);
    return (res.data is Map<String, dynamic>)
        ? (res.data as Map<String, dynamic>)
        : <String, dynamic>{};
  }
}
