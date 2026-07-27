import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/constant/app_color.dart';

import '../../../providers/auth_service.dart';
import '../../../route/my_route.dart';
import '../controller/signup_controller.dart';
import '../widgets/auth_ui_kit.dart';

class SignUpScreen extends StatefulWidget {
  const SignUpScreen({super.key});

  @override
  State<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends State<SignUpScreen> {
  final SignupController controller = SignupController();

  // Logique d'inscription inchangée (authService.signup avec email/password,
  // puis redirection vers l'écran de connexion) — seules deux vérifications
  // côté formulaire encadrent l'appel : conditions acceptées (déjà présente
  // avant) et les deux mots de passe qui doivent correspondre (nécessaire au
  // nouveau champ "Confirmer le mot de passe").
  Future<void> _handleSignUp(BuildContext context) async {
    final form = controller.formKey.currentState;
    if (form == null || !form.validate()) return;

    if (!controller.isTermAccepted.value) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Veuillez accepter les conditions d'utilisation")),
      );
      return;
    }

    try {
      final authService = AuthService();

      await authService.signup(
        email: controller.emailController.text,
        password: controller.passwordController.text,
      );

      if (!context.mounted) return;
      context.go(MyRoute.signInScreen);
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return GetBuilder<SignupController>(
      init: controller,
      builder: (controller) {
        return AuthScaffold(
          child: Form(
            key: controller.formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const AuthTitle(
                  title: 'Créer un compte',
                  subtitle: 'Créez votre compte Probar CRM',
                ),

                const SizedBox(height: 36),

                // ── Champs ────────────────────────────────
                Obx(
                  () => AuthTextField(
                    controller: controller.fullNameController,
                    focusNode: controller.f1,
                    placeholder: 'Nom complet',
                    icon: Icons.person_outline_rounded,
                    isFocused: controller.fullNameFieldFocused.value,
                    textInputAction: TextInputAction.next,
                    onFieldSubmitted: (_) =>
                        FocusScope.of(context).requestFocus(controller.f2),
                  ),
                ),

                const SizedBox(height: 20),

                Obx(
                  () => AuthTextField(
                    controller: controller.emailController,
                    focusNode: controller.f2,
                    placeholder: 'Adresse email',
                    icon: Icons.mail_outline_rounded,
                    isFocused: controller.emailFieldFocused.value,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    onFieldSubmitted: (_) =>
                        FocusScope.of(context).requestFocus(controller.f3),
                  ),
                ),

                const SizedBox(height: 20),

                Obx(
                  () => AuthTextField(
                    controller: controller.passwordController,
                    focusNode: controller.f3,
                    placeholder: 'Mot de passe',
                    icon: Icons.lock_outline_rounded,
                    isFocused: controller.passwordFieldFocused.value,
                    isPassword: controller.isShowPasswordIcon.value,
                    textInputAction: TextInputAction.next,
                    onFieldSubmitted: (_) =>
                        FocusScope.of(context).requestFocus(controller.f4),
                    suffixIcon: IconButton(
                      icon: Icon(
                        controller.isShowPasswordIcon.value
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined,
                        size: 20,
                        color: controller.passwordFieldFocused.value
                            ? colorPrimary100
                            : kAuthFieldGrey,
                      ),
                      onPressed: () => controller.isShowPasswordIcon.toggle(),
                    ),
                  ),
                ),

                const SizedBox(height: 20),

                Obx(
                  () => AuthTextField(
                    controller: controller.confirmPasswordController,
                    focusNode: controller.f4,
                    placeholder: 'Confirmer le mot de passe',
                    icon: Icons.lock_outline_rounded,
                    isFocused: controller.confirmPasswordFieldFocused.value,
                    isPassword: controller.isShowConfirmPasswordIcon.value,
                    textInputAction: TextInputAction.done,
                    onFieldSubmitted: (_) => _handleSignUp(context),
                    validator: (value) => value != controller.passwordController.text
                        ? 'Les mots de passe ne correspondent pas'
                        : null,
                    suffixIcon: IconButton(
                      icon: Icon(
                        controller.isShowConfirmPasswordIcon.value
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined,
                        size: 20,
                        color: controller.confirmPasswordFieldFocused.value
                            ? colorPrimary100
                            : kAuthFieldGrey,
                      ),
                      onPressed: () => controller.isShowConfirmPasswordIcon.toggle(),
                    ),
                  ),
                ),

                const SizedBox(height: 28),

                // ── Conditions d'utilisation ──────────────
                Align(
                  alignment: Alignment.centerLeft,
                  child: Obx(
                    () => AuthCheckboxRow(
                      value: controller.isTermAccepted.value,
                      onChanged: (v) => controller.isTermAccepted.value = v ?? false,
                      label: "J'accepte les conditions d'utilisation",
                    ),
                  ),
                ),

                const SizedBox(height: 32),

                // ── Bouton ────────────────────────────────
                AuthGradientButton(
                  label: 'Créer un compte',
                  onPressed: () => _handleSignUp(context),
                ),

                const SizedBox(height: 28),

                AuthBottomLink(
                  prefix: 'Vous avez déjà un compte ?',
                  actionText: 'Se connecter',
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
