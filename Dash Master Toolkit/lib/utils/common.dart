import '../constant/app_color.dart';
import '../extension/string_extensions.dart';
import '../theme/styles.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:fluttertoast/fluttertoast.dart';
import 'package:get/get.dart';

import '../extension/device_extensions.dart';
import '../route/my_route.dart';

/// Make any variable nullable
T? makeNullable<T>(T? value) => value;

/// Formats a [TimeOfDay] as 24h "HH:mm" — required by backends that
/// validate against a strict HH:mm pattern. [TimeOfDay.format] is
/// locale-dependent (e.g. "5:54 PM") and must never be sent to an API.
String formatTime24h(TimeOfDay time) {
  return '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
}

BorderRadius radius([double? radius]) {
  return BorderRadius.all(radiusCircular(radius ?? defaultRadius));
}

Radius radiusCircular([double? radius]) {
  return Radius.circular(radius ?? defaultRadius);
}

Color defaultToastBackgroundColor = Colors.grey.shade200;
Color defaultToastTextColor = Colors.black;
ToastGravity defaultToastGravityGlobal = ToastGravity.CENTER;
BorderRadius defaultToastBorderRadiusGlobal = BorderRadius.circular(30);
Color shadowColorGlobal = Colors.grey.withValues(alpha: 0.2);
int defaultElevation = 4;
double defaultRadius = 8.0;
double defaultBlurRadius = 4.0;
double defaultSpreadRadius = 1.0;
double defaultAppBarElevation = 4.0;

List<BoxShadow> defaultBoxShadow({
  Color? shadowColor,
  double? blurRadius,
  double? spreadRadius,
  Offset offset = const Offset(0.0, 0.0),
}) {
  return [
    BoxShadow(
      color: shadowColor ?? shadowColorGlobal,
      blurRadius: blurRadius ?? defaultBlurRadius,
      spreadRadius: spreadRadius ?? defaultSpreadRadius,
      offset: offset,
    )
  ];
}

/// Enum for page route
enum PageRouteAnimation { Fade, Scale, Rotate, Slide, SlideBottomTop }

/// has match return bool for pattern matching
bool hasMatch(String? s, String p) {
  return (s == null) ? false : RegExp(p).hasMatch(s);
}

/// Toast for default time
void toast(
  String? value, {
  ToastGravity? gravity,
  length = Toast.LENGTH_SHORT,
  Color? bgColor,
  Color? textColor,
  bool isPrint = false,
}) {
  if (value.validate().isEmpty || isLinux) {
    print(value);
  } else {
    Fluttertoast.showToast(
      msg: value.validate(),
      gravity: gravity,
      toastLength: length,
      backgroundColor: bgColor ?? colorPrimary300,
      textColor: textColor,
    );
    if (isPrint) print(value);
  }
}

/// Toast with Context
void toasty(
  BuildContext context,
  String? text, {
  ToastGravity? gravity,
  length = Toast.LENGTH_SHORT,
  Color? bgColor,
  Color? textColor,
  bool isPrint = false,
  bool removeQueue = false,
  Duration duration = const Duration(seconds: 2),
  BorderRadius? borderRadius,
  EdgeInsets? padding,
}) {
  FToast().init(context);
  if (removeQueue) FToast().removeCustomToast();

  FToast().showToast(
    child: Container(
      decoration: BoxDecoration(
        color: bgColor ?? defaultToastBackgroundColor,
        boxShadow: defaultBoxShadow(),
        borderRadius: borderRadius ?? defaultToastBorderRadiusGlobal,
      ),
      padding: padding ?? EdgeInsets.symmetric(vertical: 16, horizontal: 30),
      child: Text(text.validate(),
          style: TextStyle(color: textColor ?? colorGrey900)),
    ),
    gravity: gravity ?? defaultToastGravityGlobal,
    toastDuration: duration,
  );
  if (isPrint) print(text);
}

/// Toast for long period of time
void toastLong(
  String? value, {
  BuildContext? context,
  ToastGravity gravity = ToastGravity.BOTTOM,
  length = Toast.LENGTH_LONG,
  Color? bgColor,
  Color? textColor,
  bool isPrint = false,
}) {
  toast(
    value,
    gravity: gravity,
    bgColor: bgColor,
    textColor: textColor,
    length: length,
    isPrint: isPrint,
  );
}

/// Show SnackBar
void snackBar(
  BuildContext context, {
  String title = '',
  Widget? content,
  SnackBarAction? snackBarAction,
  Function? onVisible,
  Color? textColor,
  Color? backgroundColor,
  EdgeInsets? margin,
  EdgeInsets? padding,
  Animation<double>? animation,
  double? width,
  ShapeBorder? shape,
  Duration? duration,
  SnackBarBehavior? behavior,
  double? elevation,
}) {
  if (title.isEmpty && content == null) {
    print('SnackBar message is empty');
  } else {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: backgroundColor,
        action: snackBarAction,
        margin: margin,
        animation: animation,
        width: width,
        shape: shape,
        duration: duration ?? 4.seconds,
        behavior: margin != null ? SnackBarBehavior.floating : behavior,
        elevation: elevation,
        onVisible: onVisible?.call(),
        content: content ??
            Padding(
              padding: padding ?? EdgeInsets.symmetric(vertical: 4),
              child: Text(
                title,
                style: TextStyle(
                    color: textColor ?? Colors.white,
                    fontFamily: Styles.fontFamily),
              ),
            ),
      ),
    );
  }
}

/// Hide soft keyboard
void hideKeyboard(context) => FocusScope.of(context).requestFocus(FocusNode());

/// Returns a string from Clipboard
Future<String> paste() async {
  ClipboardData? data = await Clipboard.getData('text/plain');
  return data?.text?.toString() ?? "";
}

/// Returns a string from Clipboard
Future<dynamic> pasteObject() async {
  ClipboardData? data = await Clipboard.getData('text/plain');
  return data;
}

/// Enum for Link Provider
enum LinkProvider {
  PLAY_STORE,
  APPSTORE,
  FACEBOOK,
  INSTAGRAM,
  LINKEDIN,
  TWITTER,
  YOUTUBE,
  REDDIT,
  TELEGRAM,
  WHATSAPP,
  FB_MESSENGER,
  GOOGLE_DRIVE
}

String getInitials(userName) {
  List<String> names = userName.split(" ");
  String initials = "";

  if (names.length == 1) {
    return names[0].substring(0, 1); // Return initial of the single name
  }

  int numWords = 2;

  if (numWords < names.length) {
    numWords = names.length;
  }
  for (var i = 0; i < numWords; i++) {
    initials += names[i][0];
  }
  return initials;
}

void clearAndNavigate(String path) {
  while (MyRoute.router.canPop() == true) {
    MyRoute.router.pop();
  }
  MyRoute.router.pushReplacement(path);
}

