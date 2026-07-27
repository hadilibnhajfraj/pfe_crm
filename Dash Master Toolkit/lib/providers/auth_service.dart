import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:get_storage/get_storage.dart';

import '../services/device_identity_service.dart';
import 'api_client.dart';
import 'auth_storage.dart';

/// Levée par [AuthService.signin] quand le mot de passe est correct mais
/// qu'un second facteur (OTP email) est requis — voir POST /auth/signin
/// côté backend (`{ mfaRequired: true, challengeToken, expiresInSeconds }`).
/// Distincte d'[Exception] générique pour que l'UI puisse naviguer vers
/// l'écran de vérification MFA plutôt que d'afficher une simple erreur.
class MfaRequiredException implements Exception {
  final String challengeToken;
  final int expiresInSeconds;
  MfaRequiredException({required this.challengeToken, required this.expiresInSeconds});
}

class AuthService extends ChangeNotifier {
  AuthService._internal();
  static final AuthService _instance = AuthService._internal();
  factory AuthService() => _instance;

  final GetStorage _box = GetStorage();
void setUserName(String name) {
  _box.write("user_nom", name);
}

String? getUserName() {
  return _box.read("user_nom");
}
String get displayName {
  return getUserName() ??
      userEmail ??
      "Unknown";
}
  bool get isLoggedIn => _box.read<bool>('isLoggedIn') ?? false;
  String? get accessToken => _box.read<String>('accessToken');

  String? get userId => _box.read<String>('userId');
  String? get userEmail => _box.read<String>('userEmail');
  String? get userRole => _box.read<String>('userRole');
  // Ajouter à la fin de AuthService (avant la fin de la classe)
bool get isAdmin {
    final r = userRole?.toLowerCase();
    return r == 'admin' || r == 'superadmin' || r == 'superadmin2';
  }
bool get isAgent => userRole?.toLowerCase() == 'agent';
bool get isClient => userRole?.toLowerCase() == 'client';

// Accès au dashboard KPI Commercial Contacts :
// uniquement admin, superadmin, superadmin2 et commercial.
// Le rôle "user" est explicitement exclu.
bool get canViewCommercialKpi {
  final r = (userRole ?? '').toLowerCase().trim();
  return r == 'admin' || r == 'superadmin' || r == 'superadmin2' || r == 'commercial';
}

// Accès au module POR PROMESH :
// uniquement admin, superadmin, superadmin2 et responsable_logistique_achat.
bool get canViewPorPromesh {
  final r = (userRole ?? '').toLowerCase().trim();
  return r == 'admin' || r == 'superadmin' || r == 'superadmin2' || r == 'responsable_logistique_achat';
}

// Comptes pour lesquels le "Dashboard Industriel" ne doit jamais être
// affiché — ils ouvrent uniquement le Dashboard Administrateur (/dashboard).
// cbitunisia@cbi-tunisia.com (root admin) est volontairement exclu : son
// Dashboard par défaut est désormais le Dashboard Industriel lui-même.
bool get hideIndustrialDashboard {
  final e = (userEmail ?? '').toLowerCase().trim();
  return e == 'issam@gmail.com';
}

// Seul ce compte peut voir/gérer la rubrique Administration > Demandes
// (archivage/désarchivage) : liste, accepter, refuser, supprimer.
bool get isRootAdmin {
  final e = (userEmail ?? '').toLowerCase().trim();
  return e == 'cbitunisia@cbi-tunisia.com';
}

// Gestion complète des demandes de maintenance (Administration > Demandes >
// Maintenance) : accepter/refuser/affecter un technicien/passer en cours/
// terminer/supprimer. Admin (rôle) + rôle responsable_logistique_achat +
// accueilcbif@gmail.com (compte explicitement désigné Responsable
// Maintenance, même pattern que isRootAdmin) — même liste que côté backend
// (requireMaintenanceManager.js).
bool get canManageMaintenanceRequests {
  final r = (userRole ?? '').toLowerCase().trim();
  final e = (userEmail ?? '').toLowerCase().trim();
  return r == 'admin' ||
      r == 'superadmin' ||
      r == 'superadmin2' ||
      r == 'responsable_logistique_achat' ||
      e == 'accueilcbif@gmail.com';
}

// Gestion complète des demandes RH (Administration > Demandes > RH) :
// accepter/refuser/commenter/marquer traité. Admin (rôle) +
// manegerofficecbi@gmail.com (compte explicitement désigné Responsable RH,
// même pattern que canManageMaintenanceRequests).
bool get canManageHrRequests {
  final r = (userRole ?? '').toLowerCase().trim();
  final e = (userEmail ?? '').toLowerCase().trim();
  return r == 'admin' || r == 'superadmin' || r == 'superadmin2' || e == 'manegerofficecbi@gmail.com';
}
  // ---------------- SIGNUP ----------------
  Future<void> signup({required String email, required String password}) async {
    await ApiClient.instance.dio.post('/auth/signup', data: {
      'email': email.trim().toLowerCase(),
      'password': password,
    });
  }
Future<List<String>> getUserNames() async {
  final response = await ApiClient.instance.dio.get(
    "/commercial-contacts/user-names/list",
  );

  return List<String>.from(response.data);
}
  // ---------------- SIGNIN (7 days session) ----------------
  // Déclenche manuellement le redirect GoRouter (après dialog si silentNotify=true).
  void triggerRefresh() => notifyListeners();

