import 'package:flutter/material.dart';
import 'package:get/get.dart';

class ForgotPasswordController extends GetxController {
  TextEditingController emailController = TextEditingController();

  FocusNode f1 = FocusNode();

  final formKey = GlobalKey<FormState>();

  // Passe à true dès la première saisie — déclenche l'autovalidate du champ
  // (logique existante, inchangée).
  final emailFieldFocused = false.obs;

  // Distinct de emailFieldFocused ci-dessus (qui reste true une fois la
  // saisie commencée) — reflète l'état focus/non-focus réel du champ pour
  // colorer l'icône comme sur les autres pages d'authentification.
  final emailFieldIsFocused = false.obs;

  @override
  void onInit() {
    super.onInit();

    // Champ vide par défaut — seul le placeholder est visible avant saisie
    // (voir forgot_password_screen.dart).
    f1.addListener(() => emailFieldIsFocused.value = f1.hasFocus);
  }
}
