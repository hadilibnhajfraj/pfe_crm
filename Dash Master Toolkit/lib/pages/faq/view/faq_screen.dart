import 'package:dash_master_toolkit/pages/faq/faq_imports.dart';

import 'package:responsive_framework/responsive_framework.dart' as rf;
import 'package:responsive_grid/responsive_grid.dart';

class FaqScreen extends StatefulWidget {
  const FaqScreen({super.key});

  @override
  State<FaqScreen> createState() => _FaqScreenState();
}

class _FaqScreenState extends State<FaqScreen> {
  ThemeController themeController = Get.put(ThemeController());
  FaqController controller = Get.put(FaqController());

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
            _commonCard(lang.translate("generalQuestion"), _buildFaqList(lang)),
          ],
        ),
      ),
    );
  }

  _buildFaqList(AppLocalizations lang) {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(vertical: 10),
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: controller.faqs.length,
      itemBuilder: (context, index) {
        final faq = controller.faqs[index];
        return _buildFaqView(faq, index,lang);
      },
    );
  }

  _buildFaqView(FaqData faq, int index, AppLocalizations lang) {
    ThemeData theme = Theme.of(context);
    return Container(
      margin: EdgeInsetsDirectional.only(top: index > 0 ? 15 : 0),
      // width: screenWidth,
      padding: EdgeInsets.symmetric(horizontal: 15),
      decoration: BoxDecoration(
        color: themeController.isDarkMode ? colorDark : colorWhite,
        border: Border.all(
            color: themeController.isDarkMode ? colorGrey700 : colorGrey50),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(blurRadius: 6, color: Colors.black12)],
      ),
      child: Obx(
        () => ExpansionTile(
          initiallyExpanded: faq.isSelected.value,
          tilePadding: EdgeInsets.zero,
          childrenPadding: EdgeInsets.zero,
          shape: const Border(),
          trailing: SvgPicture.asset(
            faq.isSelected.value ? minusCircleIcon : addCircleIcon,
            width: 20,
            height: 20,
            colorFilter: ColorFilter.mode(
                themeController.isDarkMode ? Colors.white : colorGrey900,
                BlendMode.srcIn),
          ),
          title: Text(
            lang.translate(faq.question),
            style: theme.textTheme.bodyLarge
                ?.copyWith(fontWeight: FontWeight.w500,),
          ),
          expandedAlignment:Alignment.topLeft ,
          expandedCrossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              lang.translate(faq.answer),
              style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w400,fontSize: 15,
                  color: Get.isDarkMode ? colorGrey500 : colorGrey400),
            ),
            SizedBox(height: 15,),
          ],
          onExpansionChanged: (value) {
            controller.toggleExpansion(index, faq.isSelected);
          },
        ),
      ),
    );
  }

  ResponsiveGridCol _commonCard(String title, Widget child) {
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
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _titleTextStyle(title),
            const SizedBox(height: 20),
            child,
          ],
        ),
      ),
    );
  }

  Widget _titleTextStyle(String title) {
    final isMobile = responsiveValue<bool>(
      context,
      xs: true,
      sm: true,
      md: false,
      lg: false,
      xl: false,
    );

    return Text(
      title,
      style: Theme.of(context)
          .textTheme
          .titleLarge
          ?.copyWith(fontSize: isMobile ? 18 : 20, fontWeight: FontWeight.w600),
    );
  }
}
