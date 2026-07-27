import 'package:dash_master_toolkit/others/components/components_imports.dart';
import 'package:flutter_rating_bar/flutter_rating_bar.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

class RattingScreen extends StatefulWidget {
  const RattingScreen({super.key});

  @override
  State<RattingScreen> createState() => _RattingScreenState();
}

class _RattingScreenState extends State<RattingScreen> {
  ThemeController themeController = Get.put(ThemeController());

  RxDouble currentRating = 4.0.obs;
  RxInt totalReviews = 1745.obs;

  final ratingBreakdown = <int, int>{
    5: 1221,
    4: 297,
    3: 140,
    2: 70,
    1: 17,
  }.obs;

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
        child: ResponsiveGridRow(children: [
          _commonCard(4, lang.translate("DefaultRating"), defaultRating()),
          _commonCard(
              4, lang.translate("RatingWithText"), ratingWithText(lang)),
          _commonCard(4, lang.translate("RatingCount"), ratingCount(lang)),
          _commonCard(6, lang.translate("StarSizing"), starSizing()),
          _commonCard(
              6,
              lang.translate("AdvancedRating"),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ratingWithText(lang),
                  const SizedBox(height: 10),
                  Text(
                    "${totalReviews.value} ${lang.translate('globalRatings')}",
                    style: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.copyWith(fontWeight: FontWeight.w500),
                  ),
                  SizedBox(
                    height: 10,
                  ),
                  ratingBreakdownWidget(lang),
                ],
              )),
        ]),
      ),
    );
  }

  ResponsiveGridCol _commonCard(
    int count,
    String title,
    Widget child,
  ) {
    return ResponsiveGridCol(
      xs: 12,
      sm: 12,
      md: count,
      lg: count,
      xl: count,
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
            const SizedBox(height: 10),
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
          ?.copyWith(fontSize: isMobile ? 16 : 18, fontWeight: FontWeight.w600),
    );
  }

  Widget defaultRating() {
    return RatingBarIndicator(
      unratedColor: themeController.isDarkMode ? colorGrey700 : colorGrey100,
      rating: currentRating.value,
      itemBuilder: (context, index) =>
          const Icon(Icons.star, color: Colors.amber),
      itemCount: 5,
      itemSize: 24.0,
      direction: Axis.horizontal,
    );
  }

  Widget ratingWithText(AppLocalizations lang) {
    return Row(
      children: [
        defaultRating(),
        const SizedBox(width: 8),
        Text(
          "${currentRating.value} ${lang.translate('outOf5')}",
          style: Theme.of(context)
              .textTheme
              .bodyMedium
              ?.copyWith(fontWeight: FontWeight.w500),
        ),
      ],
    );
  }

  Widget ratingCount(AppLocalizations lang) {
    return Row(
      children: [
        const Icon(Icons.star, color: Colors.amber),
        const SizedBox(width: 8),
        Text(
          "${currentRating.value}  •  $totalReviews  ${lang.translate('reviews')}",
          style: Theme.of(context)
              .textTheme
              .bodyMedium
              ?.copyWith(fontWeight: FontWeight.w600),
        ),
      ],
    );
  }

  Widget starSizing() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: List.generate(8, (i) {
        double size = 12.0 + (i * 4); // Sizes: 12, 16, 20, ..., 40
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: RatingBarIndicator(
            rating: 4.0,
            itemBuilder: (context, index) =>
                const Icon(Icons.star, color: Colors.amber),
            itemCount: 5,
            unratedColor: themeController.isDarkMode ? colorGrey700 : colorGrey100,
            itemSize: size,
            direction: Axis.horizontal,
          ),
        );
      }),
    );
  }

  Widget ratingBreakdownWidget(AppLocalizations lang) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: ratingBreakdown.entries.map((entry) {
        final percent = (entry.value / totalReviews.value) * 100;
        return Padding(
          padding: const EdgeInsets.only(top: 15.0),
          child: Row(
            children: [
              SizedBox(
                width: 45,
                child: Text(
                  '${entry.key} ${lang.translate('star')}',
                  style: Theme.of(context)
                      .textTheme
                      .bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w500),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: LinearProgressIndicator(
                  value: percent / 100,
                  color: Colors.amber,
                  backgroundColor: themeController.isDarkMode ? colorGrey700 : colorGrey100,
                  minHeight: 25,
                  borderRadius: BorderRadius.circular(5),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                width: 40,
                child: Text("${percent.toStringAsFixed(0)}%",style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(fontWeight: FontWeight.w500),),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }
}
