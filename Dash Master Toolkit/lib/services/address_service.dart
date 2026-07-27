import 'dart:convert';
import 'package:dash_master_toolkit/core/config/api_config.dart';
import 'package:http/http.dart' as http;

class AddressSuggestion {
  final String displayName;
  final double lat;
  final double lon;

  AddressSuggestion({
    required this.displayName,
    required this.lat,
    required this.lon,
  });
}

class AddressService {
  static String get apiBase => ApiConfig.baseUrl;

  static Future<List<AddressSuggestion>> search(String query) async {
    final q = query.trim();
    if (q.length < 3) return [];

    final uri = Uri.parse("$apiBase/utils/geocode").replace(queryParameters: {"q": q});

    try {
      final res = await http.get(uri).timeout(const Duration(seconds: 12));
      if (res.statusCode != 200) return [];

      final decoded = utf8.decode(res.bodyBytes);
      final data = jsonDecode(decoded);
      if (data is! List) return [];

      final out = <AddressSuggestion>[];
      for (final j in data) {
        final name = (j["displayName"] ?? "").toString().trim();
        final lat = (j["lat"] is num) ? (j["lat"] as num).toDouble() : double.tryParse("${j["lat"]}");
        final lon = (j["lon"] is num) ? (j["lon"] as num).toDouble() : double.tryParse("${j["lon"]}");

        if (name.isEmpty || lat == null || lon == null) continue;

        out.add(AddressSuggestion(displayName: name, lat: lat, lon: lon));
      }
      return out;
    } catch (_) {
      return [];
    }
  }
  static Future<AddressSuggestion?> expandMapsUrl(String url) async {
  final u = url.trim();
  if (u.isEmpty) return null;

  final uri = Uri.parse("$apiBase/utils/expand-maps")
      .replace(queryParameters: {"url": u});

  try {
    final res = await http.get(uri).timeout(const Duration(seconds: 12));
    if (res.statusCode != 200) return null;

    final decoded = utf8.decode(res.bodyBytes);
    final data = jsonDecode(decoded);

    if (data is! Map) return null;

    final lat = (data["lat"] is num) ? (data["lat"] as num).toDouble() : double.tryParse("${data["lat"]}");
    final lng = (data["lng"] is num) ? (data["lng"] as num).toDouble() : double.tryParse("${data["lng"]}");

    if (lat == null || lng == null) return null;

    return AddressSuggestion(
      displayName: (data["finalUrl"] ?? u).toString(),
      lat: lat,
      lon: lng,
    );
  } catch (_) {
    return null;
  }
}
}