  Future<void> signin({
    required String email,
    required String password,
    bool silentNotify = false,
  }) async {
    // ✅ reset session avant tentative
    await _box.write('isLoggedIn', false);
    await _box.remove('accessToken');
    await _box.remove('tokenExpiryMs');
    await _box.remove('userId');
    await _box.remove('userEmail');
    await _box.remove('userRole');

    try {
      final deviceId = await DeviceIdentityService.getDeviceId();
      final deviceToken = await AuthStorage.instance.getDeviceToken();

      final res = await ApiClient.instance.dio.post('/auth/signin', data: {
        'email': email.trim().toLowerCase(),
        'password': password,
        'deviceId': deviceId,
        if (deviceToken != null) 'deviceToken': deviceToken,
      });

      final status = res.statusCode ?? 0;
      if (status >= 400) {
        final data = res.data;
        final msg = (data is Map && data['message'] != null)
            ? data['message'].toString()
            : 'Erreur de connexion';
        throw Exception(msg);
      }

      final token = res.data['accessToken'] as String?;
      if (token == null || token.isEmpty) {
        throw Exception('accessToken manquant');
      }

      await _persistSession(token: token, user: res.data['user']);
      if (!silentNotify) notifyListeners();
    } on DioException catch (e) {
      final data = e.response?.data;
      final msg = (data is Map && data['message'] != null)
          ? data['message'].toString()
          : (e.message ?? 'Erreur de connexion');

      await _cleanupSession();
      throw Exception(msg);
    } catch (e) {
      await _cleanupSession();
      rethrow;
    }
  }

