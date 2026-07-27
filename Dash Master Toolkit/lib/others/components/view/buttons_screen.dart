import 'package:dash_master_toolkit/others/components/components_imports.dart';

import 'package:responsive_framework/responsive_framework.dart' as rf;

class ButtonsScreen extends StatefulWidget {
  const ButtonsScreen({super.key});

  @override
  State<ButtonsScreen> createState() => _ButtonsScreenState();
}

class _ButtonsScreenState extends State<ButtonsScreen> {
  ThemeController themeController = Get.put(ThemeController());
  ThemeModeOption selectedMode = ThemeModeOption.light;

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

    var buttonTextStyle = theme.textTheme.bodyMedium
        ?.copyWith(fontWeight: FontWeight.w500, color: Colors.white);

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
                        child: rectangularButtons(lang, buttonTextStyle, 0.0),
                        screenWidth: screenWidth,
                        title: lang.translate("BasicElevatedButton"),
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
                        child: rectangularButtons(lang, buttonTextStyle, 20.0),
                        screenWidth: screenWidth,
                        title: lang.translate("ElevatedRoundedButton"),
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
                    padding: EdgeInsetsDirectional.only(end:isMobile?0: 10),
                    child: _commonBackgroundWidget(
                        isMobile: isMobile,
                        child: roundedOutlineButtons(lang),
                        screenWidth: screenWidth,
                        title: lang.translate("RoundedOutlinedButtons"),
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
                        child: squareOutlinedButtons(5, lang),
                        screenWidth: screenWidth,
                        title: lang.translate("SquareOutlinedButtons"),
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
                    padding: EdgeInsetsDirectional.only(end:isMobile?0: 10),
                    child: _commonBackgroundWidget(
                        isMobile: isMobile,
                        child: pillSizeButtons(lang),
                        screenWidth: screenWidth,
                        title: lang.translate("ButtonPillSizes"),
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
                        child: squareSizeButtons(lang),
                        screenWidth: screenWidth,
                        title: lang.translate("ButtonSquareSizes"),
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
                    padding: EdgeInsetsDirectional.only(end:isMobile?0: 10),
                    child: _commonBackgroundWidget(
                        isMobile: isMobile,
                        child: textButtons(lang),
                        screenWidth: screenWidth,
                        title: lang.translate("TextButtons"),
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
                        child: loadingButtons(lang),
                        screenWidth: screenWidth,
                        title: lang.translate("ButtonsWithLoadingState"),
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
                    padding: EdgeInsetsDirectional.only(end:isMobile?0: 10),
                    child: _commonBackgroundWidget(
                        isMobile: isMobile,
                        child: buttonsWithIcons(lang),
                        screenWidth: screenWidth,
                        title: lang.translate("ButtonsWithIcons"),
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
                            iconOnlyToggleGroup(),
                            SizedBox(
                              height: 20,
                            ),
                            iconLabelToggleGroup(),
                          ],
                        ),
                        screenWidth: screenWidth,
                        title: lang.translate("ButtonGroup"),
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

  Widget iconOnlyToggleGroup() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: ThemeModeOption.values.map((mode) {
        return buildToggleButton(
          isSelected: selectedMode == mode,
          onPressed: () => setState(() => selectedMode = mode),
          icon: getThemeIcon(mode),
          label: null,
        );
      }).toList(),
    );
  }

