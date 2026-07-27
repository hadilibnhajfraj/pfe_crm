import 'package:cached_network_image/cached_network_image.dart';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:get/get.dart';

import '../constant/app_color.dart';
import '../theme/styles.dart';
import '../theme/theme_controller.dart';
import '../extension/string_extensions.dart';
import '../extension/device_extensions.dart';
import '../utils/common.dart';



Widget commonCacheImageWidget(String? url, double height,
    {double? width, BoxFit? fit, Color? color}) {
  if (url.validate().startsWith('http') || url.validate().startsWith('https')) {
    if (isMobile) {
      return CachedNetworkImage(
        placeholder: placeholderWidgetFn(height, width) as Widget Function(
            BuildContext, String)?,
        imageUrl: '$url',
        height: height,
        width: width,
        color: color,
        fit: fit ?? BoxFit.cover,
        errorWidget: (_, __, ___) {
          return SizedBox(height: height, width: width);
        },
      );
    } else {
      return Image.network(
        url!,
        height: height,
        width: width,
        fit: fit ?? BoxFit.cover,
        loadingBuilder: (context, child, loadingProgress) {
          if (loadingProgress == null) return child;
          return Center(child: CircularProgressIndicator());
        },
        errorBuilder: (context, error, stackTrace) =>
            placeholderWidget(height, width),
      );
    }
  } else {
    return Image.asset(url!,
        height: height, width: width, fit: fit ?? BoxFit.cover);
  }
}

Widget? Function(BuildContext, String) placeholderWidgetFn(
        double height, double? width) =>
    (_, s) => placeholderWidget(height, width!);

Widget placeholderWidget(double height, double? width) => Image.asset(
      'assets/placeholder.jpg',
      fit: BoxFit.cover,
      height: height,
      width: width ?? height,
    );

PreferredSizeWidget commonAppBarWidget(BuildContext context,
    {String? titleText,
    Widget? actionWidget,
    Widget? actionWidget2,
    Widget? actionWidget3,
    Widget? leadingWidget,
    Widget? titleWidget,
    Color? backgroundColor,
    bool? isTitleCenter,
    bool isback = true,
    bool isText = true,
    SystemUiOverlayStyle? style}) {
  Color bgColor = Get.isDarkMode ? colorGrey900 : colorWhite;
  return PreferredSize(
    preferredSize: const Size.fromHeight(60),
    child: AppBar(
      centerTitle: isTitleCenter ?? true,
      backgroundColor: backgroundColor ?? bgColor,
      titleSpacing: 0,
      leading: isback
          ? GestureDetector(
              onTap: () {
                Navigator.pop(context);
              },
              child: Icon(
                Icons.arrow_back,
                color: Get.isDarkMode ? Colors.white : colorGrey900,
              ),
            )
          : leadingWidget,
      actions: [
        actionWidget ?? const SizedBox(),
        actionWidget2 ?? const SizedBox(),
        actionWidget3 ?? const SizedBox()
      ],
      title: isText
          ? Text(
              titleText ?? "",
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: Get.isDarkMode ? Colors.white : colorGrey900,
                    fontFamily: Styles.fontFamily,
                  ),
            )
          : titleWidget,
      elevation: 0.0,
    ),
  );
}

