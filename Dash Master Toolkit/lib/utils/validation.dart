import 'package:flutter/cupertino.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

String? validatePhoneNumber(String phoneNumber, BuildContext context) {
  const int minDigits = 7;
  const int maxDigits = 15;

  final String numericPhoneNumber = phoneNumber.replaceAll(RegExp(r'\D'), '');
  final int phoneNumberLength = numericPhoneNumber.length;

  if (phoneNumberLength == 0) {
    return AppLocalizations.of(context).translate("phoneNumberIsRequired");
  }
  if (phoneNumberLength < minDigits) {
    return AppLocalizations.of(context).translate("phoneNumberIsTooShort");
  }
  if (phoneNumberLength > maxDigits) {
    return AppLocalizations.of(context).translate("phoneNumberIsTooLong");
  }

  return null;
}

String? validateEmail(String? value, BuildContext context) {
  final v = (value ?? '').trim();
  if (v.isEmpty) {
    return AppLocalizations.of(context).translate("emailIsRequired");
  }

  // ✅ Regex email robuste (accepte - dans domaine, sous-domaines, etc.)
  final emailOk = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(v);
  if (!emailOk) {
    return AppLocalizations.of(context).translate("pleaseEnterValidEmail");
  }

  return null;
}

String? validateText(String? value, String message) {
  final v = (value ?? '').trim();
  if (v.isEmpty) return message;
  return null;
}

String? validateTextWithMaxLength(String? value, String message, AppLocalizations lang) {
  final v = (value ?? '').trim();
  if (v.isEmpty) return message;

  if (v.length < 3 || v.length > 10) {
    return lang.translate('textLengthErrMsg');
  }
  return null;
}

String? validatePassword(String? value) {
  final v = (value ?? '');
  if (v.isEmpty) return 'Please enter your password';

  // ✅ mieux: 8 min (comme backend)
  if (v.length < 8) return 'Password must be at least 8 characters long';

  return null;
}

String? validatePasswordWithMessage(String? value, String msg) {
  final v = (value ?? '');
  if (v.isEmpty) return 'Please enter your $msg';
  if (v.length < 8) return '$msg must be at least 8 characters long';
  return null;
}

String? validateConfirmPassword(String? password, String? confirmPassword) {
  if (confirmPassword == null || confirmPassword.isEmpty) {
    return 'Please confirm your password';
  }
  if (password != confirmPassword) {
    return 'Passwords do not match';
  }
  return null;
}

String? validateZipCode(String? value) {
  final v = (value ?? '').trim();
  if (v.isEmpty) return "Please enter ZIP code";
  return null;
}

String? validateUsername(String? value) {
  final v = (value ?? '').trim();
  if (v.isEmpty) return 'Username is required';
  if (v.length < 3) return 'Username must be at least 3 characters long';

  // ✅ accepte _ . - (souvent utilisé)
  if (!RegExp(r'^[a-zA-Z0-9_.-]+$').hasMatch(v)) {
    return 'Username can only contain letters, numbers, underscores, dots, and hyphens';
  }

  return null;
}

/// ✅ FIX PRINCIPAL : ici ton email avec "-" était rejeté.
/// - Email: regex robuste
/// - Username: accepte _ . - et 3+ chars
String? validateUsernameOrEmail(String? value) {
  final v = (value ?? '').trim();
  if (v.isEmpty) return "Username or Email is required";

  // ✅ email robuste (accepte: cbitunisia@cbi-tunisia.com)
  final emailOk = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(v);

  // ✅ username (3+ chars) lettres/nombres/_/./-
  final usernameOk = RegExp(r'^[a-zA-Z0-9_.-]{3,}$').hasMatch(v);

  if (emailOk || usernameOk) return null;

  return "Enter a valid username (3+ letters, numbers, _ . -) or email";
}
