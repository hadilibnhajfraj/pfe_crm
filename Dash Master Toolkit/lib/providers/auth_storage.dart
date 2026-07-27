import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

class AuthStorage {
  AuthStorage._();
  static final instance = AuthStorage._();

  final _storage = const FlutterSecureStorage();

  static const _kToken = "auth_token";
  static const _kExpiry = "auth_expiry_ms"; // epoch ms

  Future<void> saveToken({required String token, required DateTime expiry}) async {
    await _storage.write(key: _kToken, value: token);
    await _storage.write(key: _kExpiry, value: expiry.millisecondsSinceEpoch.toString());
  }

  Future<String?> getToken() => _storage.read(key: _kToken);

  Future<DateTime?> getExpiry() async {
    final v = await _storage.read(key: _kExpiry);
    if (v == null) return null;
    final ms = int.tryParse(v);
    if (ms == null) return null;
    return DateTime.fromMillisecondsSinceEpoch(ms);
  }

  Future<void> clear() async {
    await _storage.delete(key: _kToken);
    await _storage.delete(key: _kExpiry);
    // Ne supprime PAS _kDeviceId / _kDeviceToken : "faire confiance à cet
    // appareil" doit survivre à une déconnexion normale — sinon la case à
    // cocher perdrait tout son intérêt (MFA redemandé au login suivant).
  }

  // ── MFA : identifiant d'appareil stable ─────────────────────────────────
  // Généré une seule fois, persisté indéfiniment (même après logout) — sert
  // au backend à détecter un "nouvel appareil" même avant qu'un device token
  // de confiance existe (voir services/mfa.service.js côté backend).
  static const _kDeviceId = "mfa_device_id";

  Future<String> getOrCreateDeviceId() async {
    final existing = await _storage.read(key: _kDeviceId);
    if (existing != null && existing.isNotEmpty) return existing;
    final generated = const Uuid().v4();
    await _storage.write(key: _kDeviceId, value: generated);
    return generated;
  }

  // ── MFA : device token ("Faire confiance à cet appareil 30 jours") ─────
  // Le JWT signé n'est remis par le serveur qu'une seule fois, à la
  // création — il faut le persister ici pour le renvoyer aux connexions
  // suivantes (POST /auth/signin `deviceToken`).
  static const _kDeviceToken = "mfa_device_token";
  static const _kDeviceTokenExpiry = "mfa_device_token_expiry_ms";

  Future<void> saveDeviceToken({required String token, required DateTime expiry}) async {
    await _storage.write(key: _kDeviceToken, value: token);
    await _storage.write(key: _kDeviceTokenExpiry, value: expiry.millisecondsSinceEpoch.toString());
  }

  Future<String?> getDeviceToken() async {
    final expiry = await getDeviceTokenExpiry();
    if (expiry != null && DateTime.now().isAfter(expiry)) {
      await clearDeviceToken();
      return null;
    }
    return _storage.read(key: _kDeviceToken);
  }

  Future<DateTime?> getDeviceTokenExpiry() async {
    final v = await _storage.read(key: _kDeviceTokenExpiry);
    if (v == null) return null;
    final ms = int.tryParse(v);
    if (ms == null) return null;
    return DateTime.fromMillisecondsSinceEpoch(ms);
  }

  Future<void> clearDeviceToken() async {
    await _storage.delete(key: _kDeviceToken);
    await _storage.delete(key: _kDeviceTokenExpiry);
  }
}