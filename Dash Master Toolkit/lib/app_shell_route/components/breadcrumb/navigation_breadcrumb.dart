import 'package:responsive_framework/responsive_framework.dart' as rf;
import '../common_imports.dart';

class NavigationBreadcrumbWidget extends StatelessWidget {
  const NavigationBreadcrumbWidget({
    super.key,
    required this.breadcrumbData,
  });

  final NavigationBreadcrumbModel breadcrumbData;

  @override
  Widget build(BuildContext context) {
    var localization = AppLocalizations.of(context);
    final themeController = Get.put(ThemeController());
    final theme = Theme.of(context);
    final screenSize = MediaQuery.sizeOf(context);

    double? iconDimension = rf.ResponsiveValue<double?>(
      context,
      conditionalValues: [
        rf.Condition.smallerThan(
          name: BreakpointName.LG.name,
          value: 16,
        ),
      ],
      defaultValue: 20,
    ).value;

    final textStyleBreadcrumb = theme.textTheme.bodyLarge?.copyWith(
      fontSize: rf.ResponsiveValue<double?>(
        context,
        conditionalValues: const [
          rf.Condition.between(start: 0, end: 340, value: 12),
          rf.Condition.between(start: 341, end: 480, value: 14),
        ],
      ).value,
      letterSpacing: 0,
      fontWeight: FontWeight.w500,
    );

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        // Page Title
        Text(
          localization.translate(breadcrumbData.title),
          style: theme.textTheme.headlineSmall?.copyWith(
            fontSize: rf.ResponsiveValue<double?>(
              context,
              conditionalValues: const [
                rf.Condition.between(start: 0, end: 340, value: 14),
                rf.Condition.between(start: 341, end: 480, value: 18),
              ],
            ).value,
            fontWeight: FontWeight.w600,
          ),
        ),

        if (screenSize.width >= 576)
        // Breadcrumb Navigation
          Directionality(
            textDirection: TextDirection.ltr,
            child: Row(
              children: [
                // Home Button
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: GestureDetector(
                    onTap: () => context.go(MyRoute.dashboardSalesAdmin), // /dashboard/kpi-projects
                    child: MouseRegion(
                      cursor: SystemMouseCursors.click,
                      child: SvgPicture.asset(
                        dashboardIcon,
                        height: iconDimension,
                        width: iconDimension,
                        colorFilter: ColorFilter.mode(
                          themeController.isDarkMode ? colorWhite : colorGrey900,
                          BlendMode.srcIn,
                        ),
                      ),
                    ),
                  ),
                ),
                Text.rich(
                  TextSpan(
                    text: '/ ${localization.translate(breadcrumbData.parentRoute)} / ',
                    children: [
                      TextSpan(
                        text: localization.translate(breadcrumbData.childRoute),
                        style: textStyleBreadcrumb?.copyWith(
                          color: colorPrimary100,
                        ),
                      ),
                    ],
                  ),
                  textDirection: TextDirection.ltr,
                  style: textStyleBreadcrumb,
                ),
              ],
            ),
          ),
      ],
    );
  }
}