  Widget iconLabelToggleGroup() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: ThemeModeOption.values.map((mode) {
        return buildToggleButton(
          isSelected: selectedMode == mode,
          onPressed: () => setState(() => selectedMode = mode),
          icon: getThemeIcon(mode),
          label: mode.name, // Flutter 3.0+ supports `name`
        );
      }).toList(),
    );
  }

  IconData getThemeIcon(ThemeModeOption mode) {
    switch (mode) {
      case ThemeModeOption.light:
        return Icons.wb_sunny_outlined;
      case ThemeModeOption.dark:
        return Icons.dark_mode_outlined;
      case ThemeModeOption.system:
        return Icons.settings_outlined;
    }
  }

  Widget buildToggleButton({
    required bool isSelected,
    required VoidCallback onPressed,
    required IconData icon,
    String? label,
  }) {
    return TextButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, color: Colors.deepPurple),
      label: label != null
          ? Text(label, style: TextStyle(color: Colors.deepPurple))
          : const SizedBox.shrink(),
      style: TextButton.styleFrom(
        backgroundColor: isSelected
            ? Colors.deepPurple.withValues(alpha: 0.1)
            : Colors.transparent,
        shape: RoundedRectangleBorder(
          side: BorderSide(color: Colors.grey.shade300),
          borderRadius: BorderRadius.zero,
        ),
        padding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      ),
    );
  }

  Widget textButtons(AppLocalizations lang) {
    return Wrap(
      spacing: 20,
      runSpacing: 20,
      children: [
        buildTextButton(lang.translate("Primary"), Colors.deepPurple),
        buildTextButton(lang.translate("Secondary"), Colors.grey),
        buildTextButton(lang.translate("Success"), Colors.green),
        buildTextButton(lang.translate("Warning"), Colors.orange),
        buildTextButton(lang.translate("Info"), Colors.lightBlue),
        buildTextButton(lang.translate("Danger"), Colors.red),
      ],
    );
  }

  Widget buildTextButton(String label, Color color) {
    return TextButton(
      onPressed: () {},
      style: TextButton.styleFrom(
        foregroundColor: color, // text color
      ),
      child: Text(label),
    );
  }

  Widget pillSizeButtons(AppLocalizations lang) {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        buildPillButton(lang.translate("ExtraSmall"), Colors.blue, 8, 30),
        buildPillButton(lang.translate("Small"), Colors.purple, 10, 34),
        buildPillButton(lang.translate("base"), Colors.pink, 12, 38),
        buildPillButton(lang.translate("large"), Colors.lightBlue, 14, 42),
        buildPillButton(lang.translate("ExtraLarge"), Colors.amber, 16, 44),
      ],
    );
  }

  Widget buildPillButton(
      String text, Color color, double fontSize, double height) {
    return ElevatedButton(
      onPressed: () {},
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        shape: const StadiumBorder(),
        padding: EdgeInsets.symmetric(horizontal: 20, vertical: 0),
        minimumSize: Size(0, height),
      ),
      child: Text(text,
          style: TextStyle(fontSize: fontSize, fontFamily: Styles.fontFamily)),
    );
  }

  Widget squareSizeButtons(AppLocalizations lang) {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        buildSquareButton(lang.translate("ExtraSmall"), Colors.blue, 8, 30),
        buildSquareButton(lang.translate("Small"), Colors.purple, 10, 34),
        buildSquareButton(lang.translate("base"), Colors.pink, 12, 38),
        buildSquareButton(lang.translate("large"), Colors.lightBlue, 14, 42),
        buildSquareButton(lang.translate("ExtraLarge"), Colors.amber, 16, 44),
      ],
    );
  }

  Widget buildSquareButton(
      String text, Color color, double fontSize, double height) {
    return ElevatedButton(
      onPressed: () {},
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
        padding: EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        minimumSize: Size(0, height),
      ),
      child: Text(text,
          style: TextStyle(fontSize: fontSize, fontFamily: Styles.fontFamily)),
    );
  }

  Widget loadingButtons(AppLocalizations lang) {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        LoadingButton(label: lang.translate('ClickMe'), color: Colors.blue),
        LoadingButton(
            label: lang.translate('ClickMe'), color: Colors.lightBlue),
        LoadingButton(
            label: lang.translate('ClickMe'),
            color: Colors.lightBlue,
            outlined: true),
        LoadingButton(label: lang.translate('ClickMe'), color: Colors.purple),
        LoadingButton(
            label: lang.translate('ClickMe'),
            color: Colors.deepPurple,
            outlined: true),
      ],
    );
  }

  Widget buttonsWithIcons(AppLocalizations lang) {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        ElevatedButton.icon(
          onPressed: () {},
          icon: Icon(Icons.shopping_bag_outlined),
          label: Text(lang.translate('BuyNow')),
          style: ElevatedButton.styleFrom(backgroundColor: Colors.blue),
        ),
        ElevatedButton.icon(
          onPressed: () {},
          icon: Icon(Icons.auto_graph),
          label: Text(lang.translate('ChoosePlan')),
          style: ElevatedButton.styleFrom(backgroundColor: Colors.deepPurple),
        ),
        ElevatedButton.icon(
          onPressed: () {},
          icon: Icon(Icons.shopping_cart_checkout),
          label: Text(lang.translate('BuyNow')),
          style: ElevatedButton.styleFrom(backgroundColor: Colors.lightBlue),
        ),
        ElevatedButton.icon(
          onPressed: () {},
          icon: Icon(Icons.shopping_cart_outlined),
          label: Text(lang.translate('BuyNow')),
          style: ElevatedButton.styleFrom(backgroundColor: Colors.teal),
        ),
        ElevatedButton.icon(
          onPressed: () {},
          icon: Icon(Icons.arrow_forward),
          label: Text(lang.translate('ChoosePlan')),
          style: ElevatedButton.styleFrom(backgroundColor: Colors.pinkAccent),
        ),
        ElevatedButton.icon(
          onPressed: () {},
          icon: Icon(Icons.shopping_cart_checkout_outlined),
          label: Text(lang.translate('BuyNow')),
          style: ElevatedButton.styleFrom(backgroundColor: Colors.amber),
        ),
      ],
    );
  }

  Widget roundedOutlineButtons(AppLocalizations lang) {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        OutlinedButton(
          onPressed: () {},
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.deepPurple,
            side: BorderSide(color: Colors.deepPurple),
          ),
          child: Text(
            lang.translate('Primary'),
          ),
        ),
        OutlinedButton(
          onPressed: () {},
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.grey[700],
            side: BorderSide(color: Colors.grey),
          ),
          child: Text(
            lang.translate('Secondary'),
          ),
        ),
        OutlinedButton(
          onPressed: () {},
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.green,
            side: BorderSide(color: Colors.green),
          ),
          child: Text(
            lang.translate('Success'),
          ),
        ),
        OutlinedButton(
          onPressed: () {},
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.amber[800],
            side: BorderSide(color: Colors.amber),
          ),
          child: Text(
            lang.translate('Warning'),
          ),
        ),
        OutlinedButton(
          onPressed: () {},
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.lightBlue,
            side: BorderSide(color: Colors.lightBlue),
          ),
          child: Text(
            lang.translate('Info'),
          ),
        ),
        OutlinedButton(
          onPressed: () {},
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.red,
            side: BorderSide(color: Colors.red),
          ),
          child: Text(
            lang.translate('Danger'),
          ),
        ),
      ],
    );
  }

  Widget squareOutlinedButtons(var radius, var lang) {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        OutlinedButton(
          onPressed: () {},
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.deepPurple,
            side: BorderSide(color: Colors.deepPurple),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(radius),
            ),
          ),
          child: Text(
            lang.translate('Primary'),
          ),
        ),
        OutlinedButton(
            onPressed: () {},
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.grey[700],
              side: BorderSide(color: Colors.grey),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(radius),
              ),
            ),
            child: Text(
              lang.translate('Secondary'),
            )),
        OutlinedButton(
            onPressed: () {},
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.green,
              side: BorderSide(color: Colors.green),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(radius),
              ),
            ),
            child: Text(
              lang.translate('Success'),
            )),
        OutlinedButton(
            onPressed: () {},
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.amber[800],
              side: BorderSide(color: Colors.amber),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(radius),
              ),
            ),
            child: Text(
              lang.translate('Warning'),
            )),
        OutlinedButton(
            onPressed: () {},
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.lightBlue,
              side: BorderSide(color: Colors.lightBlue),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(radius),
              ),
            ),
            child: Text(
              lang.translate('Info'),
            )),
        OutlinedButton(
            onPressed: () {},
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.red,
              side: BorderSide(color: Colors.red),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(radius),
              ),
            ),
            child: Text(
              lang.translate('Danger'),
            )),
      ],
    );
  }

  Widget rectangularButtons(
      AppLocalizations lang, var buttonTextStyle, var radius) {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        ElevatedButton(
          onPressed: () {},
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.deepPurple,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(radius),
            ),
          ),
          child: Text(
            lang.translate('Primary'),
            style: buttonTextStyle,
          ),
        ),
        ElevatedButton(
            onPressed: () {},
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.grey[700],
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(radius),
              ),
            ),
            child: Text(
              lang.translate('Secondary'),
              style: buttonTextStyle,
            )),
        ElevatedButton(
            onPressed: () {},
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.green,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(radius),
              ),
            ),
            child: Text(
              lang.translate('Success'),
              style: buttonTextStyle,
            )),
        ElevatedButton(
            onPressed: () {},
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.amber,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(radius),
              ),
            ),
            child: Text(
              lang.translate('Warning'),
              style: buttonTextStyle,
            )),
        ElevatedButton(
            onPressed: () {},
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.lightBlue,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(radius),
              ),
            ),
            child: Text(
              lang.translate('Info'),
              style: buttonTextStyle,
            )),
        ElevatedButton(
            onPressed: () {},
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(radius),
              ),
            ),
            child: Text(
              lang.translate('Danger'),
              style: buttonTextStyle,
            )),
      ],
    );
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

