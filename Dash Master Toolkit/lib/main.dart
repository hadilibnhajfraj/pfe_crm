import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'package:dash_master_toolkit/providers/language_provider.dart';
import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:get/get.dart';
import 'package:get_storage/get_storage.dart';
import 'package:provider/provider.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

import 'application/common/safe_snack.dart';
import 'constant/breakpoint.dart';
import 'localization/app_localizations.dart';
import 'theme/styles.dart';
import 'theme/theme_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Prevent google_fonts from fetching fonts at runtime on Flutter Web —
  // runtime fetching triggers an AssetManifest.json lookup that fails on web.
  // All Inter text uses the bundled InterTight font via tInter() instead.
  GoogleFonts.config.allowRuntimeFetching = false;
  await GetStorage.init();

  // ✅ Restore session BEFORE runApp (keep logged in up to 7 days)
  await AuthService().restoreSession();
   // 🔥 AJOUT OBLIGATOIRE
  Get.put(AuthService());
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AppLanguageProvider()),
        ChangeNotifierProvider(create: (_) => AuthService()),
      ],
      child: const MyApp(),
    ),
  );
}

class MyApp extends StatefulWidget {
  const MyApp({super.key});
  @override
  MyAppState createState() => MyAppState();
}

class MyAppState extends State<MyApp> {
  final ThemeController controller =
      Get.isRegistered<ThemeController>() ? Get.find() : Get.put(ThemeController());

  @override
  Widget build(BuildContext context) {
    final appLanguage = Provider.of<AppLanguageProvider>(context);

    SystemChrome.setSystemUIOverlayStyle(
      SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarBrightness: controller.isDarkMode ? Brightness.dark : Brightness.light,
        statusBarIconBrightness: controller.isDarkMode ? Brightness.light : Brightness.dark,
      ),
    );

    return Obx(() {
      return rf.ResponsiveBreakpoints.builder(
        breakpoints: [
          rf.Breakpoint(start: BreakpointName.XS.start, end: BreakpointName.XS.end, name: BreakpointName.XS.name),
          rf.Breakpoint(start: BreakpointName.SM.start, end: BreakpointName.SM.end, name: BreakpointName.SM.name),
          rf.Breakpoint(start: BreakpointName.MD.start, end: BreakpointName.MD.end, name: BreakpointName.MD.name),
          rf.Breakpoint(start: BreakpointName.LG.start, end: BreakpointName.LG.end, name: BreakpointName.LG.name),
          rf.Breakpoint(start: BreakpointName.XL.start, end: BreakpointName.XL.end, name: BreakpointName.XL.name),
        ],
        child: MaterialApp.router(
          debugShowCheckedModeBanner: false,
          theme: controller.isDarkMode ? Styles.darkTheme : Styles.lightTheme,
          routerConfig: MyRoute.router,

          // ✅ FIX snackbar crash
          scaffoldMessengerKey: SafeSnack.messengerKey,

          locale: appLanguage.currentLocale,
          supportedLocales: appLanguage.locales.values.toList(),
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          builder: (context, child) {
            return MediaQuery(
              data: MediaQuery.of(context).copyWith(textScaler: const TextScaler.linear(1.0)),
              child: Directionality(
                textDirection: appLanguage.isRTL ? TextDirection.rtl : TextDirection.ltr,
                child: child ?? const SizedBox.shrink(),
              ),
            );
          },
        ),
      );
    });
  }
}