  // ---------------- MFA : VERIFY OTP ----------------
  // Appelé depuis l'écran de vérification MFA après saisie du code à 6
  // chiffres. `trustDevice` = case "Faire confiance à cet appareil pendant
  // 30 jours" cochée — le serveur renvoie alors un `deviceToken` à
  // persister pour que les connexions suivantes depuis ce même appareil
  // (même IP/navigateur/pays) sautent le MFA (voir mfa.service.js).
  Future<void> verifyMfa({
    required String challengeToken,
    required String otp,
    bool trustDevice = false,
    bool silentNotify = false,
  }) async {
    try {
      final deviceId = await DeviceIdentityService.getDeviceId();
      final deviceName = await DeviceIdentityService.getDeviceName();

      final body = {
        'challengeToken': challengeToken,
        'otp': otp,
        'deviceId': deviceId,
        'deviceName': deviceName,
        'trustDevice': trustDevice,
      };

      // DIAGNOSTIC TEMPORAIRE (audit "wrong_code") — log du body EXACT
      // envoyé à Dio (même référence `body` utilisée juste en dessous, donc
      // ce qui est loggé est garanti identique à ce qui part sur le fil).
      // runtimeType sur `otp` permet de détecter une conversion int/double
      // accidentelle (le backend attend une String).
      // ignore: avoid_print
      print('[MFA-DIAG][Flutter][ApiService] JSON envoyé à POST /auth/mfa/verify : $body');
      // ignore: avoid_print
      print('[MFA-DIAG][Flutter][ApiService] otp runtimeType=${otp.runtimeType}, otp="$otp", otp.length=${otp.length}');

      final res = await ApiClient.instance.dio.post('/auth/mfa/verify', data: body);

      final status = res.statusCode ?? 0;
      if (status >= 400) {
        final data = res.data;
        final msg = (data is Map && data['message'] != null)
            ? data['message'].toString()
            : 'Code de vérification invalide';
        throw Exception(msg);
      }

      final token = res.data['accessToken'] as String?;
      if (token == null || token.isEmpty) {
        throw Exception('accessToken manquant');
      }

      await _persistSession(token: token, user: res.data['user']);

      final newDeviceToken = res.data['deviceToken'] as String?;
      if (newDeviceToken != null && newDeviceToken.isNotEmpty) {
        // 30 jours — doit rester cohérent avec DEVICE_TOKEN_TTL_DAYS côté
        // backend (utils/mfaTokens.js). La vraie limite est de toute façon
        // imposée par l'exp du JWT lui-même, ceci ne fait qu'éviter de
        // renvoyer un token déjà expiré sans le savoir.
        await AuthStorage.instance.saveDeviceToken(
          token: newDeviceToken,
          expiry: DateTime.now().add(const Duration(days: 30)),
        );
      }

      if (!silentNotify) notifyListeners();
    } on DioException catch (e) {
      final data = e.response?.data;
      final msg = (data is Map && data['message'] != null)
          ? data['message'].toString()
          : (e.message ?? 'Code de vérification invalide');
      throw Exception(msg);
    }
  }

  // ---------------- MFA : RESEND OTP ----------------
  // Retourne le NOUVEAU challengeToken — le backend en émet un différent à
  // chaque renvoi (services/mfa.service.js `createOtpChallenge`), l'écran
  // MFA doit donc remplacer le sien après un renvoi réussi.
  Future<MfaRequiredException> resendMfaOtp({required String challengeToken}) async {
    try {
      final res = await ApiClient.instance.dio.post('/auth/mfa/resend', data: {
        'challengeToken': challengeToken,
      });

      final status = res.statusCode ?? 0;
      if (status >= 400) {
        final data = res.data;
        final msg = (data is Map && data['message'] != null)
            ? data['message'].toString()
            : 'Impossible de renvoyer le code';
        throw Exception(msg);
      }

      return MfaRequiredException(
        challengeToken: res.data['challengeToken'] as String,
        expiresInSeconds: (res.data['expiresInSeconds'] as num?)?.toInt() ?? 600,
      );
    } on DioException catch (e) {
      final data = e.response?.data;
      final msg = (data is Map && data['message'] != null)
          ? data['message'].toString()
          : (e.message ?? 'Impossible de renvoyer le code');
      throw Exception(msg);
    }
  }

  // ---------------- PRIVATE: PERSIST SESSION ----------------
  // Commun à signin() (chemin sans MFA) et verifyMfa() (après code validé) —
  // même stockage (token sécurisé + mirror GetStorage + header Dio) dans les
  // deux cas, pour que le reste de l'app ne voie jamais la différence.
  Future<void> _persistSession({required String token, dynamic user}) async {
    // ✅ expiry local = 7 jours (même si backend ne renvoie pas exp)
    final expiry = DateTime.now().add(const Duration(days: 7));

    // ✅ stockage sécurisé
    await AuthStorage.instance.saveToken(token: token, expiry: expiry);

    // ✅ (optionnel) garder un mirror dans GetStorage
    await _box.write('accessToken', token);
    await _box.write('tokenExpiryMs', expiry.millisecondsSinceEpoch);
    await _box.write('isLoggedIn', true);

    // ✅ stock user
    if (user is Map) {
      await _box.write('userId', (user['id'] ?? '').toString());
      await _box.write('userEmail', (user['email'] ?? '').toString());
      await _box.write('userRole', (user['role'] ?? '').toString());
    }

    // ✅ set token in dio header
    ApiClient.instance.setToken(token);
  }

