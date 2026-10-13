

import '../common_imports.dart';

class ThemeToggleButton extends StatelessWidget {
  const ThemeToggleButton({super.key});

  @override
  Widget build(BuildContext context) {
    final ThemeController controller = Get.find<ThemeController>();

    // Bouton d'icône complet : infobulle, survol, focus clavier (Tab puis
    // Entrée ou Espace) — au lieu d'une zone tactile sans retour visuel.
    return Padding(
      padding: const EdgeInsetsDirectional.only(start: 7, end: 7),
      child: Tooltip(
        message: controller.isDarkMode ? 'Passer au thème clair' : 'Passer au thème sombre',
        waitDuration: const Duration(milliseconds: 350),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: controller.toggleTheme,
            hoverColor: colorPrimary100.withValues(alpha: 0.10),
            focusColor: colorPrimary100.withValues(alpha: 0.18),
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: SvgPicture.asset(
                controller.isDarkMode ? darkModeIcon : lightModeIcon,
                width: 24,
                height: 24,
                colorFilter: ColorFilter.mode(
                    controller.isDarkMode ? colorWhite : colorGrey900,
                    BlendMode.srcIn),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
