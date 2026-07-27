import 'package:flutter/foundation.dart';
import 'package:dash_master_toolkit/others/components/components_imports.dart';

import 'package:responsive_framework/responsive_framework.dart' as rf;

class DialogsScreen extends StatefulWidget {
  const DialogsScreen({super.key});

  @override
  State<DialogsScreen> createState() => _DialogsScreenState();
}

class _DialogsScreenState extends State<DialogsScreen> {
  ThemeController themeController = Get.put(ThemeController());

  @override
  Widget build(BuildContext context) {
    AppLocalizations lang = AppLocalizations.of(context);

    return Scaffold(
      backgroundColor: themeController.isDarkMode ? colorGrey900 : colorWhite,
      body: SingleChildScrollView(
        padding: EdgeInsets.all(
          rf.ResponsiveValue<double>(
            context,
            conditionalValues: [
              const rf.Condition.between(start: 0, end: 340, value: 2),
              const rf.Condition.between(start: 341, end: 992, value: 8),
            ],
            defaultValue: 16,
          ).value,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ResponsiveGridRow(
              children: [
                _dialogCard(
                  context,
                  lang.translate("SimpleAlert"),
                  lang.translate("JustTitleAndDescription"),
                  lang.translate("Show"),
                  "primary",
                  () {
                    _showSimpleAlert(context);
                  },
                ),
                _dialogCard(
                    context,
                    lang.translate("Confirmation"),
                    lang.translate("AskUserBeforeProceeding"),
                    lang.translate("Confirm"),
                    "secondary",
                    _showConfirmationDialog),
                _dialogCard(
                    context,
                    lang.translate("FullScreen"),
                    lang.translate("CoversMostOfTheScreen"),
                    lang.translate("Open"),
                   "success",
                    _showFullScreenDialog),
                _dialogCard(
                    context,
                    lang.translate("CustomWidget"),
                    lang.translate("CustomContentInsideDialog"),
                    lang.translate("View"),
                    "warning",
                    _showCustomWidgetDialog),
                _dialogCard(
                    context,
                    lang.translate("BottomSheet"),
                    lang.translate("SlidesUpFromTheBottom"),
                    lang.translate("SlideUp"),
                    "info",
                    _showBottomSheet),
                _dialogCard(
                    context,
                    lang.translate("TopSheet"),
                    lang.translate("SlidesDownFromTheTop"),
                    lang.translate("SlideDown"),
                    "danger",
                    _showTopSheet),
                _dialogCard(
                    context,
                    lang.translate("StaticDialog"),
                    lang.translate("DoesNotCloseOnBackdropTap"),
                    lang.translate("Static"),
                    "primary",
                    _showStaticDialog),
                _dialogCard(
                    context,
                    lang.translate("FormDialog"),
                    lang.translate("InputsActions"),
                    lang.translate("Form"),
                    "secondary",
                    _showFormDialog),
              ],
            ),
          ],
        ),
      ),
    );
  }

  ResponsiveGridCol _dialogCard(BuildContext context, String title,
      String description, String buttonText,String type, VoidCallback onPressed) {
    final isMobile = responsiveValue<bool>(
      context,
      xs: true,
      sm: true,
      md: false,
      lg: false,
      xl: false,
    );
    return ResponsiveGridCol(
      xs: 6,
      sm: 6,
      md: 4,
      lg: 3,
      child: Container(
        margin: EdgeInsetsDirectional.only(start: 8, end: 8, top: 15),
        // width: screenWidth,
        padding: EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: themeController.isDarkMode ? colorDark : colorWhite,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [BoxShadow(blurRadius: 6, color: Colors.black12)],
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontSize: isMobile ? 18 : 20, fontWeight: FontWeight.w500),
              ),
              SizedBox(height: 8),
              Text(
                description,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    fontSize: isMobile ? 16 : 14, fontWeight: FontWeight.w400),
              ),
              SizedBox(height: 16),
              CommonButton(
                height: 35,
                width: 110,
                textStyle: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(color: colorWhite, fontWeight: FontWeight.w600),
                onPressed: onPressed,
                bgColor: getButtonColor(type),
                text: buttonText,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color? getButtonColor(String type) {
    switch (type) {
      case "primary":
        return Color(0xFF5B21B6);
      case "secondary":
        return Color(0xFF4B5563);
      case "success":
        return Color(0xFF10B981);
      case "warning":
        return Color(0xFFF59E0B);
      case "info":
        return Color(0xFF0EA5E9);
      case "danger":
        return Color(0xFFDC2626);
    }
    return null;
  }

  Widget _titleTextStyle(String title) {
    return Text(
      title,
      style: Theme.of(context).textTheme.titleLarge,
    );
  }

  Widget _contentTextStyle(String title) {
    return Text(
      title,
      style: Theme.of(context).textTheme.bodyLarge,
    );
  }

  Widget _buttonTextStyle(String title, Color? color) {
    return Text(
      title,
      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w500,
            color: color ??
                (themeController.isDarkMode ? colorWhite : colorGrey900),
          ),
    );
  }

  void _showSimpleAlert(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: _titleTextStyle(
          AppLocalizations.of(context).translate("SimpleAlert"),
        ),
        content: _contentTextStyle(
          AppLocalizations.of(context).translate("ThisIsBasicAlertDialog"),
        ),
        actions: [
          TextButton(
            onPressed: () => context.pop(),
            child: _buttonTextStyle(
                AppLocalizations.of(context).translate("Close"), null),
          ),
        ],
      ),
    );
  }

  void _showConfirmationDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: _titleTextStyle(
          AppLocalizations.of(context).translate("Confirmation"),
        ),
        content: _contentTextStyle(
          AppLocalizations.of(context).translate("AreYouSureYouWantToProceed"),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: _buttonTextStyle(
                AppLocalizations.of(context).translate("cancel"), null),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: colorPrimary100),
            onPressed: () => Navigator.pop(ctx),
            child: _buttonTextStyle(
                AppLocalizations.of(context).translate("Confirm"), colorWhite),
          ),
        ],
      ),
    );
  }

  void _showFullScreenDialog() {
    Navigator.of(context).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => Scaffold(
          appBar: AppBar(
            title: _titleTextStyle(
              AppLocalizations.of(context).translate("FullScreenDialog"),
            ),
          ),
          body: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, size: 64, color: colorPrimary100),
                const SizedBox(height: 20),
                Text(
                  AppLocalizations.of(context)
                      .translate("ThisIsFullScreenDialog"),
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                Text(
                  AppLocalizations.of(context)
                      .translate("fullScreenDialogDescription"),
                  style: Theme.of(context)
                      .textTheme
                      .bodyLarge
                      ?.copyWith(fontSize: 16),
                ),
                const Spacer(),
                Center(
                  child: ElevatedButton.icon(
                    icon: Icon(Icons.check_circle_outline),
                    label: Text(AppLocalizations.of(context).translate("done")),
                    onPressed: () => context.pop(),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: colorPrimary100,
                      padding:
                          EdgeInsets.symmetric(horizontal: 32, vertical: 12),
                      textStyle: Theme.of(context)
                          .textTheme
                          .bodyLarge
                          ?.copyWith(fontSize: 16, color: Colors.white),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showCustomWidgetDialog() {
    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.info_outline, size: 48),
              SizedBox(height: 10),
              _contentTextStyle(
                  AppLocalizations.of(context).translate("CustomWidgetDialog")),
              SizedBox(height: 10),
              ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: colorPrimary100,
                    padding: EdgeInsets.symmetric(horizontal: 32, vertical: 12),
                    textStyle: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.copyWith(fontSize: 14, color: Colors.white),
                  ),
                  onPressed: () => Navigator.pop(ctx),
                  child: Text(AppLocalizations.of(context).translate("Close"))),
            ],
          ),
        ),
      ),
    );
  }

  void _showBottomSheet() {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => Container(
        width: MediaQuery.of(context).size.width,
        padding: EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _titleTextStyle(
              AppLocalizations.of(context).translate("Bottom Sheet"),
            ),
            SizedBox(height: 10),
            _contentTextStyle(AppLocalizations.of(context)
                .translate("ThisSlidesFromTheBottom")),
          ],
        ),
      ),
    );
  }

  void _showTopSheet() {
    showGeneralDialog(
      context: context,
      barrierDismissible: true,
      barrierLabel: AppLocalizations.of(context).translate("TopSheet"),
      pageBuilder: (ctx, a1, a2) {
        return Align(
          alignment: Alignment.topCenter,
          child: Material(
            child: Container(
              width: double.infinity,
              padding: EdgeInsets.all(20),
              color: Colors.white,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _titleTextStyle(
                    AppLocalizations.of(context).translate("TopSheet"),
                  ),
                  SizedBox(height: 10),
                  _contentTextStyle(AppLocalizations.of(context)
                      .translate("ThisSlidesDownFromTheTop")),
                ],
              ),
            ),
          ),
        );
      },
      transitionDuration: Duration(milliseconds: 300),
      transitionBuilder: (ctx, anim1, anim2, child) {
        return SlideTransition(
          position:
              Tween(begin: Offset(0, -1), end: Offset(0, 0)).animate(anim1),
          child: child,
        );
      },
    );
  }

  void _showStaticDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: _titleTextStyle(
            AppLocalizations.of(context).translate("StaticDialog")),
        content: _contentTextStyle(AppLocalizations.of(context)
            .translate("TapOutsideWilNotDismissThisDialog")),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(
              AppLocalizations.of(context).translate("Close"),
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(),
            ),
          ),
        ],
      ),
    );
  }

  void _showFormDialog() {
    final formKey = GlobalKey<FormState>();
    String name = "";

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: _titleTextStyle(
            AppLocalizations.of(context).translate("FormDialog")),
        content: Form(
          key: formKey,
          child: TextFormField(
            decoration: inputDecoration(context,
                labelText:
                    AppLocalizations.of(context).translate("EnterYourName")),
            validator: (value) => value!.isEmpty
                ? AppLocalizations.of(context).translate("Required")
                : null,
            onSaved: (value) => name = value!,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(
              AppLocalizations.of(context).translate("cancel"),
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(),
            ),
          ),
          ElevatedButton(
            onPressed: () {
              if (formKey.currentState!.validate()) {
                formKey.currentState!.save();
                Navigator.pop(ctx);
                if (kDebugMode) {
                  print("Name: $name");
                }
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: colorPrimary100,
              padding: EdgeInsets.symmetric(horizontal: 32, vertical: 12),
              textStyle: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(fontSize: 14, color: Colors.white),
            ),
            child: Text(AppLocalizations.of(context).translate("submit")),
          ),
        ],
      ),
    );
  }
}
