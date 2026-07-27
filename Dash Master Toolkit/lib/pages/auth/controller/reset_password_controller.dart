import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../providers/auth_service.dart';

/// État de l'écran, piloté par GET /auth/reset-password/validate puis par la
/// réponse de POST /auth/reset-password (un lien valide peut redevenir
/// expired/invalid entre les deux appels : token déjà consommé ailleurs,
/// double-clic, etc.).
enum ResetPageStatus { checking, missingParams, valid, expired, invalid, success }

class ResetPasswordController extends GetxController {
  TextEditingController passwordController = TextEditingController();
  TextEditingController confirmPasswordController = TextEditingController();

  FocusNode f1 = FocusNode();
  FocusNode f2 = FocusNode();

  final formKey = GlobalKey<FormState>();

  final passwordFieldIsFocused = false.obs;
  final confirmPasswordFieldIsFocused = false.obs;

  // true = mot de passe masqué (même convention que sign_in_controller).
  RxBool isShowPasswordIcon = true.obs;
  RxBool isShowConfirmPasswordIcon = true.obs;

  // Recopie réactive de passwordController.text — pilote la checklist des
  // règles et la jauge de sécurité sans reconstruire tout l'écran.
  final passwordValue = ''.obs;

  final status = ResetPageStatus.checking.obs;
  final isSubmitting = false.obs;

  String email = '';
  String token = '';

  final AuthService _authService = AuthService();

  @override
  void onInit() {
    super.onInit();
    f1.addListener(() => passwordFieldIsFocused.value = f1.hasFocus);
    f2.addListener(() => confirmPasswordFieldIsFocused.value = f2.hasFocus);
    passwordController.addListener(() {
      passwordValue.value = passwordController.text;
    });
  }

  @override
  void onClose() {
    passwordController.dispose();
    confirmPasswordController.dispose();
    f1.dispose();
    f2.dispose();
    super.onClose();
  }

  // ── Règles de complexité (identiques à isStrongPasswordForReset côté
  // backend) — pilotent la checklist affichée à l'utilisateur.
  bool get hasMinLength => passwordValue.value.length >= 8;
  bool get hasUppercase => RegExp(r'[A-Z]').hasMatch(passwordValue.value);
  bool get hasLowercase => RegExp(r'[a-z]').hasMatch(passwordValue.value);
  bool get hasDigit => RegExp(r'[0-9]').hasMatch(passwordValue.value);
  bool get hasSpecialChar => RegExp(r'[^A-Za-z0-9]').hasMatch(passwordValue.value);

  bool get meetsAllRules =>
      hasMinLength && hasUppercase && hasLowercase && hasDigit && hasSpecialChar;

  int get strengthScore => [hasMinLength, hasUppercase, hasLowercase, hasDigit, hasSpecialChar]
      .where((ok) => ok)
      .length;

  String? validateNewPassword(String? value) {
    final v = value ?? '';
    if (v.isEmpty) return 'Le mot de passe est requis';
    if (!meetsAllRules) {
      return 'Le mot de passe ne respecte pas toutes les règles ci-dessous';
    }
    return null;
  }

  String? validateConfirm(String? value) {
    final v = value ?? '';
    if (v.isEmpty) return 'Veuillez confirmer le mot de passe';
    if (v != passwordController.text) return 'Les mots de passe ne correspondent pas';
    return null;
  }

  /// Renseigne email/token depuis les query params de l'URL puis déclenche
  /// la vérification du lien. Appelé une seule fois par l'écran (initState).
  Future<void> init({required String? email, required String? token}) async {
    this.email = (email ?? '').trim();
    this.token = (token ?? '').trim();

    if (this.email.isEmpty || this.token.isEmpty) {
      status.value = ResetPageStatus.missingParams;
      return;
    }

    await validateToken();
  }

  Future<void> validateToken() async {
    status.value = ResetPageStatus.checking;
    try {
      final res = await _authService.validateResetToken(email: email, token: token);
      if (res['valid'] == true) {
        status.value = ResetPageStatus.valid;
      } else {
        status.value = res['reason'] == 'expired' ? ResetPageStatus.expired : ResetPageStatus.invalid;
      }
    } catch (_) {
      status.value = ResetPageStatus.invalid;
    }
  }

  /// Retourne un message d'erreur à afficher (snackbar) si l'échec n'est ni
  /// "expired" ni "invalid" (ces deux cas basculent directement l'écran vers
  /// la vue correspondante).
  Future<String?> submit() async {
    if (!(formKey.currentState?.validate() ?? false)) return null;

    isSubmitting.value = true;
    try {
      await _authService.resetPassword(
        email: email,
        token: token,
        newPassword: passwordController.text,
      );
      status.value = ResetPageStatus.success;
      return null;
    } catch (e) {
      final msg = e.toString().replaceFirst('Exception: ', '');
      if (msg.contains('expiré')) {
        status.value = ResetPageStatus.expired;
        return null;
      }
      if (msg.contains('invalide') && msg.contains('Lien')) {
        status.value = ResetPageStatus.invalid;
        return null;
      }
      return msg;
    } finally {
      isSubmitting.value = false;
    }
  }
}
