import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:geocoding/geocoding.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

class NominatimLocation {
  final double latitude;
  final double longitude;
  final String displayName;
  final String countryCode;

  NominatimLocation({
    required this.latitude,
    required this.longitude,
    required this.displayName,
    required this.countryCode,
  });

  bool get isTunisia =>
      countryCode.toLowerCase() == 'tn' || displayName.toLowerCase().contains('tunisia');

  factory NominatimLocation.fromJson(Map<String, dynamic> json) {
    final lat = double.tryParse(json['lat']?.toString() ?? '');
    final lon = double.tryParse(json['lon']?.toString() ?? '');
    final displayName = json['display_name']?.toString() ?? '';
    final address = json['address'] as Map<String, dynamic>?;
    final countryCode = address?['country_code']?.toString().toLowerCase() ?? '';

    return NominatimLocation(
      latitude: lat ?? 0.0,
      longitude: lon ?? 0.0,
      displayName: displayName,
      countryCode: countryCode,
    );
  }
}

class LocationService {
  static const String _tag = 'LocationService';
  static const String _nominatimHost = 'nominatim.openstreetmap.org';

  // Flutter Web browsers block setting User-Agent (forbidden header) and a
  // custom Accept header can trigger a CORS preflight Nominatim may reject.
  // Use no custom headers on web — the browser sends its own User-Agent.
  static Map<String, String> get _nominatimHeaders {
    if (kIsWeb) return {};
    return {
      'User-Agent': 'DashMasterToolkit/1.0',
      'Accept': 'application/json',
    };
  }

  static const LatLng fallbackLocation = LatLng(36.8065, 10.1815);

  // GPS Permission and Location
  static Future<bool> requestLocationPermission() async {
    try {
      debugPrint('$_tag: requestLocationPermission - Checking current permission');
      LocationPermission permission = await Geolocator.checkPermission();
      
      if (permission == LocationPermission.denied) {
        debugPrint('$_tag: requestLocationPermission - Permission denied, requesting');
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          debugPrint('$_tag: requestLocationPermission - User rejected permission request');
          return false;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        debugPrint('$_tag: requestLocationPermission - Permission permanently denied');
        return false;
      }

      debugPrint('$_tag: requestLocationPermission - Permission granted');
      return true;
    } catch (e) {
      debugPrint('$_tag: requestLocationPermission - Error: $e');
      return false;
    }
  }

  static Future<LatLng?> getCurrentLocation() async {
    try {
      debugPrint('$_tag: getCurrentLocation - Starting location acquisition');
      
      // Check and request permissions
      debugPrint('$_tag: getCurrentLocation - Requesting permissions');
      final hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        debugPrint('$_tag: getCurrentLocation - Permission denied, aborting');
        return null;
      }

      // Check if location service is enabled
      debugPrint('$_tag: getCurrentLocation - Checking if GPS is enabled');
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        debugPrint('$_tag: getCurrentLocation - GPS service is disabled');
        return null;
      }

