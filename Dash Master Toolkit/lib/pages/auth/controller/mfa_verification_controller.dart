import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../providers/auth_service.dart';

class MfaVerificationController extends GetxController {
  final AuthService _authService = AuthService();

  MfaVerificationController({required String initialChallengeToken, required int initialExpiresInSeconds})
      : challengeToken = initialChallengeToken.obs,
        remainingSeconds = initialExpiresInSeconds.obs;

  final TextEditingController otpController = TextEditingController();
  final FocusNode f1 = FocusNode();
  final formKey = GlobalKey<FormState>();

  final RxString challengeToken;
  final RxInt remainingSeconds;

  final RxBool trustDevice = false.obs;
  final RxBool isSubmitting = false.obs;
  final RxBool isResending = false.obs;
  final RxBool otpFieldIsFocused = false.obs;

  Timer? _ticker;

  bool get isExpired => remainingSeconds.value <= 0;

  String get formattedRemaining {
    final s = remainingSeconds.value.clamp(0, 99 * 60);
    final m = s ~/ 60;
    final r = s % 60;
    return '${m.toString().padLeft(2, '0')}:${r.toString().padLeft(2, '0')}';
  }

  @override
  void onInit() {
    super.onInit();
    f1.addListener(() => otpFieldIsFocused.value = f1.hasFocus);
    _startTicker();
  }

  void _startTicker() {
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (remainingSeconds.value > 0) {
        remainingSeconds.value -= 1;
      } else {
        _ticker?.cancel();
      }
    });
  }

  String? validateOtp(String? value) {
    final v = (value ?? '').trim();
    if (v.isEmpty) return 'Le code est requis';
    if (!RegExp(r'^\d{6}$').hasMatch(v)) return 'Le code doit contenir 6 chiffres';
    return null;
  }

  /// Retourne un message d'erreur à afficher (snackbar), ou null en cas de succès.
  Future<String?> submit() async {
    if (!(formKey.currentState?.validate() ?? false)) return null;

    // DIAGNOSTIC TEMPORAIRE (audit "wrong_code" côté client) — aucun
    // comportement changé, uniquement des logs. Préfixe [MFA-DIAG] pour
    // corréler avec les logs backend (voir mfa.service.js).
    final raw = otpController.text;
    final trimmed = raw.trim();
    // ignore: avoid_print
    print('[MFA-DIAG][Flutter] OTP saisi (brut) : "$raw"');
    // ignore: avoid_print
    print('[MFA-DIAG][Flutter] Longueur (brut) : ${raw.length}');
    // ignore: avoid_print
    print('[MFA-DIAG][Flutter] Codes ASCII/Unicode (brut) : ${raw.codeUnits}');
    // ignore: avoid_print
    print('[MFA-DIAG][Flutter] OTP après trim() : "$trimmed" (longueur=${trimmed.length}, codeUnits=${trimmed.codeUnits})');
    // ignore: avoid_print
    print(
      '[MFA-DIAG][Flutter] challengeToken (20 premiers car.) : '
      '"${challengeToken.value.substring(0, challengeToken.value.length.clamp(0, 20))}..."',
    );

    isSubmitting.value = true;
    try {
      await _authService.verifyMfa(
        challengeToken: challengeToken.value,
        otp: trimmed,
        trustDevice: trustDevice.value,
      );
      // ignore: avoid_print
      print('[MFA-DIAG][Flutter] verifyMfa() résolu SANS exception — OTP accepté par le backend.');
      return null;
    } catch (e) {
      // ignore: avoid_print
      print('[MFA-DIAG][Flutter] verifyMfa() a levé une exception : $e');
      return e.toString().replaceFirst('Exception: ', '');
    } finally {
      isSubmitting.value = false;
    }
  }

  /// Retourne un message d'erreur (snackbar) en cas d'échec, null si le
  /// renvoi a réussi (un nouveau challengeToken a alors été appliqué et le
  /// minuteur relancé).
  Future<String?> resend() async {
    isResending.value = true;
    try {
      final refreshed = await _authService.resendMfaOtp(challengeToken: challengeToken.value);
      challengeToken.value = refreshed.challengeToken;
      remainingSeconds.value = refreshed.expiresInSeconds;
      otpController.clear();
      _startTicker();
      return null;
    } catch (e) {
      return e.toString().replaceFirst('Exception: ', '');
    } finally {
      isResending.value = false;
    }
  }

  @override
  void onClose() {
    _ticker?.cancel();
    otpController.dispose();
    f1.dispose();
    super.onClose();
  }
}
