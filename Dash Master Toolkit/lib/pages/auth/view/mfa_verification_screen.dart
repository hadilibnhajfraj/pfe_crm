import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/constant/app_color.dart';
import 'package:dash_master_toolkit/pages/auth/controller/mfa_verification_controller.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

import '../../../application/common/safe_snack.dart';
import '../../../route/my_route.dart';
import '../widgets/auth_ui_kit.dart';

class MfaVerificationScreen extends StatefulWidget {
  final String email;
  final String challengeToken;
  final int expiresInSeconds;

  const MfaVerificationScreen({
    super.key,
    required this.email,
    required this.challengeToken,
    this.expiresInSeconds = 600,
  });

  @override
  MfaVerificationScreenState createState() => MfaVerificationScreenState();
}

class MfaVerificationScreenState extends State<MfaVerificationScreen> {
  late final MfaVerificationController controller = MfaVerificationController(
    initialChallengeToken: widget.challengeToken,
    initialExpiresInSeconds: widget.expiresInSeconds,
  );

  Future<void> _submit() async {
    // DIAGNOSTIC TEMPORAIRE (audit "wrong_code" côté client) — capture ce qui
    // est RÉELLEMENT affiché à l'écran au moment du clic, avant toute
    // transformation. Préfixe [MFA-DIAG].
    // ignore: avoid_print
    print('[MFA-DIAG][Flutter] Clic "Vérifier" — OTP visible à l\'écran (TextField) : "${controller.otpController.text}"');

    final error = await controller.submit();
    if (error != null) {
      SafeSnack.show('Erreur', error, isError: true, context: context);
      return;
    }
    if (!mounted) return;
    // Session ouverte (voir AuthService.verifyMfa) — même déclencheur de
    // redirect GoRouter que sign_in_screen.dart après un login classique.
    context.go(MyRoute.dashboardSalesAdmin);
  }

  Future<void> _resend() async {
    final error = await controller.resend();
    if (error != null) {
      SafeSnack.show('Erreur', error, isError: true, context: context);
    } else {
      SafeSnack.show('Succès',
          AppLocalizations.of(context).translate('Un nouveau code a été envoyé par email.'),
          context: context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return GetBuilder<MfaVerificationController>(
      init: controller,
      tag: 'mfa_verification',
      builder: (controller) {
        return AuthScaffold(
          child: Form(
            key: controller.formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AuthTitle(
                  title: 'Vérification en deux étapes',
                  subtitle: 'Entrez le code à 6 chiffres envoyé à ${widget.email}.',
                ),

                const SizedBox(height: 36),

                Obx(
                  () => AuthTextField(
                    controller: controller.otpController,
                    focusNode: controller.f1,
                    placeholder: '• • • • • •',
                    icon: Icons.shield_outlined,
                    isFocused: controller.otpFieldIsFocused.value,
                    keyboardType: TextInputType.number,
                    textInputAction: TextInputAction.done,
                    validator: controller.validateOtp,
                    autovalidateMode: AutovalidateMode.onUserInteraction,
                    onFieldSubmitted: (_) => _submit(),
                  ),
                ),

                const SizedBox(height: 16),

                Obx(() {
                  final expired = controller.isExpired;
                  return Text(
                    expired ? 'Le code a expiré.' : 'Ce code expire dans ${controller.formattedRemaining}.',
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: expired ? colorError100 : const Color(0xFF64748B),
                    ),
                  );
                }),

                const SizedBox(height: 20),

                Align(
                  alignment: Alignment.centerLeft,
                  child: Obx(
                    () => AuthCheckboxRow(
                      value: controller.trustDevice.value,
                      onChanged: (v) => controller.trustDevice.value = v ?? false,
                      label: 'Faire confiance à cet appareil pendant 30 jours',
                    ),
                  ),
                ),

                const SizedBox(height: 28),

                Obx(
                  () => controller.isSubmitting.value
                      ? SizedBox(
                          height: 52,
                          child: Center(child: CircularProgressIndicator(color: colorPrimary100)),
                        )
                      : AuthGradientButton(
                          label: 'Vérifier',
                          onPressed: _submit,
                        ),
                ),

                const SizedBox(height: 20),

                Obx(
                  () => TextButton(
                    onPressed: controller.isResending.value ? null : _resend,
                    child: Text(
                      controller.isResending.value ? 'Envoi en cours...' : 'Renvoyer le code',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: colorPrimary100,
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 12),

                AuthBottomLink(
                  actionText: 'Retour à la connexion',
                  onTap: () => context.go(MyRoute.signInScreen),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
