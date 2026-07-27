import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/constant/app_color.dart';
import 'package:dash_master_toolkit/pages/auth/controller/reset_password_controller.dart';

import '../../../application/common/safe_snack.dart';
import '../../../route/my_route.dart';
import '../widgets/auth_ui_kit.dart';

class ResetPasswordScreen extends StatefulWidget {
  final String? email;
  final String? token;

  const ResetPasswordScreen({super.key, this.email, this.token});

  @override
  ResetPasswordScreenState createState() => ResetPasswordScreenState();
}

class ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final ResetPasswordController controller = ResetPasswordController();

  @override
  void initState() {
    super.initState();
    controller.init(email: widget.email, token: widget.token);
  }

  // Get.snackbar() n'est volontairement pas utilisé ici : l'app tourne sur
  // MaterialApp.router (pas GetMaterialApp), ce qui fait planter GetX sur
  // Flutter Web (null-check interne au SnackbarController). SafeSnack
  // (scaffoldMessengerKey global, voir main.dart) est le mécanisme sûr déjà
  // utilisé ailleurs dans l'app.
  Future<void> _submit() async {
    final error = await controller.submit();
    if (error != null) {
      SafeSnack.show('Erreur', error, isError: true, context: context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return GetBuilder<ResetPasswordController>(
      init: controller,
      tag: 'reset_password',
      builder: (controller) {
        return AuthScaffold(
          child: Obx(() {
            switch (controller.status.value) {
              case ResetPageStatus.checking:
                return const _CheckingLinkView();
              case ResetPageStatus.missingParams:
              case ResetPageStatus.invalid:
                return _LinkProblemView(
                  title: 'Lien invalide',
                  message:
                      'Ce lien de réinitialisation est invalide ou a déjà été utilisé.',
                );
              case ResetPageStatus.expired:
                return _LinkProblemView(
                  title: 'Ce lien a expiré',
                  message: 'Demandez un nouveau lien de réinitialisation.',
                );
              case ResetPageStatus.valid:
                return _ResetFormView(controller: controller, onSubmit: _submit);
              case ResetPageStatus.success:
                return const _SuccessView();
            }
          }),
        );
      },
    );
  }
}

class _CheckingLinkView extends StatelessWidget {
  const _CheckingLinkView();

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 12),
        CircularProgressIndicator(color: colorPrimary100),
        const SizedBox(height: 24),
        const Text(
          'Vérification du lien...',
          style: TextStyle(fontSize: 14, color: Color(0xFF64748B), fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 12),
      ],
    );
  }
}

class _LinkProblemView extends StatelessWidget {
  final String title;
  final String message;

  const _LinkProblemView({required this.title, required this.message});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: colorError0,
            borderRadius: BorderRadius.circular(18),
          ),
          child: Icon(Icons.link_off_rounded, color: colorError100, size: 30),
        ),
        const SizedBox(height: 24),
        AuthTitle(title: title, subtitle: message),
        const SizedBox(height: 32),
        AuthGradientButton(
          label: 'Demander un nouveau lien',
          onPressed: () => context.go(MyRoute.forgotPasswordScreen),
        ),
        const SizedBox(height: 24),
        AuthBottomLink(
          actionText: 'Retour à la connexion',
          onTap: () => context.go(MyRoute.signInScreen),
        ),
      ],
    );
  }
}

class _SuccessView extends StatelessWidget {
  const _SuccessView();

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: colorSuccess0,
            borderRadius: BorderRadius.circular(18),
          ),
          child: Icon(Icons.check_rounded, color: colorSuccess100, size: 32),
        ),
        const SizedBox(height: 24),
        const AuthTitle(
          title: 'Mot de passe modifié',
          subtitle: 'Votre mot de passe a été modifié avec succès.',
        ),
        const SizedBox(height: 32),
        AuthGradientButton(
          label: 'Se connecter',
          onPressed: () => context.go(MyRoute.signInScreen),
        ),
      ],
    );
  }
}

class _ResetFormView extends StatelessWidget {
  final ResetPasswordController controller;
  final VoidCallback onSubmit;

  const _ResetFormView({required this.controller, required this.onSubmit});

