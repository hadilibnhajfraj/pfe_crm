
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';

import '../constant/app_color.dart';

abstract class Styles {
  //colors

  static const String fontFamily = 'InterTight';

  static ThemeData createTheme(ColorScheme colorScheme) {
    if (Get.isDarkMode) {
      return darkTheme.copyWith(
        colorScheme: colorScheme,
      );
    }
    return lightTheme.copyWith(colorScheme: colorScheme);
  }

  static ThemeData baseTheme = ThemeData.light();
  static TextTheme lightTextTheme = getTextTheme(baseTheme.textTheme, false);
  static TextTheme darkTextTheme = getTextTheme(baseTheme.textTheme, true);

  static TextTheme getTextTheme(TextTheme baseTextTheme, bool isDarkMode) {
    // var fontFamily =GoogleFonts.poppins().fontFamily;
    return baseTextTheme.copyWith(
      displayLarge: baseTextTheme.displayLarge?.copyWith(
          fontFamily: fontFamily,
          color: isDarkMode ? colorWhite : colorGrey900),
      displayMedium: baseTextTheme.displayMedium?.copyWith(
          fontFamily: fontFamily,
          color: isDarkMode ? colorWhite : colorGrey900),
      displaySmall: baseTextTheme.displaySmall?.copyWith(
          fontFamily: fontFamily,
          color: isDarkMode ? colorWhite : colorGrey900),
      headlineLarge: baseTextTheme.headlineLarge?.copyWith(
          fontFamily: fontFamily,
          color: isDarkMode ? colorWhite : colorGrey900),
      headlineMedium: baseTextTheme.headlineMedium?.copyWith(
          fontFamily: fontFamily,
          color: isDarkMode ? colorWhite : colorGrey900),
      headlineSmall: baseTextTheme.headlineSmall?.copyWith(
          fontFamily: fontFamily,
          color: isDarkMode ? colorWhite : colorGrey900),
      titleLarge: baseTextTheme.titleLarge?.copyWith(
          fontFamily: fontFamily,
          color: isDarkMode ? colorWhite : colorGrey900),
      titleMedium: baseTextTheme.titleMedium?.copyWith(
          fontFamily: fontFamily,
          color: isDarkMode ? colorWhite : colorGrey900),
      titleSmall: baseTextTheme.titleSmall?.copyWith(
          fontFamily: fontFamily,
          color: isDarkMode ? colorWhite : colorGrey900),
      bodyLarge: baseTextTheme.bodyLarge?.copyWith(
          fontFamily: fontFamily,
          color: isDarkMode ? colorWhite : colorGrey900),
      bodyMedium: baseTextTheme.bodyMedium?.copyWith(
          fontFamily: fontFamily,
          color: isDarkMode ? colorWhite : colorGrey900),
      bodySmall: baseTextTheme.bodySmall?.copyWith(
          fontFamily: fontFamily,
          color: isDarkMode ? colorWhite : colorGrey900),
      labelLarge: baseTextTheme.labelLarge?.copyWith(
          fontFamily: fontFamily,
          color: isDarkMode ? colorWhite : colorGrey900),
      labelMedium: baseTextTheme.labelMedium?.copyWith(
          fontFamily: fontFamily,
          color: isDarkMode ? colorWhite : colorGrey900),
      labelSmall: baseTextTheme.labelSmall?.copyWith(
          fontFamily: fontFamily,
          color: isDarkMode ? colorWhite : colorGrey900),
    );
  }

