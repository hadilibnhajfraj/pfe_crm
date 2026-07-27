import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/pages/auth/controller/forgot_password_controller.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

import '../../../application/common/safe_snack.dart';
import '../../../providers/auth_service.dart';
import '../../../route/my_route.dart';
import '../../../utils/validation.dart';
import '../widgets/auth_ui_kit.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ForgotPasswordScreenState createState() => ForgotPasswordScreenState();
}

class ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  ForgotPasswordController controller = ForgotPasswordController();
  final AuthService _authService = AuthService();

  // Get.snackbar() plante sur Flutter Web ici : l'app utilise MaterialApp.router
  // (pas GetMaterialApp), donc GetX n'a pas d'overlay/navigator enregistré et son
  // SnackbarController échoue sur un null-check interne. SafeSnack (déjà utilisé
  // ailleurs dans l'app) passe par le scaffoldMessengerKey global de main.dart et
  // ne plante jamais : il no-op silencieusement si le messenger n'est pas encore prêt.
  Future<void> _forgotPassword() async {
    if (controller.formKey.currentState?.validate() ?? false) {
      try {
        final res =
            await _authService.forgotPassword(email: controller.emailController.text);
        final message = (res['message'] is String && (res['message'] as String).isNotEmpty)
            ? res['message'] as String
            : AppLocalizations.of(context).translate(
                "Si un compte est associé à cette adresse email, un lien de réinitialisation vient d'être envoyé.");
        SafeSnack.show('Succès', message, context: context);
      } catch (e) {
        SafeSnack.show(
          'Erreur',
          e.toString().replaceFirst('Exception: ', ''),
          isError: true,
          context: context,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return GetBuilder<ForgotPasswordController>(
      init: controller,
      tag: 'forgot_password',
      builder: (controller) {
        return AuthScaffold(
          child: Form(
            key: controller.formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const AuthTitle(
                  title: 'Mot de passe oublié',
                  subtitle:
                      'Entrez votre adresse email pour recevoir un lien de réinitialisation.',
                ),

                const SizedBox(height: 36),

                Obx(
                  () => AuthTextField(
                    controller: controller.emailController,
                    focusNode: controller.f1,
                    placeholder: 'Adresse email',
                    icon: Icons.mail_outline_rounded,
                    isFocused: controller.emailFieldIsFocused.value,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.done,
                    validator: (value) => validateEmail(value, context),
                    onChanged: (value) => controller.emailFieldFocused.value = true,
                    autovalidateMode: controller.emailFieldFocused.value
                        ? AutovalidateMode.onUserInteraction
                        : AutovalidateMode.disabled,
                    onFieldSubmitted: (_) => _forgotPassword(),
                  ),
                ),

                const SizedBox(height: 32),

                AuthGradientButton(
                  label: 'Envoyer le lien de réinitialisation',
                  onPressed: _forgotPassword,
                ),

                const SizedBox(height: 28),

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