      debugPrint('$_tag: getCurrentLocation - Fetching current position');
      try {
        final position = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 0,
          ),
        ).timeout(
          const Duration(seconds: 10),
          onTimeout: () {
            debugPrint('$_tag: getCurrentLocation - Request timed out after 10 seconds');
            throw TimeoutException('Location request timed out');
          },
        );

        final latLng = LatLng(position.latitude, position.longitude);
        debugPrint('$_tag: getCurrentLocation - SUCCESS: Lat: ${latLng.latitude}, Lng: ${latLng.longitude}');
        return latLng;
      } on TimeoutException {
        debugPrint('$_tag: getCurrentLocation - TimeoutException: Position request exceeded timeout');
        return null;
      } catch (e) {
        debugPrint('$_tag: getCurrentLocation - Error getting position: $e');
        return null;
      }
    } catch (e) {
      debugPrint('$_tag: getCurrentLocation - Unexpected error: $e');
      return null;
    }
  }

  static Future<LatLng> getCurrentLocationOrFallback() async {
    final location = await getCurrentLocation();
    if (location != null) {
      debugPrint('$_tag: getCurrentLocationOrFallback - Returning real GPS location');
      return location;
    }

    debugPrint('$_tag: getCurrentLocationOrFallback - GPS failed, returning fallback location: ${fallbackLocation.latitude}, ${fallbackLocation.longitude}');
    return fallbackLocation;
  }

  // Geocoding - Address to Coordinates using OpenStreetMap Nominatim
  static Future<List<NominatimLocation>> searchPlaces(String query) async {
    final q = query.trim();
    if (q.isEmpty) {
      debugPrint('$_tag: searchPlaces - Query is empty');
      return [];
    }

    // countrycodes=tn forces Nominatim to return only Tunisian results.
    // Without this, globally-ranked results from Morocco or other countries
    // appear first for short/ambiguous queries.
    final uri = Uri.https(_nominatimHost, '/search', {
      'q': q,
      'format': 'jsonv2',
      'limit': '8',
      'addressdetails': '1',
      'countrycodes': 'tn',
    });

    debugPrint('$_tag: searchPlaces - GET $uri');

    try {
      final response = await http
          .get(uri, headers: _nominatimHeaders)
          .timeout(const Duration(seconds: 15));

      debugPrint('$_tag: searchPlaces - HTTP ${response.statusCode}');

      if (response.statusCode != 200) {
        debugPrint('$_tag: searchPlaces - body: ${response.body}');
        return [];
      }

      final data = jsonDecode(response.body);
      if (data is! List) {
        debugPrint('$_tag: searchPlaces - unexpected format: ${response.body.substring(0, 200)}');
        return [];
      }

      debugPrint('$_tag: searchPlaces - raw count: ${data.length}');

      final results = data
          .whereType<Map<String, dynamic>>()
          .map(NominatimLocation.fromJson)
          // Only drop results with clearly invalid coordinates.
          .where((r) => r.latitude != 0.0 || r.longitude != 0.0)
          .toList();

      debugPrint('$_tag: searchPlaces - valid results: ${results.length}');
      return results;
    } catch (e) {
      debugPrint('$_tag: searchPlaces - Error: $e');
      return [];
    }
  }

  // Reverse Geocoding - Coordinates to Address
  static Future<String?> getAddressFromCoordinates(LatLng latLng) async {
    try {
      debugPrint('$_tag: getAddressFromCoordinates - Lat: ${latLng.latitude}, Lng: ${latLng.longitude}');

      // The geocoding package (placemarkFromCoordinates) uses platform channels
      // that are unavailable on Flutter Web — skip it and use Nominatim directly.
      if (kIsWeb) {
        debugPrint('$_tag: getAddressFromCoordinates - Web: using Nominatim');
        return await _reverseGeocodeWithNominatim(latLng);
      }

      final placemarks = await placemarkFromCoordinates(
        latLng.latitude,
        latLng.longitude,
      );

      if (placemarks.isNotEmpty) {
        final place = placemarks.first;
        final address = _buildAddressString(place);
        debugPrint('$_tag: getAddressFromCoordinates - SUCCESS: $address');
        return address;
      }

      debugPrint('$_tag: getAddressFromCoordinates - No placemarks found, using Nominatim fallback');
      return await _reverseGeocodeWithNominatim(latLng);
    } catch (e) {
      debugPrint('$_tag: getAddressFromCoordinates - Error: $e, using Nominatim fallback');
      return await _reverseGeocodeWithNominatim(latLng);
    }
  }

  static Future<String?> _reverseGeocodeWithNominatim(LatLng latLng) async {
    try {
      final uri = Uri.https(_nominatimHost, '/reverse', {
        'lat': latLng.latitude.toString(),
        'lon': latLng.longitude.toString(),
        'format': 'jsonv2',
      });

      final response = await http.get(uri, headers: _nominatimHeaders).timeout(
            const Duration(seconds: 10),
          );

      if (response.statusCode != 200) {
        debugPrint('$_tag: _reverseGeocodeWithNominatim - HTTP ${response.statusCode}');
        return null;
      }

      final body = jsonDecode(response.body);
      final displayName = body['display_name']?.toString();
      debugPrint('$_tag: _reverseGeocodeWithNominatim - SUCCESS: $displayName');
      return displayName;
    } catch (e) {
      debugPrint('$_tag: _reverseGeocodeWithNominatim - Error: $e');
      return null;
    }
  }

  static String _buildAddressString(Placemark place) {
    final components = <String>[];

    if (place.street != null && place.street!.isNotEmpty) {
      components.add(place.street!);
    }

    if (place.locality != null && place.locality!.isNotEmpty) {
      components.add(place.locality!);
    }

    if (place.administrativeArea != null && place.administrativeArea!.isNotEmpty) {
      components.add(place.administrativeArea!);
    }

    if (place.country != null && place.country!.isNotEmpty) {
      components.add(place.country!);
    }

    return components.join(', ');
  }

  // Distance calculation
  static double calculateDistance(LatLng point1, LatLng point2) {
    const Distance distance = Distance();
    return distance.as(LengthUnit.Meter, point1, point2);
  }

  // Check if location services are enabled
  static Future<bool> isLocationServiceEnabled() async {
    try {
      final enabled = await Geolocator.isLocationServiceEnabled();
      debugPrint('$_tag: isLocationServiceEnabled - $enabled');
      return enabled;
    } catch (e) {
      debugPrint('$_tag: isLocationServiceEnabled - Error: $e');
      return false;
    }
  }

  // Pre-flight check: Verify all requirements before map operations
  static Future<Map<String, bool>> verifyLocationRequirements() async {
    debugPrint('$_tag: verifyLocationRequirements - Running pre-flight checks');
    
    try {
      final hasPermission = await requestLocationPermission();
      final isServiceEnabled = await isLocationServiceEnabled();
      
      final result = {
        'hasPermission': hasPermission,
        'isServiceEnabled': isServiceEnabled,
        'isReady': hasPermission && isServiceEnabled,
      };
      
      debugPrint('$_tag: verifyLocationRequirements - Result: $result');
      return result;
    } catch (e) {
      debugPrint('$_tag: verifyLocationRequirements - Error: $e');
      return {
        'hasPermission': false,
        'isServiceEnabled': false,
        'isReady': false,
      };
    }
  }
}