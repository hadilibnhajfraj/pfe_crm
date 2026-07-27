

import '../common_imports.dart';

class ThemeToggleButton extends StatelessWidget {
  const ThemeToggleButton({super.key});

  @override
  Widget build(BuildContext context) {
    final ThemeController controller = Get.find<ThemeController>();

    return GestureDetector(
      onTap: () {
        controller.toggleTheme();
      },
      child: Padding(
        padding: EdgeInsetsDirectional.only(start: 15, end: 15),
        child: SvgPicture.asset(
          controller.isDarkMode ? darkModeIcon : lightModeIcon,
          // Use appropriate icons
          width: 24,
          height: 24,
          colorFilter: ColorFilter.mode(
              controller.isDarkMode ? colorWhite : colorGrey900,
              BlendMode.srcIn),
        ),
      ),
    );
  }
}
