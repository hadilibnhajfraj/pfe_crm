
import 'package:flutter/material.dart';
import 'package:dash_master_toolkit/constant/app_images.dart';
import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/theme/theme_controller.dart';
import 'package:flutter_svg/svg.dart';

import 'package:get/get.dart';
import 'package:go_router/go_router.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

import '../../constant/app_color.dart';
import '../../constant/app_strings.dart';
import '../../constant/breakpoint.dart';

class CompanyHeaderWidget extends StatelessWidget {
  const CompanyHeaderWidget({
    super.key,
    this.showIconOnly = false,
    this.iconSize = const Size.square(32),
    this.showBottomBorder = false,
    this.onTap,
  });
  final bool showIconOnly;
  final Size iconSize;
  final bool showBottomBorder;
  final void Function()? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    ThemeController themeController = Get.put(ThemeController());
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: onTap ?? () => context.go(MyRoute.dashboardSalesAdmin), // /dashboard/kpi-projects
        child: Container(
          padding: const EdgeInsetsDirectional.all(16),
          height: rf.ResponsiveValue<double?>(
            context,
            conditionalValues: [
              rf.Condition.largerThan(
                name: BreakpointName.SM.name,
                value: 70,
              )
            ],
          ).value,
          decoration: BoxDecoration(
            color: themeController.isDarkMode ? colorGrey900 : colorWhite,
            border: !showBottomBorder
                ? null
                : Border(
                    bottom: BorderSide(color: themeController.isDarkMode ? colorGrey700 : colorGrey100,),
                  ),
          ),
          alignment: Alignment.center,
          child: Row(
            mainAxisAlignment: showIconOnly
                ? MainAxisAlignment.center
                : MainAxisAlignment.start,
            children: [
              // Logo
              Container(
                constraints: BoxConstraints.tight(iconSize),
                child:  SvgPicture.asset(
                  logoIcon,
                  fit: BoxFit.cover,
                  height: double.maxFinite,
                  width: double.maxFinite,
                  // color: colorPrimary300,
                ),
              ),

              if (!showIconOnly)
                Flexible(
                  child: Padding(
                    padding: const EdgeInsetsDirectional.only(start: 10),
                    child: Text(
                      appName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w600,
                        color:colorPrimary100,
                      ),
                    ),
                  ),
                )
            ],
          ),
        ),
      ),
    );
  }
}