  // ---------------- RESTORE SESSION (auto login) ----------------
  Future<bool> restoreSession() async {
    try {
      final token = await AuthStorage.instance.getToken();
      final expiry = await AuthStorage.instance.getExpiry();

      if (token == null || expiry == null) {
        await _cleanupSession();
        return false;
      }

      // ✅ expiré => logout
      if (DateTime.now().isAfter(expiry)) {
        await _cleanupSession();
        return false;
      }

      // ✅ session OK
      ApiClient.instance.setToken(token);

      await _box.write('accessToken', token);
      await _box.write('tokenExpiryMs', expiry.millisecondsSinceEpoch);
      await _box.write('isLoggedIn', true);

      notifyListeners();
      return true;
    } catch (_) {
      await _cleanupSession();
      return false;
    }
  }

  // ---------------- LOGOUT ----------------
  Future<void> logout() async {
    await _cleanupSession();
    notifyListeners();
  }

  // ---------------- FORGOT PASSWORD ----------------
  Future<Map<String, dynamic>> forgotPassword({required String email}) async {
    final res = await ApiClient.instance.dio.post('/auth/forgot-password', data: {
      'email': email.trim().toLowerCase(),
    });

    final status = res.statusCode ?? 0;
    if (status >= 400) {
      final data = res.data;
      final msg = (data is Map && data['message'] != null)
          ? data['message'].toString()
          : 'Erreur forgot password';
      throw Exception(msg);
    }

    return (res.data is Map<String, dynamic>)
        ? (res.data as Map<String, dynamic>)
        : Map<String, dynamic>.from(res.data);
  }

  // ---------------- VALIDATE RESET TOKEN ----------------
  // GET /auth/reset-password/validate — pré-vérifie l'état du lien (valid /
  // expired / invalid) avant d'afficher le formulaire de réinitialisation.
  Future<Map<String, dynamic>> validateResetToken({
    required String email,
    required String token,
  }) async {
    final res = await ApiClient.instance.dio.get(
      '/auth/reset-password/validate',
      queryParameters: {
        'email': email.trim().toLowerCase(),
        'token': token,
      },
    );

    final status = res.statusCode ?? 0;
    if (status >= 400) {
      throw Exception('Erreur de validation du lien');
    }

    return (res.data is Map<String, dynamic>)
        ? (res.data as Map<String, dynamic>)
        : Map<String, dynamic>.from(res.data);
  }

  // ---------------- RESET PASSWORD ----------------
  Future<Map<String, dynamic>> resetPassword({
    required String email,
    required String token,
    required String newPassword,
  }) async {
    final res = await ApiClient.instance.dio.post('/auth/reset-password', data: {
      'email': email.trim().toLowerCase(),
      'token': token,
      'newPassword': newPassword,
    });

    final status = res.statusCode ?? 0;
    if (status >= 400) {
      final data = res.data;
      final msg = (data is Map && data['message'] != null)
          ? data['message'].toString()
          : 'Erreur reset password';
      throw Exception(msg);
    }

    return (res.data is Map<String, dynamic>)
        ? (res.data as Map<String, dynamic>)
        : Map<String, dynamic>.from(res.data);
  }

  // ---------------- COMMERCIAL SELECTION ----------------
  void clearCommercialSelection() {
    _box.remove('selectedCommercial');
    _box.remove('selectedCommercialId');
  }

  String get selectedCommercial =>
      _box.read<String>('selectedCommercial') ?? '';

  // ---------------- PRIVATE: CLEANUP ----------------
  Future<void> _cleanupSession() async {
    await AuthStorage.instance.clear(); // ✅ secure storage

    await _box.write('isLoggedIn', false);
    await _box.remove('accessToken');
    await _box.remove('tokenExpiryMs');
    await _box.remove('userId');
    await _box.remove('userEmail');
    await _box.remove('userRole');

    ApiClient.instance.clearToken(); // ✅ remove Authorization header
  }
}