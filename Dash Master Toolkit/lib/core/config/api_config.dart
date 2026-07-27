/// Production-ready API configuration
/// 
/// Centralized API base URLs for all platforms:
/// - Web: http://localhost:4000
/// - Mobile (Android): http://localhost:4000 (or 10.0.2.2:4000 for emulator)
/// - Desktop: http://localhost:4000
class ApiConfig {
  /// API base URL - change to production URL or environment variable as needed
  static const String baseUrl = 'http://localhost:4000';

  /// WebSocket base URL
  static const String wsBaseUrl = 'ws://localhost:4000';

  /// Convenience getters
  static String get apiPath => baseUrl;
  static String get socketPath => wsBaseUrl;

  /// Platform constants (for future use)
  static const String hostLocal = 'localhost';
  static const String hostAndroidEmulator = '10.0.2.2';
  static const int port = 4000;
}
