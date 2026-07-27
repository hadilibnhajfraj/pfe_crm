import 'package:flutter/material.dart';
import 'package:get/get.dart';

class SignInController extends GetxController {
  TextEditingController userNameController = TextEditingController();
  TextEditingController passwordController = TextEditingController();
  RxBool rememberMe = false.obs;

  FocusNode f1 = FocusNode();
  FocusNode f2 = FocusNode();

  final formKey = GlobalKey<FormState>();
  final userNameFieldFocused = false.obs;
  final passwordFieldFocused = false.obs;

  RxBool isShowPasswordIcon = true.obs;

  @override
  void onInit() {
    super.onInit();

    // Champs vides par défaut — seuls les placeholders sont visibles avant
    // saisie (voir sign_in_screen.dart).
    f1.addListener(() => userNameFieldFocused.value = f1.hasFocus);
    f2.addListener(() => passwordFieldFocused.value = f2.hasFocus);
  }
}
