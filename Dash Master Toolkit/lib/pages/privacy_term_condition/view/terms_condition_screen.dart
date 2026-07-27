
import 'package:dash_master_toolkit/pages/privacy_term_condition/privacy_terms_imports.dart';

import 'package:responsive_framework/responsive_framework.dart' as rf;

class TermsConditionScreen extends StatefulWidget {
  const TermsConditionScreen({super.key});

  @override
  State<TermsConditionScreen> createState() => _PrivacyScreenState();
}

class _PrivacyScreenState extends State<TermsConditionScreen> {
  ThemeController themeController = Get.put(ThemeController());
  TermsConditionController controller = Get.put(TermsConditionController());

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
        child: ResponsiveGridRow(
          children: [
            _commonCard(_buildTermsConditionsList(lang)),
          ],
        ),
      ),
    );
  }

  _buildTermsConditionsList(AppLocalizations lang) {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(vertical: 10),
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: controller.termsConditionsList.length,
      itemBuilder: (context, index) {
        final data = controller.termsConditionsList[index];
        return _buildTermCondView(data, index, lang);
      },
    );
  }

  _buildTermCondView(PrivacyTermsData data, int index, AppLocalizations lang) {
    ThemeData theme = Theme.of(context);
    return Padding(
      padding: EdgeInsetsDirectional.only(top: index > 0 ? 15 : 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            lang.translate(data.title),
            style: theme.textTheme.bodyLarge
                ?.copyWith(fontWeight: FontWeight.w600),
          ),
          SizedBox(
            height: 8,
          ),
          Text(
            lang.translate(data.subtitle),
            style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w400,
                fontSize: 15,
                color:
                    themeController.isDarkMode ? colorGrey500 : colorGrey700),
          ),
        ],
      ),
    );
  }

  ResponsiveGridCol _commonCard(Widget child) {
    return ResponsiveGridCol(
      xs: 12,
      sm: 12,
      md: 12,
      lg: 12,
      xl: 12,
      child: Container(
        margin: EdgeInsetsDirectional.only(start: 8, end: 8, top: 15),
        // width: screenWidth,
        padding: EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: themeController.isDarkMode ? colorDark : colorWhite,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [BoxShadow(blurRadius: 6, color: Colors.black12)],
        ),
        child: child,
      ),
    );
  }
}
