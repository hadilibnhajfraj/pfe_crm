
import 'package:responsive_framework/responsive_framework.dart' as rf;

import '../common_imports.dart';

class TopBarWidget extends StatelessWidget implements PreferredSizeWidget {
  const TopBarWidget({super.key, this.onMenuTap});

  final void Function()? onMenuTap;

  @override
  Widget build(BuildContext context) {
    final lang = AppLocalizations.of(context);
    return AppBar(
      leading: rf.ResponsiveValue<Widget?>(
        context,
        conditionalValues: [
          rf.Condition.largerThan(
            name: BreakpointName.MD.name,
            value: null,
          ),
        ],
        defaultValue: IconButton(
          onPressed: onMenuTap,
          icon: Tooltip(
            message: lang.translate('openNavigationMenu'),
            waitDuration: const Duration(milliseconds: 350),
            child: const Icon(Icons.menu),
          ),
        ),
      ).value,
      toolbarHeight: rf.ResponsiveValue<double?>(
        context,
        conditionalValues: [
          rf.Condition.largerThan(name: BreakpointName.SM.name, value: 70)
        ],
      ).value,
      surfaceTintColor: Colors.transparent,
      actions: [
        // Language Dropdown
        Consumer<AppLanguageProvider>(
          builder: (context, lang, child) {
            return LanguagePopupMenuWidget();
          },
        ),

        ThemeToggleButton(), // Add the toggle button here

        // Notification Icon
        const Padding(
          padding: EdgeInsetsDirectional.only(start: 0, end: 12),
          child: NotificationIconButton(),
        ),

        // User Avatar
        const UserProfileAvatar(),
        const SizedBox(width: 16),
      ],
    );
  }

  @override
  Size get preferredSize => const Size(double.infinity, 64);
}
