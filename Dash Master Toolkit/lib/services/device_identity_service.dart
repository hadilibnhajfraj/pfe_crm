import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:device_info_plus/device_info_plus.dart';

import '../providers/auth_storage.dart';

/// Identité d'appareil pour le MFA ("nouvel appareil" / "faire confiance à
/// cet appareil 30 jours" — voir services/mfa.service.js côté backend).
///
/// - deviceId : UUID stable généré une fois, persisté dans
///   flutter_secure_storage (survit aux redémarrages de l'app, pas aux
///   réinstallations — comportement attendu).
/// - deviceName : libellé lisible ("iPhone 14", "Chrome sur Windows", ...)
///   affiché côté serveur pour la gestion des appareils de confiance.
class DeviceIdentityService {
  DeviceIdentityService._();

  static Future<String> getDeviceId() => AuthStorage.instance.getOrCreateDeviceId();

  static Future<String> getDeviceName() async {
    try {
      final info = DeviceInfoPlugin();

      if (kIsWeb) {
        final web = await info.webBrowserInfo;
        final browser = web.browserName.name;
        final platform = web.platform ?? '';
        return platform.isNotEmpty ? '$browser sur $platform' : browser;
      }

      // defaultTargetPlatform évite d'importer dart:io (incompatible web) —
      // device_info_plus expose un accesseur par plateforme, on tente dans
      // un ordre raisonnable et on retombe sur un libellé générique.
      try {
        final android = await info.androidInfo;
        return '${android.manufacturer} ${android.model}'.trim();
      } catch (_) {}
      try {
        final ios = await info.iosInfo;
        return ios.utsname.machine.isNotEmpty ? ios.utsname.machine : (ios.name.isNotEmpty ? ios.name : 'iPhone/iPad');
      } catch (_) {}
      try {
        final windows = await info.windowsInfo;
        return windows.computerName.isNotEmpty ? windows.computerName : 'PC Windows';
      } catch (_) {}
      try {
        final macos = await info.macOsInfo;
        return macos.model.isNotEmpty ? macos.model : 'Mac';
      } catch (_) {}
      try {
        final linux = await info.linuxInfo;
        return linux.prettyName.isNotEmpty ? linux.prettyName : 'Linux';
      } catch (_) {}

      return 'Appareil inconnu';
    } catch (_) {
      return 'Appareil inconnu';
    }
  }
}
