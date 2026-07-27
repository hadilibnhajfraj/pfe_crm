import 'package:flutter/material.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class SafeSnack {
  static final messengerKey = GlobalKey<ScaffoldMessengerState>();

  // `context` est optionnel (le messenger global n'en a pas besoin pour
  // s'afficher) mais permet de traduire `title` — passé par les appelants
  // qui ont un BuildContext sous la main (la plupart des cas).
  static void show(String title, String message, {bool isError = false, BuildContext? context}) {
    final messenger = messengerKey.currentState;
    if (messenger == null) return;

    final translatedTitle = context != null ? AppLocalizations.of(context).translate(title) : title;

    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        content: Text('$translatedTitle: $message'),
        behavior: SnackBarBehavior.floating,
        showCloseIcon: true,
        backgroundColor: isError ? Colors.red : Colors.green,
        duration: const Duration(seconds: 3),
      ),
    );
  }
}