  @override
  Widget build(BuildContext context) {
    return Form(
      key: controller.formKey,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const AuthTitle(
            title: 'Créer un nouveau mot de passe',
            subtitle: 'Choisissez un mot de passe fort pour sécuriser votre compte.',
          ),

          const SizedBox(height: 36),

          Obx(
            () => AuthTextField(
              controller: controller.passwordController,
              focusNode: controller.f1,
              placeholder: 'Nouveau mot de passe',
              icon: Icons.lock_outline_rounded,
              isFocused: controller.passwordFieldIsFocused.value,
              isPassword: controller.isShowPasswordIcon.value,
              textInputAction: TextInputAction.next,
              validator: controller.validateNewPassword,
              autovalidateMode: AutovalidateMode.onUserInteraction,
              onFieldSubmitted: (_) =>
                  FocusScope.of(context).requestFocus(controller.f2),
              suffixIcon: IconButton(
                icon: Icon(
                  controller.isShowPasswordIcon.value
                      ? Icons.visibility_off_outlined
                      : Icons.visibility_outlined,
                  size: 20,
                  color: controller.passwordFieldIsFocused.value
                      ? colorPrimary100
                      : kAuthFieldGrey,
                ),
                onPressed: () => controller.isShowPasswordIcon.toggle(),
              ),
            ),
          ),

          const SizedBox(height: 16),

          Obx(() => _StrengthGauge(score: controller.strengthScore)),

          const SizedBox(height: 14),

          Obx(
            () => _PasswordRulesChecklist(
              hasMinLength: controller.hasMinLength,
              hasUppercase: controller.hasUppercase,
              hasLowercase: controller.hasLowercase,
              hasDigit: controller.hasDigit,
              hasSpecialChar: controller.hasSpecialChar,
            ),
          ),

          const SizedBox(height: 20),

          Obx(
            () => AuthTextField(
              controller: controller.confirmPasswordController,
              focusNode: controller.f2,
              placeholder: 'Confirmer le mot de passe',
              icon: Icons.lock_outline_rounded,
              isFocused: controller.confirmPasswordFieldIsFocused.value,
              isPassword: controller.isShowConfirmPasswordIcon.value,
              textInputAction: TextInputAction.done,
              validator: controller.validateConfirm,
              autovalidateMode: AutovalidateMode.onUserInteraction,
              onFieldSubmitted: (_) => onSubmit(),
              suffixIcon: IconButton(
                icon: Icon(
                  controller.isShowConfirmPasswordIcon.value
                      ? Icons.visibility_off_outlined
                      : Icons.visibility_outlined,
                  size: 20,
                  color: controller.confirmPasswordFieldIsFocused.value
                      ? colorPrimary100
                      : kAuthFieldGrey,
                ),
                onPressed: () => controller.isShowConfirmPasswordIcon.toggle(),
              ),
            ),
          ),

          const SizedBox(height: 32),

          Obx(
            () => controller.isSubmitting.value
                ? SizedBox(
                    height: 52,
                    child: Center(
                      child: CircularProgressIndicator(color: colorPrimary100),
                    ),
                  )
                : AuthGradientButton(
                    label: 'Réinitialiser le mot de passe',
                    onPressed: onSubmit,
                  ),
          ),

          const SizedBox(height: 28),

          AuthBottomLink(
            actionText: 'Retour à la connexion',
            onTap: () => context.go(MyRoute.signInScreen),
          ),
        ],
      ),
    );
  }
}

/// Une ligne de la checklist des règles de complexité — coche verte si la
/// règle est respectée, cercle gris sinon.
class _PasswordRulesChecklist extends StatelessWidget {
  final bool hasMinLength;
  final bool hasUppercase;
  final bool hasLowercase;
  final bool hasDigit;
  final bool hasSpecialChar;

  const _PasswordRulesChecklist({
    required this.hasMinLength,
    required this.hasUppercase,
    required this.hasLowercase,
    required this.hasDigit,
    required this.hasSpecialChar,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Wrap(
        spacing: 16,
        runSpacing: 8,
        children: [
          _RuleItem(label: '8 caractères minimum', ok: hasMinLength),
          _RuleItem(label: '1 majuscule', ok: hasUppercase),
          _RuleItem(label: '1 minuscule', ok: hasLowercase),
          _RuleItem(label: '1 chiffre', ok: hasDigit),
          _RuleItem(label: '1 caractère spécial', ok: hasSpecialChar),
        ],
      ),
    );
  }
}

class _RuleItem extends StatelessWidget {
  final String label;
  final bool ok;

  const _RuleItem({required this.label, required this.ok});

  @override
  Widget build(BuildContext context) {
    final color = ok ? colorSuccess100 : kAuthFieldGrey;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          ok ? Icons.check_circle_rounded : Icons.circle_outlined,
          size: 15,
          color: color,
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: ok ? const Color(0xFF334155) : kAuthFieldGrey,
          ),
        ),
      ],
    );
  }
}

/// Jauge de sécurité — 5 segments, remplis/colorés selon le nombre de règles
/// respectées (0 à 5).
class _StrengthGauge extends StatelessWidget {
  final int score;

  const _StrengthGauge({required this.score});

  _StrengthMeta get _meta {
    switch (score) {
      case 0:
      case 1:
        return _StrengthMeta('Très faible', colorError100);
      case 2:
        return _StrengthMeta('Faible', colorError100);
      case 3:
        return _StrengthMeta('Moyen', colorWarning100);
      case 4:
        return _StrengthMeta('Fort', colorPrimary100);
      default:
        return _StrengthMeta('Très fort', colorSuccess100);
    }
  }

  @override
  Widget build(BuildContext context) {
    final meta = _meta;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: List.generate(5, (i) {
            final filled = i < score;
            return Expanded(
              child: Container(
                margin: EdgeInsets.only(right: i == 4 ? 0 : 4),
                height: 5,
                decoration: BoxDecoration(
                  color: filled ? meta.color : const Color(0xFFE2E8F0),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            );
          }),
        ),
        const SizedBox(height: 6),
        Text(
          score == 0 ? 'Sécurité du mot de passe' : meta.label,
          style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: meta.color),
        ),
      ],
    );
  }
}

class _StrengthMeta {
  final String label;
  final Color color;
  const _StrengthMeta(this.label, this.color);
}