  static final ThemeData lightTheme = ThemeData(
          splashColor: Colors.transparent,
          // Removes the splash color
          highlightColor: Colors.transparent,
          // Removes the highlight color
          brightness: Brightness.light,
          scaffoldBackgroundColor: colorWhite,
          primaryColor: colorPrimary300,
          primaryColorDark: colorPrimary300,
          hoverColor: Colors.white54,
          dividerColor: colorGrey100,
          fontFamily: fontFamily,
          bottomNavigationBarTheme:
              BottomNavigationBarThemeData(backgroundColor: colorWhite),
          appBarTheme: AppBarTheme(
            actionsIconTheme: IconThemeData(color: colorWhite),
            backgroundColor: colorWhite,
            // color: colorWhite,
            iconTheme: IconThemeData(color: colorGrey900),
            systemOverlayStyle: SystemUiOverlayStyle(
              statusBarColor: Colors.transparent,
              statusBarBrightness: Brightness.light,
              statusBarIconBrightness: Brightness.dark,
            ),
          ),
          textSelectionTheme: const TextSelectionThemeData(
              cursorColor: Colors.black,
              selectionHandleColor: Colors.black,
              selectionColor: Colors.green),
          colorScheme: ColorScheme.light(
  primary: colorPrimary300,   // ✅ ton bleu
  onPrimary: Colors.white,
  surface: colorWhite,
  onSurface: colorGrey900,
),
          cardTheme: const CardThemeData().copyWith(color: colorWhite),
datePickerTheme: DatePickerThemeData(
  backgroundColor: Color(0xFFEAF0FF), // kPickerCardBg
  surfaceTintColor: Colors.transparent,
),

timePickerTheme:  TimePickerThemeData(
  backgroundColor: Color(0xFFEAF0FF), // kPickerCardBg
  dialHandColor: colorPrimary300,
  dialBackgroundColor: Color(0xFFEAF0FF),
  entryModeIconColor: colorPrimary300,
),
          cardColor: colorWhite,
          iconTheme: IconThemeData(color: colorGrey900),
          bottomSheetTheme: BottomSheetThemeData(backgroundColor: colorWhite),
          textTheme: lightTextTheme,
          visualDensity: VisualDensity.adaptivePlatformDensity,
          popupMenuTheme: PopupMenuThemeData(color: colorWhite))
      .copyWith(
    pageTransitionsTheme: const PageTransitionsTheme(
        builders: <TargetPlatform, PageTransitionsBuilder>{
          TargetPlatform.android: OpenUpwardsPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.linux: OpenUpwardsPageTransitionsBuilder(),
          TargetPlatform.macOS: OpenUpwardsPageTransitionsBuilder(),
        }),
  );

  static final ThemeData darkTheme = ThemeData(
    splashColor: Colors.transparent,
    // Removes the splash color
    highlightColor: Colors.transparent,
    // Removes the highlight color
    brightness: Brightness.dark,
    scaffoldBackgroundColor: colorGrey900,
    bottomNavigationBarTheme:
        BottomNavigationBarThemeData(backgroundColor: colorGrey900),
    appBarTheme: AppBarTheme(
      actionsIconTheme: IconThemeData(color: colorWhite),
      titleTextStyle: const TextStyle(color: Colors.white),
      backgroundColor: colorGrey900,
      iconTheme: IconThemeData(color: colorWhite),
      systemOverlayStyle: const SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarBrightness: Brightness.dark,
          statusBarIconBrightness: Brightness.light),
    ),
    primaryColor: colorGrey900,
    dividerColor: colorGrey700,
    primaryColorDark: colorGrey900,
    textSelectionTheme: const TextSelectionThemeData(
        cursorColor: Colors.white,
        selectionColor: Colors.green,
        selectionHandleColor: Colors.white),
    hoverColor: Colors.black12,
    fontFamily: fontFamily,
    bottomSheetTheme: BottomSheetThemeData(backgroundColor: colorGrey900),
    cardTheme: CardThemeData(color: colorGrey500),

    cardColor: colorGrey800,
    iconTheme: IconThemeData(color: colorWhite),
    textTheme: darkTextTheme,
    popupMenuTheme: PopupMenuThemeData(color: colorGrey900),
    visualDensity: VisualDensity.adaptivePlatformDensity,
    colorScheme:
        ColorScheme.dark(primary: colorGrey500, onPrimary: colorGrey800)
            .copyWith(secondary: colorWhite),
  ).copyWith(
    pageTransitionsTheme: const PageTransitionsTheme(
        builders: <TargetPlatform, PageTransitionsBuilder>{
          TargetPlatform.android: OpenUpwardsPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.linux: OpenUpwardsPageTransitionsBuilder(),
          TargetPlatform.macOS: OpenUpwardsPageTransitionsBuilder(),
        }),
  );
}
