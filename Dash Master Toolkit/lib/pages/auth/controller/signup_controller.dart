import 'package:flutter/material.dart';
import 'package:get/get.dart';

class SignupController extends GetxController {
  TextEditingController fullNameController = TextEditingController();
  TextEditingController emailController = TextEditingController();
  TextEditingController passwordController = TextEditingController();
  TextEditingController confirmPasswordController = TextEditingController();
  RxBool isTermAccepted = false.obs;

  FocusNode f1 = FocusNode();
  FocusNode f2 = FocusNode();
  FocusNode f3 = FocusNode();
  FocusNode f4 = FocusNode();

  final formKey = GlobalKey<FormState>();
  final fullNameFieldFocused = false.obs;
  final emailFieldFocused = false.obs;
  final passwordFieldFocused = false.obs;
  final confirmPasswordFieldFocused = false.obs;

  RxBool isShowPasswordIcon = true.obs;
  RxBool isShowConfirmPasswordIcon = true.obs;

  @override
  void onInit() {
    super.onInit();

    // Champs vides par défaut — seuls les placeholders sont visibles avant
    // saisie (voir sign_up_screen.dart).
    f1.addListener(() => fullNameFieldFocused.value = f1.hasFocus);
    f2.addListener(() => emailFieldFocused.value = f2.hasFocus);
    f3.addListener(() => passwordFieldFocused.value = f3.hasFocus);
    f4.addListener(() => confirmPasswordFieldFocused.value = f4.hasFocus);
  }
}
