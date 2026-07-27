import 'package:flutter/foundation.dart';
import 'package:dash_master_toolkit/others/components/components_imports.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

class ToastScreen extends StatefulWidget {
  const ToastScreen({super.key});

  @override
  State<ToastScreen> createState() => _ToastScreenState();
}

class _ToastScreenState extends State<ToastScreen> {
  ThemeController themeController = Get.put(ThemeController());

  @override
  Widget build(BuildContext context) {
    AppLocalizations lang = AppLocalizations.of(context);
    double screenWidth = MediaQuery.of(context).size.width;

    ThemeData theme = Theme.of(context);
    final isMobile = responsiveValue<bool>(
      context,
      xs: true,
      sm: true,
      md: false,
      lg: false,
      xl: false,
    );

    return Scaffold(
      backgroundColor: themeController.isDarkMode ? colorGrey900 : colorWhite,
      body: SingleChildScrollView(
        padding: EdgeInsets.all(
          rf.ResponsiveValue<double>(
            context,
            conditionalValues: [
              const rf.Condition.between(start: 0, end: 340, value: 10),
              const rf.Condition.between(start: 341, end: 992, value: 16),
            ],
            defaultValue: 24,
          ).value,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ResponsiveGridRow(
              children: [
                //Basic Elevated Button
                ResponsiveGridCol(
                  xl: 6,
                  md: 6,
                  lg: 6,
                  xs: 12,
                  sm: 12,
                  child: Padding(
                    padding: EdgeInsetsDirectional.only(
                      end: isMobile ? 0 : 10,
                    ),
                    child: _commonBackgroundWidget(
                        isMobile: isMobile,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            commonButton(
                              message: lang.translate('ThisIsPrimaryToast'),
                              type: ToastType.primary,
                              title: lang.translate('ShowPrimaryToast'),
                            ),
                            commonButton(
                              message: lang.translate('ThisIsSecondaryToast'),
                              type: ToastType.secondary,
                              title: lang.translate('ShowSecondaryToast'),
                            ),
                            commonButton(
                              message: lang.translate('ThisIsSuccessToast'),
                              type: ToastType.success,
                              title: lang.translate('ShowSuccessToast'),
                            ),
                            commonButton(
                              message: lang.translate('ThisIsWarningToast'),
                              type: ToastType.warning,
                              title: lang.translate('ShowWarningToast'),
                            ),
                            commonButton(
                              message: lang.translate('ThisIsInfoToast'),
                              type: ToastType.info,
                              title: lang.translate('ShowInfoToast'),
                            ),
                            commonButton(
                              message: lang.translate('ThisIsDangerToast'),
                              type: ToastType.danger,
                              title: lang.translate('ShowDangerToast'),
                            ),
                          ],
                        ),
                        screenWidth: screenWidth,
                        title: lang.translate("SimpleToast"),
                        theme: theme),
                  ),
                ),
                ResponsiveGridCol(
                  xl: 6,
                  md: 6,
                  lg: 6,
                  xs: 12,
                  sm: 12,
                  child: Padding(
                    padding: EdgeInsetsDirectional.only(
                        start: isMobile ? 0 : 10, top: isMobile ? 15 : 0),
                    child: _commonBackgroundWidget(
                        isMobile: isMobile,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            outlinedCommonButton(
                              message: lang.translate('ThisIsPrimaryToast'),
                              type: ToastType.primary,
                              title: lang.translate('ShowPrimaryToast'),
                            ),
                            outlinedCommonButton(
                              message: lang.translate('ThisIsSecondaryToast'),
                              type: ToastType.secondary,
                              title: lang.translate('ShowSecondaryToast'),
                            ),
                            outlinedCommonButton(
                              message: lang.translate('ThisIsSuccessToast'),
                              type: ToastType.success,
                              title: lang.translate('ShowSuccessToast'),
                            ),
                            outlinedCommonButton(
                              message: lang.translate('ThisIsWarningToast'),
                              type: ToastType.warning,
                              title: lang.translate('ShowWarningToast'),
                            ),
                            outlinedCommonButton(
                              message: lang.translate('ThisIsInfoToast'),
                              type: ToastType.info,
                              title: lang.translate('ShowInfoToast'),
                            ),
                            outlinedCommonButton(
                              message: lang.translate('ThisIsDangerToast'),
                              type: ToastType.danger,
                              title: lang.translate('ShowDangerToast'),
                            ),
                          ],
                        ),
                        screenWidth: screenWidth,
                        title: lang.translate("OutlineToast"),
                        theme: theme),
                  ),
                ),
              ],
            ),
            SizedBox(
              height: 20,
            ),
            ResponsiveGridRow(
              children: [
                //Basic Elevated Button

                ResponsiveGridCol(
                  xl: 6,
                  md: 6,
                  lg: 6,
                  xs: 12,
                  sm: 12,
                  child: Padding(
                    padding: EdgeInsetsDirectional.only(
                      end: isMobile ? 0 : 10,
                    ),
                    child: _commonBackgroundWidget(
                        isMobile: isMobile,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            outlinedButtonWithIcon(
                              message: lang.translate('ThisIsPrimaryToast'),
                              type: ToastType.primary,
                              title: lang.translate('ShowPrimaryToast'),
                            ),
                            outlinedButtonWithIcon(
                              message: lang.translate('ThisIsSecondaryToast'),
                              type: ToastType.secondary,
                              title: lang.translate('ShowSecondaryToast'),
                            ),
                            outlinedButtonWithIcon(
                              message: lang.translate('ThisIsSuccessToast'),
                              type: ToastType.success,
                              title: lang.translate('ShowSuccessToast'),
                            ),
                            outlinedButtonWithIcon(
                              message: lang.translate('ThisIsWarningToast'),
                              type: ToastType.warning,
                              title: lang.translate('ShowWarningToast'),
                            ),
                            outlinedButtonWithIcon(
                              message: lang.translate('ThisIsInfoToast'),
                              type: ToastType.info,
                              title: lang.translate('ShowInfoToast'),
                            ),
                            outlinedButtonWithIcon(
                              message: lang.translate('ThisIsDangerToast'),
                              type: ToastType.danger,
                              title: lang.translate('ShowDangerToast'),
                            ),
                          ],
                        ),
                        screenWidth: screenWidth,
                        title: lang.translate("IconToast"),
                        theme: theme),
                  ),
                ),
                ResponsiveGridCol(
                  xl: 6,
                  md: 6,
                  lg: 6,
                  xs: 12,
                  sm: 12,
                  child: Padding(
                    padding: EdgeInsetsDirectional.only(
                        start: isMobile ? 0 : 10, top: isMobile ? 15 : 0),
                    child: _commonBackgroundWidget(
                        isMobile: isMobile,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            outlinedButtonWithIconAndButton(
                              message: lang.translate('ThisIsPrimaryToast'),
                              type: ToastType.primary,
                              title: lang.translate('ShowPrimaryToast'),
                            ),
                            outlinedButtonWithIconAndButton(
                              message: lang.translate('ThisIsSecondaryToast'),
                              type: ToastType.secondary,
                              title: lang.translate('ShowSecondaryToast'),
                            ),
                            outlinedButtonWithIconAndButton(
                              message: lang.translate('ThisIsSuccessToast'),
                              type: ToastType.success,
                              title: lang.translate('ShowSuccessToast'),
                            ),
                            outlinedButtonWithIconAndButton(
                              message: lang.translate('ThisIsWarningToast'),
                              type: ToastType.warning,
                              title: lang.translate('ShowWarningToast'),
                            ),
                            outlinedButtonWithIconAndButton(
                              message: lang.translate('ThisIsInfoToast'),
                              type: ToastType.info,
                              title: lang.translate('ShowInfoToast'),
                            ),
                            outlinedButtonWithIconAndButton(
                              message: lang.translate('ThisIsDangerToast'),
                              type: ToastType.danger,
                              title: lang.translate('ShowDangerToast'),
                            ),
                          ],
                        ),
                        screenWidth: screenWidth,
                        title: lang.translate("ToastWithButton"),
                        theme: theme),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget commonButton(
      {required String message,
      required ToastType type,
      required String title}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.only(bottom: 16.0),
      child: ElevatedButton(
        style: ElevatedButton.styleFrom(
            backgroundColor: getToastColor(type),
            foregroundColor: Colors.white,
            minimumSize: Size.fromHeight(50),
            shape: RoundedRectangleBorder()),
        onPressed: () {
          showSimpleToast(
              context: context, message: message, type: type, radius: 0);
        },
        child: Text(title),
      ),
    );
  }

  Widget outlinedCommonButton(
      {required String message,
      required ToastType type,
      required String title}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.only(bottom: 16.0),
      child: ElevatedButton(
        style: ElevatedButton.styleFrom(
          side: BorderSide(
            color: getToastColor(type),
          ),
          backgroundColor: getToastBackground(type),
          foregroundColor: getToastColor(type),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          minimumSize: Size.fromHeight(50),
        ),
        onPressed: () {
          showOutlineToast(
              isIcon: false, context: context, message: message, type: type);
        },
        child: Text(title),
      ),
    );
  }

  Widget outlinedButtonWithIconAndButton(
      {required String message,
      required ToastType type,
      required String title}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.only(bottom: 16.0),
      child: ElevatedButton(
          style: ElevatedButton.styleFrom(
            side: BorderSide(
              color: getToastColor(type),
            ),
            backgroundColor: getToastBackground(type),
            foregroundColor: getToastColor(type),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            minimumSize: Size.fromHeight(50),
          ),
          onPressed: () {
            showToastWithButton(
              type: type,
              context: context,
              message: "Changes saved successfully.",
              buttonLabel: "Undo",
              onPressed: () {
                if (kDebugMode) {
                  print("Undo tapped");
                }
              },
            );
          },
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(getIconForType(type), color: getToastColor(type)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                ),
              ),
              const SizedBox(width: 16),
              TextButton(
                onPressed: () {
                  // Undo action
                },
                child: Text(
                  'Undo',
                  style: TextStyle(
                      fontWeight: FontWeight.bold, color: Colors.blue),
                ),
              ),
            ],
          )),
    );
  }

  Widget outlinedButtonWithIcon(
      {required String message,
      required ToastType type,
      required String title}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.only(bottom: 16.0),
      child: TextButton(
        // iconAlignment: IconAlignment.start,
        style: ElevatedButton.styleFrom(
          side: BorderSide(
            color: getToastColor(type),
          ),
          foregroundColor: getToastColor(type),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          minimumSize: Size.fromHeight(50),
        ),
        onPressed: () {
          showOutlineToast(
              isIcon: true, context: context, message: message, type: type);
        },
        child: Row(
          // mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Icon(getIconForType(type), color: getToastColor(type)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                title,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Color getToastColor(ToastType type) {
    switch (type) {
      case ToastType.primary:
        return Color(0xFF5B21B6);
      case ToastType.secondary:
        return Color(0xFF4B5563);
      case ToastType.success:
        return Color(0xFF10B981);
      case ToastType.warning:
        return Color(0xFFF59E0B);
      case ToastType.info:
        return Color(0xFF0EA5E9);
      case ToastType.danger:
        return Color(0xFFDC2626);
    }
  }

  Color getToastBackground(ToastType type) {
    switch (type) {
      case ToastType.primary:
        return Color(0xFFF3E8FF);
      case ToastType.secondary:
        return Color(0xFFE5E7EB);
      case ToastType.success:
        return Color(0xFFD1FAE5);
      case ToastType.warning:
        return Color(0xFFFEF9C3);
      case ToastType.info:
        return Color(0xFFDBEAFE);
      case ToastType.danger:
        return Color(0xFFFECACA);
    }
  }

  IconData getIconForType(ToastType type) {
    switch (type) {
      case ToastType.primary:
        return Icons.push_pin_outlined;
      case ToastType.secondary:
        return Icons.settings_outlined;
      case ToastType.success:
        return Icons.check_circle_outline;
      case ToastType.warning:
        return Icons.warning_amber_rounded;
      case ToastType.info:
        return Icons.info_outline;
      case ToastType.danger:
        return Icons.error_outline;
    }
  }

  void showToastWithButton(
      {required BuildContext context,
      required String message,
      required String buttonLabel,
      required ToastType type,
      required VoidCallback onPressed,
      double width = 400}) {
    final mediaQuery = MediaQuery.of(context);
    final screenWidth = mediaQuery.size.width;

    final double sidePadding = (screenWidth - width) / 2;

    Color borderColor = getToastColor(type); // Reuse from earlier
    Color textColor = borderColor;

    final snackBar = SnackBar(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: borderColor, width: 2),
        borderRadius: BorderRadius.circular(12),
      ),
      margin: EdgeInsets.symmetric(horizontal: sidePadding, vertical: 16),
      backgroundColor: getToastBackground(type),
      content: Row(
        children: [
          Icon(getIconForType(type), color: textColor),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: TextStyle(color: textColor, fontFamily: Styles.fontFamily),
            ),
          ),
        ],
      ),
      action: SnackBarAction(
        label: buttonLabel,
        textColor: Colors.blue[900],
        onPressed: onPressed,
      ),
      duration: const Duration(seconds: 4),
    );

    ScaffoldMessenger.of(context).showSnackBar(snackBar);
  }

  void showOutlineToast(
      {required BuildContext context,
      required String message,
      required ToastType type,
      required bool isIcon,
      double width = 300}) {
    final mediaQuery = MediaQuery.of(context);
    final screenWidth = mediaQuery.size.width;

    final double sidePadding = (screenWidth - width) / 2;
    Color borderColor = getToastColor(type); // Reuse from earlier
    Color textColor = borderColor;

    final snackBar = SnackBar(
      backgroundColor: Colors.white,
      behavior: SnackBarBehavior.floating,
      margin: EdgeInsets.symmetric(horizontal: sidePadding, vertical: 16),
      shape: RoundedRectangleBorder(
        side: BorderSide(color: borderColor, width: 2),
        borderRadius: BorderRadius.circular(12),
      ),
      content: Row(
        children: [
          if (isIcon) Icon(getIconForType(type), color: textColor),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: textColor,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
      duration: const Duration(seconds: 3),
    );

    ScaffoldMessenger.of(context).showSnackBar(snackBar);
  }

  void showSimpleToast(
      {required BuildContext context,
      required String message,
      required ToastType type,
      required double radius,
      double width = 300}) {
    final mediaQuery = MediaQuery.of(context);
    final screenWidth = mediaQuery.size.width;

    final double sidePadding = (screenWidth - width) / 2;

    final snackBar = SnackBar(
      // width: MediaQuery.of(context).size.width * 0.5,
      backgroundColor: getToastColor(type),
      content: Text(
        message,
        style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
      ),
      behavior: SnackBarBehavior.floating,
      shape:
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius)),
      margin: EdgeInsets.symmetric(horizontal: sidePadding, vertical: 16),
      duration: const Duration(seconds: 2),
    );

    ScaffoldMessenger.of(context).showSnackBar(snackBar);
  }

  _commonDividerWidget() {
    return Divider(
      color: themeController.isDarkMode ? colorGrey700 : colorGrey100,
    );
  }

  _commonTitleTextWidget({
    required ThemeData theme,
    required String title,
    required bool isMobile,
  }) {
    return Text(
      title,
      style: theme.textTheme.titleLarge
          ?.copyWith(fontWeight: FontWeight.w500, fontSize: isMobile ? 18 : 20),
    );
  }

  _commonBackgroundWidget(
      {required Widget child,
      required double? screenWidth,
      required String title,
      required bool isMobile,
      required ThemeData theme}) {
    return Container(
      width: screenWidth,
      padding: EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: themeController.isDarkMode ? colorDark : colorWhite,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(blurRadius: 6, color: Colors.black12)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _commonTitleTextWidget(
              theme: theme, title: title, isMobile: isMobile),
          SizedBox(
            height: 10,
          ),
          _commonDividerWidget(),
          SizedBox(
            height: 10,
          ),
          child
        ],
      ),
    );
  }
}

enum ToastType { primary, secondary, success, warning, info, danger }
