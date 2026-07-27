import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/constant/app_color.dart';
import 'package:dash_master_toolkit/pages/auth/controller/sign_in_controller.dart';

import '../../../providers/auth_service.dart';
import '../../../route/my_route.dart';
import '../widgets/auth_ui_kit.dart';
import '../widgets/commercial_profile_dialog.dart';

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  SignInScreenState createState() => SignInScreenState();
}

class SignInScreenState extends State<SignInScreen> {
  final SignInController controller = SignInController();

  // Logique de connexion inchangée (voir authService.signin / dialog
  // commercial / triggerRefresh) — factorisée ici pour être déclenchée à la
  // fois par le bouton et par la validation du champ mot de passe.
  Future<void> _handleSignIn(BuildContext context) async {
    if (!controller.formKey.currentState!.validate()) return;
    try {
      final authService = AuthService();

      // silentNotify=true : GoRouter ne redirige
      // pas encore — on garde la main pour
      // afficher le dialog si besoin.
      await authService.signin(
        email: controller.userNameController.text,
        password: controller.passwordController.text,
        silentNotify: true,
      );

      final email = (authService.userEmail ?? '').toLowerCase();
      print('ROLE = ${authService.userRole}');

      // Dialog commercial uniquement pour
      // @probardistribution.com, et uniquement
      // si le widget est encore affiché.
      if (email.endsWith('@probardistribution.com') && context.mounted) {
        await showCommercialProfileDialog(context);
      }

      // triggerRefresh déclenche le redirect
      // GoRouter → dashboard selon le rôle.
      // Appelé dans tous les cas (même si
      // context n'est plus monté).
      authService.triggerRefresh();
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return GetBuilder<SignInController>(
      init: controller,
      tag: 'sign_in',
      builder: (controller) {
        return AuthScaffold(
          child: Form(
            key: controller.formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const AuthTitle(
                  title: 'Bienvenue',
                  subtitle: 'Connectez-vous à votre espace CRM',
                ),

                const SizedBox(height: 36),

                // ── Champs ────────────────────────────────
                Obx(
                  () => AuthTextField(
                    controller: controller.userNameController,
                    focusNode: controller.f1,
                    placeholder: 'Adresse email',
                    icon: Icons.mail_outline_rounded,
                    isFocused: controller.userNameFieldFocused.value,
                    textInputAction: TextInputAction.next,
                    onFieldSubmitted: (_) =>
                        FocusScope.of(context).requestFocus(controller.f2),
                  ),
                ),

                const SizedBox(height: 20),

                Obx(
                  () => AuthTextField(
                    controller: controller.passwordController,
                    focusNode: controller.f2,
                    placeholder: 'Mot de passe',
                    icon: Icons.lock_outline_rounded,
                    isFocused: controller.passwordFieldFocused.value,
                    isPassword: controller.isShowPasswordIcon.value,
                    textInputAction: TextInputAction.done,
                    onFieldSubmitted: (_) => _handleSignIn(context),
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

                const SizedBox(height: 28),

                // ── Options ───────────────────────────────
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Obx(
                      () => AuthCheckboxRow(
                        value: controller.rememberMe.value,
                        onChanged: (v) => controller.rememberMe.value = v ?? false,
                        label: 'Se souvenir de moi',
                      ),
                    ),
                    TextButton(
                      style: TextButton.styleFrom(
                        padding: EdgeInsets.zero,
                        minimumSize: const Size(0, 0),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      onPressed: () => context.go(MyRoute.forgotPasswordScreen),
                      child: Text(
                        'Mot de passe oublié ?',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: colorPrimary100,
                        ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 32),

                // ── Bouton ────────────────────────────────
                AuthGradientButton(
                  label: 'Se connecter',
                  onPressed: () => _handleSignIn(context),
                ),

                const SizedBox(height: 28),

                AuthBottomLink(
                  prefix: 'Pas encore de compte ?',
                  actionText: 'Créer un compte',
                  onTap: () => context.go(MyRoute.signUpScreen),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
