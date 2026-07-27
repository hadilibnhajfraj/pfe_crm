import 'package:dash_master_toolkit/dashboard/finance/finance_imports.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

import 'candlesticks_chart.dart';

class FinanceDashboardScreen extends StatefulWidget {
  const FinanceDashboardScreen({super.key});

  @override
  FinanceDashboardScreenState createState() => FinanceDashboardScreenState();
}

class FinanceDashboardScreenState extends State<FinanceDashboardScreen> {
  FinanceDashboardController controller = FinanceDashboardController();

  // late ThemeData theme;

  @override
  void initState() {
    super.initState();
    // theme = Get.isDarkMode ? Styles.darkTheme : Styles.lightTheme;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // final screenWidth = MediaQuery.sizeOf(context).width;
    AppLocalizations lang = AppLocalizations.of(context);
    // final desktopView = screenWidth >= 1200;

    final isMobileScreen = responsiveValue<bool>(
      context,
      xs: true,
      sm: true,
      md: false,
      lg: false,
      xl: false,
    );

    return GetBuilder<FinanceDashboardController>(
        init: controller,
        tag: 'fin_dashboard',
        // theme: theme,
        builder: (controller) {
          return Scaffold(
            backgroundColor: controller.themeController.isDarkMode
                ? colorGrey900
                : colorWhite,
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
                  _commonCard(4, _buildAssetsWidget(lang, theme)),
                  _cardForCrypto(
                    8,
                    ResponsiveGridRow(
                      children: controller.cryptoList.map((crypto) {
                        return ResponsiveGridCol(
                          xs: 12,
                          sm: 6,
                          md: 6,
                          lg: 6,
                          child: cryptoCard(crypto, theme),
                        );
                      }).toList(),
                    ),
                  ),
                  _commonCard(
                    8,
                    _buildChartWidget(lang, theme, isMobileScreen),
                  ),
                  _commonCard(
                    4,
                    _buildMarketWidget(lang, theme),
                  ),
                ],
              ),
            ),
          );
        });
  }

  Widget _buildMarketWidget(AppLocalizations lang, ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.all(7.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _titleTextStyle(
                lang.translate('Markets'),
              ),
              SizedBox(
                width: 10,
              ),
              Expanded(
                child: Obx(
                  () => Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: controller.marketDataCategory.map(
                      (cat) {
                        final isSelected =
                            controller.selectedDataCategory.value == cat;
                        return Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          child: InkWell(
                            onTap: () {
                              controller.changeMarketData(cat);
                            },
                            child: Container(
                              // width: 38,
                              height: 28,
                              padding: EdgeInsets.symmetric(horizontal: 6),
                              decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(7),
                                  color: isSelected
                                      ? colorFinanceLightPrimary
                                      : controller.themeController.isDarkMode
                                          ? colorGrey700
                                          : colorGrey50),
                              alignment: Alignment.center,
                              child: Text(
                                cat,
                                textAlign: TextAlign.center,
                                style: theme.textTheme.bodySmall?.copyWith(
                                    fontFamily:
                                        GoogleFonts.poppins().fontFamily,
                                    fontWeight: FontWeight.w600,
                                    color: colorFinancePrimary),
                              ),
                            ),
                          ),
                        );
                      },
                    ).toList(),
                  ),
                ),
              ),
            ],
          ),
          SizedBox(
            height: 20,
          ),
          SizedBox(
            height: 300,
            // padding: const EdgeInsets.all(16),
            child: _buildMarketList(theme),
          )
        ],
      ),
    );
  }

  Widget _buildMarketList(ThemeData theme) {
    return Obx(() {
      return ListView.builder(
        itemCount: controller.filteredMarkets.length,
        itemBuilder: (context, index) {
          final market = controller.filteredMarkets[index];
          return _buildMarketTile(market, theme);
        },
      );
    });
  }

  Widget _buildMarketTile(CryptoModel market, ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.only(top: 10.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Text(
              market.symbol,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w600,
                fontFamily: GoogleFonts.poppins().fontFamily,
              ),
            ),
          ),
          SizedBox(width: 4),
          Expanded(
            // width: 120,
            // alignment: Alignment.centerLeft,
            child: Text(
              market.name,
              textAlign: TextAlign.start,
              style: theme.textTheme.bodySmall?.copyWith(
                  fontWeight: FontWeight.w400,
                  fontFamily: GoogleFonts.roboto().fontFamily,
                  color: colorGrey500),
            ),
          ),
          SizedBox(width: 4),
          Expanded(
            child: Text(
              "\$${market.price}",
              textAlign: TextAlign.start,
              style: theme.textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w400,
                fontFamily: GoogleFonts.roboto().fontFamily,
              ),
            ),
          ),
          SizedBox(width: 4),
          Container(
            padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: market.change! >= 0
                  ? colorFinanceLightGreen
                  : colorFinanceLightRed,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              "${market.change! >= 0 ? "+" : ""}${market.change}%",
              style: theme.textTheme.bodySmall?.copyWith(
                  color:
                      market.change! >= 0 ? colorFinanceGreen : colorFinanceRed,
                  fontWeight: FontWeight.w400,
                  fontFamily: GoogleFonts.roboto().fontFamily),
            ),
          ),
        ],
      ),
    );
  }

  _buildChartWidget(
      AppLocalizations lang, ThemeData theme, bool isMobileScreen) {
    return Padding(
      padding: const EdgeInsets.all(7.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: isMobileScreen
                ? MainAxisAlignment.start
                : MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _titleTextStyle(
                    lang.translate('BTCUSDT'),
                  ),
                  Text(
                    lang.translate('Bitcoin'),
                    style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w400,
                        fontFamily: GoogleFonts.roboto().fontFamily,
                        color: controller.themeController.isDarkMode
                            ? colorGrey500
                            : colorGrey400),
                  ),
                ],
              ),
              SizedBox(
                width: 15,
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    lang.translate('\$23,738'),
                    style: theme.textTheme.bodyLarge?.copyWith(
                      fontWeight: FontWeight.w600,
                      fontFamily: GoogleFonts.poppins().fontFamily,
                    ),
                  ),
                  Container(
                    height: 17,
                    decoration: BoxDecoration(
                        color: '+23,6%'.startsWith("-")
                            ? colorFinanceLightRed
                            : colorFinanceLightGreen,
                        borderRadius: BorderRadius.circular(6)),
                    padding: EdgeInsets.symmetric(horizontal: 5),
                    alignment: Alignment.centerRight,
                    child: Text(
                      '+23,6%',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall?.copyWith(
                          fontSize: 10,
                          color: '+23,6%'.startsWith("-")
                              ? colorFinanceRed
                              : colorFinanceGreen,
                          fontWeight: FontWeight.w600,
                          fontFamily: GoogleFonts.roboto().fontFamily),
                    ),
                  ),
                ],
              ),
              SizedBox(
                width: 10,
              ),
              if (!isMobileScreen)
                Expanded(child: _buildIntervalWidget(theme, isMobileScreen)),
            ],
          ),
          if (isMobileScreen)
            SizedBox(
              height: 10,
            ),
          if (isMobileScreen) _buildIntervalWidget(theme, isMobileScreen),
          SizedBox(
            height: 10,
          ),
          // Candlestick Chart (use a chart lib here)
          Container(
            height: 300,
            padding: const EdgeInsets.all(16),
            child: Obx(
              () {
                if (controller.isLoading.value) {
                  // Show loading indicator while data is being fetched
                  return Center(
                      child: CircularProgressIndicator(
                    color: colorFinancePrimary,
                  ));
                } else {
                  // Show chart once data is available
                  return CandlesticksChart(candles: controller.candleData);
                }
              },
            ),
          )
        ],
      ),
    );
  }

  _buildIntervalWidget(ThemeData theme, bool isMobileScreen) {
    return Obx(
      () => Row(
        mainAxisAlignment:
            isMobileScreen ? MainAxisAlignment.start : MainAxisAlignment.end,
        children: controller.intervals.map((interval) {
          final isSelected = controller.selectedInterval.value == interval;
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: InkWell(
              onTap: () {
                controller.changeInterval(interval);
              },
              child: Container(
                width: 38,
                height: 24,
                decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(7),
                    color: isSelected
                        ? colorFinanceLightPrimary
                        : controller.themeController.isDarkMode
                            ? colorGrey700
                            : colorGrey50),
                alignment: Alignment.center,
                child: Text(
                  interval,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall?.copyWith(
                      fontFamily: GoogleFonts.poppins().fontFamily,
                      fontWeight: FontWeight.w600,
                      color: colorFinancePrimary),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget cryptoCard(CryptoModel model, ThemeData theme) {
    return Container(
      padding: const EdgeInsets.all(16),
      margin: EdgeInsetsDirectional.only(start: 8, end: 8, top: 15),
      // width: screenWidth,
      decoration: BoxDecoration(
        color: controller.themeController.isDarkMode ? colorDark : colorWhite,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(blurRadius: 6, color: Colors.black12)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(6),
                    color: model.chartColor!.withValues(alpha: 0.1)),
                padding: EdgeInsets.all(10),
                child: commonCacheImageWidget(model.icon, 24,
                    width: 24, fit: BoxFit.contain),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    model.symbol,
                    style: theme.textTheme.bodyLarge?.copyWith(
                        fontWeight: FontWeight.w600,
                        fontFamily: GoogleFonts.poppins().fontFamily),
                  ),
                  Text(
                    model.name,
                    style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w400,
                        color: colorGrey500,
                        fontFamily: GoogleFonts.poppins().fontFamily),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                model.price,
                maxLines: 1,
                style: theme.textTheme.titleLarge?.copyWith(
                    fontFamily: GoogleFonts.inter().fontFamily,
                    fontWeight: FontWeight.w600,
                    overflow: TextOverflow.ellipsis,
                    fontSize: 20),
              ),
              // const SizedBox(width: 20),
              SizedBox(
                height: 40,
                width: 120,
                child: LineChart(
                  LineChartData(
                    gridData: FlGridData(show: false),
                    titlesData: FlTitlesData(show: false),
                    borderData: FlBorderData(show: false),
                    lineBarsData: [
                      LineChartBarData(
                        spots: model.chartPoints!
                            .asMap()
                            .entries
                            .map((e) => FlSpot(e.key.toDouble(), e.value))
                            .toList(),
                        isCurved: true,
                        color: model.chartColor,
                        barWidth: 2,
                        dotData: FlDotData(show: false),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 25),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                "PNL Daily",
                style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w400,
                    color: colorGrey500,
                    fontFamily: GoogleFonts.roboto().fontFamily),
              ),
              Text(
                model.dailyPNL!,
                style: theme.textTheme.bodyMedium?.copyWith(
                    color: model.dailyPNL!.startsWith("-")
                        ? colorFinanceRed
                        : colorFinanceGreen,
                    fontWeight: FontWeight.w600,
                    fontFamily: GoogleFonts.poppins().fontFamily),
              ),
              Container(
                height: 21,
                decoration: BoxDecoration(
                    color: model.percentage!.startsWith("-")
                        ? colorFinanceLightRed
                        : colorFinanceLightGreen,
                    borderRadius: BorderRadius.circular(6)),
                padding: EdgeInsets.symmetric(horizontal: 5),
                alignment: Alignment.centerRight,
                child: Text(
                  model.percentage!,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall?.copyWith(
                      color: model.percentage!.startsWith("-")
                          ? colorFinanceRed
                          : colorFinanceGreen,
                      fontWeight: FontWeight.w600,
                      fontFamily: GoogleFonts.poppins().fontFamily),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  _buildAssetsWidget(AppLocalizations lang, ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.all(7.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _titleTextStyle(
            lang.translate('Assets'),
          ),
          SizedBox(
            height: 20,
          ),
          Text(
            lang.translate('YourTotalBalance'),
            style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w400,
                fontFamily: GoogleFonts.roboto().fontFamily,
                color: controller.themeController.isDarkMode
                    ? colorGrey500
                    : colorGrey400),
          ),
          SizedBox(
            height: 3,
          ),
          Row(
            children: [
              _buildTotalBalanceTextWidget(theme),
              SizedBox(
                width: 10,
              ),
              Obx(
                () => Container(
                  decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(10),
                      color: controller.isProfit.value
                          ? colorFinanceLightGreen
                          : colorFinanceLightRed),
                  padding: EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  child: Row(
                    children: [
                      SvgPicture.asset(
                        upArrowIcon,
                        width: 8,
                        height: 8,
                        colorFilter: ColorFilter.mode(
                            controller.isProfit.value
                                ? colorFinanceGreen
                                : colorFinanceRed,
                            BlendMode.srcIn),
                      ),
                      SizedBox(
                        width: 5,
                      ),
                      Text(
                        '${controller.profitOrLossPercentage.value}%',
                        style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                            color: controller.isProfit.value
                                ? colorFinanceGreen
                                : colorFinanceRed,
                            fontFamily: GoogleFonts.poppins().fontFamily),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          SizedBox(
            height: 10,
          ),
          Text(
            '\$${controller.todayProfitOrLoss.value}',
            style: theme.textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w600,
                fontFamily: GoogleFonts.poppins().fontFamily),
          ),
          SizedBox(
            height: 193,
            child: LineChart(
              LineChartData(
                minY: 0,
                maxY: 30000,
                titlesData: FlTitlesData(show: false),
                borderData: FlBorderData(show: false),
                gridData: FlGridData(
                  drawHorizontalLine: true,
                  drawVerticalLine: false,
                  getDrawingHorizontalLine: (value) {
                    return FlLine(
                      color: colorGrey500, // Change this to your desired color
                      strokeWidth: 0.3,
                      dashArray: [8, 3],
                    );
                  },
                ),
                lineBarsData: [
                  LineChartBarData(
                    isCurved: true,
                    spots: [
                      FlSpot(0, 8000),
                      FlSpot(1, 5500),
                      FlSpot(2, 6000),
                      FlSpot(3, 15000),
                      FlSpot(4, 10000),
                      FlSpot(5, 12500),
                      FlSpot(6, 25780),
                    ],
                    color: colorFinancePrimary,
                    barWidth: 1,
                    isStrokeCapRound: true,
                    belowBarData: BarAreaData(
                      show: true,
                      gradient: LinearGradient(
                        colors: [
                          colorFinancePrimary,
                          controller.themeController.isDarkMode
                              ? colorGrey700
                              : Colors.white,
                        ],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                    ),
                    dotData: FlDotData(
                      show: true,
                      getDotPainter: (spot, percent, barData, index) {
                        if (index == 6) {
                          return FlDotCirclePainter(
                            radius: 6,
                            color: Colors.white,
                            strokeWidth: 3,
                            strokeColor: colorFinancePrimary,
                          );
                        }
                        return FlDotCirclePainter(radius: 0); // hide others
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: ['30m', '1H', '4H', '1D', '7D'].map((label) {
              return Text(
                label,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: label == '30m'
                      ? controller.themeController.isDarkMode
                          ? colorWhite
                          : colorGrey900
                      : colorGrey500,
                  fontWeight:
                      label == '30m' ? FontWeight.bold : FontWeight.normal,
                ),
              );
            }).toList(),
          )
        ],
      ),
    );
  }

  _buildTotalBalanceTextWidget(ThemeData theme) {
    return Obx(() {
      // Format the number as currency with a comma separator
      // Format the number as currency with a comma separator
      final formatter = NumberFormat("#,##0.0#", "en_US");

      // Format totalBalance to ensure two decimal places
      String formattedBalance = formatter.format(controller.totalBalance.value);

      // Split the formatted string into integer and decimal parts
      final parts = formattedBalance.split('.');
      String integerPart = parts[0];

      return Text.rich(
        TextSpan(
          children: [
            TextSpan(
              text: '\$$integerPart.',
              style: theme.textTheme.titleLarge?.copyWith(
                fontSize: 22,
                fontWeight: FontWeight.w600,
                fontFamily: GoogleFonts.poppins().fontFamily,
              ),
            ),
            TextSpan(
              text: parts[1],
              style: theme.textTheme.bodyLarge?.copyWith(
                fontFamily: GoogleFonts.poppins().fontFamily,
                fontWeight: FontWeight.w600,
                color: colorGrey500, // Change this to any color
              ),
            ),
          ],
        ),
      );
    });
  }

  ResponsiveGridCol _commonCard(
    int count,
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
        padding: EdgeInsets.all(7),
        decoration: BoxDecoration(
          color: controller.themeController.isDarkMode ? colorDark : colorWhite,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [BoxShadow(blurRadius: 6, color: Colors.black12)],
        ),
        child: child,
      ),
    );
  }

  ResponsiveGridCol _cardForCrypto(
    int count,
    Widget child,
  ) {
    return ResponsiveGridCol(
        xs: 12, sm: 12, md: count, lg: count, xl: count, child: child);
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
      style: Theme.of(context).textTheme.titleLarge?.copyWith(
            fontSize: isMobile ? 18 : 20,
            fontWeight: FontWeight.w600,
            fontFamily: GoogleFonts.poppins().fontFamily,
          ),
    );
  }
}