InputDecoration inputDecoration(
  BuildContext context, {
  String? prefixIcon,
  String? suffixIcon,
  Widget? suffixWidget,
  Widget? prefixWidget,
  String? errorText,
  String? counterText,
  String? labelText,
  double? borderRadius,
  String? hintText,
  bool? isSvg,
  Color? fillColor,
  Color? borderColor,
  Color? hintColor,
  Color? errorColor,
  TextStyle? hintStyle,
  TextStyle? labelStyle,
  Color? prefixIconColor,
  Color? suffixIconColor,
  double? leftContentPadding,
  double? rightContentPadding,
  double? topContentPadding,
  double? bottomContentPadding,
  double? borderWidth,
  double? minWidth,
  double? minHeight,
      VoidCallback? onSuffixPressed,
}) {
  ThemeController themeController = Get.put(ThemeController());
  return InputDecoration(
    // prefixIconColor: prefixIconColor,
    counterText: counterText,
    errorText: errorText,
    contentPadding: EdgeInsets.fromLTRB(
        leftContentPadding ?? 10,
        topContentPadding ?? 15,
        rightContentPadding ?? 20,
        bottomContentPadding ?? 15),
    labelText: labelText,
    labelStyle:labelStyle ?? Theme.of(context).textTheme.bodyLarge?.copyWith(
          color: hintColor ?? (themeController.isDarkMode ? colorGrey600 : colorGrey300),
        fontWeight: FontWeight.w400,
        fontFamily: Styles.fontFamily),
    alignLabelWithHint: true,
    hintText: hintText.validate(),
    hintStyle: hintStyle ??
        Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: hintColor ?? (themeController.isDarkMode ? colorGrey600 : colorGrey300),
            fontWeight: FontWeight.w400,
            fontFamily: Styles.fontFamily),
    isDense: true,
    prefixIcon: prefixIcon != null
        ? Padding(
            padding: const EdgeInsets.only(left: 20, right: 10),
            child: isSvg == null
                ? SvgPicture.asset(
                    prefixIcon,
                    width: 15,
                    height: 15,
                    colorFilter: ColorFilter.mode(
                        prefixIconColor ??
                            (themeController.isDarkMode ? colorWhite : colorGrey900),
                        BlendMode.srcIn),
                  )
                : Image.asset(
                    prefixIcon,
                    width: 24,
                    height: 24,
                  ),
          )
        : prefixWidget,
    prefixIconConstraints: const BoxConstraints(
      minWidth: 15,
      minHeight: 15,
    ),
    suffixIconConstraints: BoxConstraints(
      minWidth: minWidth ?? 20,
      minHeight: minHeight ?? 20,
    ),
    suffixIcon: suffixIcon != null
        ? InkWell(
      onTap: onSuffixPressed ?? () {},
      child: Padding(
        padding: const EdgeInsets.only(left: 20, right: 20),
        child: isSvg == null
            ? SvgPicture.asset(
          suffixIcon,
          width: 18,
          height: 18,
          colorFilter: ColorFilter.mode(
              suffixIconColor ??  (themeController.isDarkMode ? colorGrey600 : colorGrey300),
              BlendMode.srcIn),
        )
            : Image.asset(
          suffixIcon,
          width: 24,
          height: 24,
        ),
      ),
    )
        : suffixWidget,

    enabledBorder: OutlineInputBorder(
      borderRadius: radius(borderRadius ?? defaultRadius),
      borderSide: BorderSide(
          color: borderColor ?? (themeController.isDarkMode ? colorGrey700 : colorGrey100),
          width: borderWidth ?? 1.0),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: radius(borderRadius ?? defaultRadius),
      borderSide: BorderSide(
          color: borderColor ?? colorPrimary100, width: borderWidth ?? 1.0),
    ),
    focusedErrorBorder: OutlineInputBorder(
      borderRadius: radius(borderRadius ?? defaultRadius),
      borderSide: BorderSide(color:borderColor ?? Colors.red, width: borderWidth ?? 1.0),
    ),
    errorBorder: OutlineInputBorder(
      borderRadius: radius(borderRadius ?? defaultRadius),
      borderSide: BorderSide(color: borderColor ??Colors.red, width: borderWidth ?? 1.0),
    ),
    border: OutlineInputBorder(
      borderRadius: radius(borderRadius ?? defaultRadius),
      borderSide: BorderSide(
          color: themeController.isDarkMode ? colorGrey700 : colorGrey100,
          width: borderWidth ?? 1.0),
    ),
    errorMaxLines: 2,
    errorStyle: Theme.of(context).textTheme.bodySmall?.copyWith(
        color: errorColor ?? Colors.red,
        fontWeight: FontWeight.w400,
        fontFamily: Styles.fontFamily),
    filled: true,
    fillColor: fillColor ?? (themeController.isDarkMode ? colorGrey900 : colorWhite),
  );
}


