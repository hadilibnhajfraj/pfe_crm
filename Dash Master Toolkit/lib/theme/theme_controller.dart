import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:get_storage/get_storage.dart';

class ThemeController extends GetxController {
  final _isDarkMode = false.obs;

  bool get isDarkMode => _isDarkMode.value;

  @override
  void onInit() {
    _loadTheme();
    updateSystemUiOverlayStyle();
    super.onInit();
  }

  void _loadTheme() async {
    final box = GetStorage();
    if (box.hasData('isDarkMode')) {
      _isDarkMode.value = box.read('isDarkMode');
    }
  }

  void toggleTheme() {
    _isDarkMode.value = !_isDarkMode.value;
    final box = GetStorage();
    box.write('isDarkMode', _isDarkMode.value);
    updateSystemUiOverlayStyle();
    Get.forceAppUpdate();
    // print("AAAAAAAAAA ${box.read('isDarkMode')}");
    // update();
  }

  void updateSystemUiOverlayStyle() {
    SystemUiOverlayStyle systemUiOverlayStyle = _isDarkMode.value
        ? SystemUiOverlayStyle.dark.copyWith(
            statusBarColor: Colors.transparent,
            statusBarIconBrightness: Brightness.light,
            statusBarBrightness: Brightness.dark,
          )
        : SystemUiOverlayStyle.light.copyWith(
            statusBarColor: Colors.transparent,
            statusBarIconBrightness: Brightness.dark,
            statusBarBrightness: Brightness.light,
          );

    SystemChrome.setSystemUIOverlayStyle(systemUiOverlayStyle);
  }
}
