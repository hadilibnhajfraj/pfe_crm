import '../common_imports.dart';

class LanguagePopupMenuWidget extends StatelessWidget {
  const LanguagePopupMenuWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final appLanguage = Provider.of<AppLanguageProvider>(context);
    ThemeData theme = Theme.of(context);

    return PopupMenuButton<Locale>(
      onSelected: (Locale newLocale) {
        appLanguage.changeLocale(newLocale);
      },
      itemBuilder: (BuildContext context) {
        return appLanguage.locales.entries.map((entry) {
          return PopupMenuItem<Locale>(
            value: Locale(entry.value.languageCode),
            child: Row(
              children: [
                CountryFlag.fromLanguageCode(
                  entry.value.languageCode.toString(),
                  height: 24,
                  width: 24,
                  shape: Circle(),
                ),
                const SizedBox(width: 10),
                Text(
                  entry.key,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w500),
                ),
              ],
            ),
          );
        }).toList();
      },
      position: PopupMenuPosition.under,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          border:
              Border.all(color: Get.isDarkMode ? colorGrey700 : colorGrey100),
          borderRadius: BorderRadius.circular(8),
          color: Colors.transparent,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CountryFlag.fromLanguageCode(
              appLanguage.currentLocale.languageCode.toString(),
              height: 24,
              width: 24,
              shape: Circle(),
            ),
            const SizedBox(width: 10),
            Text(
              appLanguage.locales.entries
                  .firstWhere(
                    (entry) =>
                        entry.value.languageCode ==
                        appLanguage.currentLocale.languageCode,
                    orElse: () => MapEntry(
                      "English",
                      Locale("en"),
                    ),
                  )
                  .key,
              style: theme.textTheme.bodyMedium
                  ?.copyWith(fontWeight: FontWeight.w500),
            ),
            const SizedBox(width: 10),
            SvgPicture.asset(
              chevronDownIcon,
              colorFilter: ColorFilter.mode(colorGrey500, BlendMode.srcIn),
            ),
          ],
        ),
      ),
    );
  }
}