class LoadingButton extends StatefulWidget {
  final String label;
  final Color color;
  final bool outlined;

  const LoadingButton(
      {super.key,
      required this.label,
      required this.color,
      this.outlined = false});

  @override
  State<LoadingButton> createState() => _LoadingButtonState();
}

class _LoadingButtonState extends State<LoadingButton> {
  bool isLoading = false;

  @override
  Widget build(BuildContext context) {
    final child = isLoading
        ? Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(
                      widget.outlined ? widget.color : Colors.white),
                ),
              ),
              SizedBox(width: 8),
              Text(widget.label),
            ],
          )
        : Text(widget.label);

    final ButtonStyle style = widget.outlined
        ? OutlinedButton.styleFrom(
            foregroundColor: widget.color,
            side: BorderSide(color: widget.color),
          )
        : ElevatedButton.styleFrom(backgroundColor: widget.color);

    return widget.outlined
        ? OutlinedButton(
            onPressed: () {
              setState(() => isLoading = true);
              Future.delayed(Duration(seconds: 2), () {
                setState(() => isLoading = false);
              });
            },
            style: style,
            child: child,
          )
        : ElevatedButton(
            onPressed: () {
              setState(() => isLoading = true);
              Future.delayed(Duration(seconds: 2), () {
                setState(() => isLoading = false);
              });
            },
            style: style,
            child: child,
          );
  }
}

enum ThemeModeOption { light, dark, system }
