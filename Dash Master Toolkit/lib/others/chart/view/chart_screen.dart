import 'package:dash_master_toolkit/others/chart/chart_imports.dart';

import 'package:responsive_framework/responsive_framework.dart' as rf;

class ChartScreen extends StatefulWidget {
  const ChartScreen({super.key});

  @override
  State<ChartScreen> createState() => _ChartScreenState();
}

class _ChartScreenState extends State<ChartScreen> {
  ThemeController themeController = Get.put(ThemeController());
  ChartController controller = Get.put(ChartController());

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
            _commonCard(
              lang.translate("LineChart"),
              _buildLineChart(),
            ),
            _commonCard(
              lang.translate("BarChart"),
              _buildBarChart(),
            ),
            _commonCard(
              lang.translate("TransactionChart"),
              transactionStateChart(),
            ),
            _commonCard(
              lang.translate("ActivityChart"),
              _buildActivityChart(),
            ),
            _commonCard(
              lang.translate("PieChart"),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildDailyRoutinePieChart(), // the chart widget
                  const SizedBox(height: 20),

                  routineLegend(), // <-- call legend here
                ],
              ),
            ),
            _commonCard(
              lang.translate("RadarChart"),
              _buildRadarChart(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRadarChart() {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 800),
      builder: (context, value, child) {
        final data = controller.monthlyActivity; // Your data source

        return SizedBox(
          height: 300,
          child: RadarChart(
            RadarChartData(
              radarShape: RadarShape.circle, // You can also use Polygon
              dataSets: [
                RadarDataSet(
                  dataEntries: List.generate(12, (index) {
                    final pilates = data[index].pilates * value;
                    final workouts = pilates + data[index].workouts * value;
                    final cycling = workouts + data[index].cycling * value;
                    return RadarEntry(
                        value:
                            cycling); // Each axis value, cycling in this case
                  }),
                  borderColor: colorPrimary100,
                  fillColor: colorPrimary100.withValues(alpha: 0.4),
                  // titleTextStyle: TextStyle(color: Colors.white), // Corrected from entryTextStyle
                ),
              ],
              titlePositionPercentageOffset: 0.2,
              tickCount: 5, // Number of ticks on each axis
            ),
          ),
        );
      },
    );
  }

  Widget routineLegend() {
    return Obx(() => Wrap(
          spacing: 12,
          runSpacing: 8,
          children: List.generate(controller.routineData.length, (index) {
            final item = controller.routineData[index];
            final isSelected = controller.touchedIndex.value == index;

            return GestureDetector(
              onTap: () => controller.touchedIndex.value = index,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 12,
                    height: 12,
                    decoration: BoxDecoration(
                      color: item.color,
                      shape: BoxShape.circle,
                      border: isSelected
                          ? Border.all(
                              color: themeController.isDarkMode
                                  ? colorWhite
                                  : Colors.black,
                              width: 2)
                          : null,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    "${item.name} (${item.hours}h)",
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight:
                          isSelected ? FontWeight.bold : FontWeight.normal,
                      fontFamily: Styles.fontFamily,
                      color: isSelected
                          ? themeController.isDarkMode
                              ? colorWhite
                              : Colors.black
                          : colorGrey500,
                    ),
                  ),
                ],
              ),
            );
          }),
        ));
  }

  Widget _buildDailyRoutinePieChart() {
    return Obx(() {
      final total = controller.routineData
          .fold<double>(0, (sum, item) => sum + item.hours);

      return SizedBox(
        height: 260,
        child: PieChart(
          PieChartData(
            pieTouchData: PieTouchData(
              touchCallback: (event, response) {
                if (!event.isInterestedForInteractions ||
                    response == null ||
                    response.touchedSection == null) {
                  controller.touchedIndex.value = -1;
                  return;
                }
                controller.touchedIndex.value =
                    response.touchedSection!.touchedSectionIndex;
              },
            ),
            sectionsSpace: 2,
            centerSpaceRadius: 36,
            startDegreeOffset: -90,
            sections: List.generate(controller.routineData.length, (i) {
              final item = controller.routineData[i];
              final isTouched = controller.touchedIndex.value == i;
              final percentage = (item.hours / total) * 100;

              return PieChartSectionData(
                value: item.hours,
                title: "${percentage.toStringAsFixed(1)}%",
                color: item.color,
                radius: isTouched ? 75 : 65,
                titleStyle: TextStyle(
                  fontSize: isTouched ? 14 : 12,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                  fontFamily: Styles.fontFamily,
                ),
              );
            }),
          ),
        ),
      );
    });
  }

  Widget _buildActivityChart() {
    final List<String> months = [
      'JAN',
      'FEB',
      'MAR',
      'APR',
      'MAY',
      'JUN',
      'JUL',
      'AUG',
      'SEP',
      'OCT',
      'NOV',
      'DEC'
    ];

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 800),
      builder: (context, value, child) {
        final barGroups = List.generate(12, (index) {
          final data = controller.monthlyActivity[index];

          final pilates = data.pilates * value;
          final workouts = pilates + data.workouts * value;
          final cycling = workouts + data.cycling * value;

          return BarChartGroupData(
            x: index,
            barRods: [
              BarChartRodData(
                toY: cycling,
                rodStackItems: [
                  BarChartRodStackItem(0, pilates, Colors.deepPurple),
                  BarChartRodStackItem(pilates, workouts, Colors.blueAccent),
                  BarChartRodStackItem(workouts, cycling, Colors.pinkAccent),
                ],
                width: 8,
                borderRadius: BorderRadius.circular(4),
              ),
            ],
          );
        });

        return SizedBox(
          height: 300,
          child: BarChart(
            BarChartData(
              barGroups: barGroups,
              gridData: FlGridData(show: true),
              borderData: FlBorderData(show: false),
              titlesData: FlTitlesData(
                leftTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    interval: 2,
                    reservedSize: 28,
                    getTitlesWidget: (value, _) => Text(
                      '${value.toInt()}',
                      style: TextStyle(
                          color: colorGrey500,
                          fontSize: 10,
                          fontFamily: Styles.fontFamily),
                    ),
                  ),
                ),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 32,
                    getTitlesWidget: (value, _) => Text(
                      months[value.toInt()],
                      style: TextStyle(
                          color: colorGrey500,
                          fontSize: 12,
                          fontFamily: Styles.fontFamily),
                    ),
                  ),
                ),
                rightTitles:
                    AxisTitles(sideTitles: SideTitles(showTitles: false)),
                topTitles:
                    AxisTitles(sideTitles: SideTitles(showTitles: false)),
              ),
              maxY: 15,
            ),
          ),
        );
      },
    );
  }

  Widget transactionStateChart() {
    final barGroups = List.generate(7, (index) {
      return BarChartGroupData(
        x: index,
        barRods: [
          BarChartRodData(
            toY: weeklyTransactions[index].value1.toDouble(),
            color: colorPrimary100,
            width: 12,
            borderRadius: BorderRadius.circular(6),
          ),
          BarChartRodData(
            toY: weeklyTransactions[index].value2.toDouble(),
            color: Colors.amber,
            width: 12,
            borderRadius: BorderRadius.circular(6),
          ),
        ],
        barsSpace: 4,
      );
    });

    return SizedBox(
      // padding: const EdgeInsets.all(16),

      height: 300,
      child: BarChart(
        BarChartData(
          backgroundColor:
              themeController.isDarkMode ? colorGrey700 : Colors.white,
          barGroups: barGroups,
          gridData: FlGridData(show: true),
          borderData: FlBorderData(show: false),
          // <- removes outer border
          titlesData: FlTitlesData(
            leftTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                getTitlesWidget: (value, _) => Text(
                  "${(value ~/ 1000)}K",
                  style: TextStyle(
                      color: colorGrey500,
                      fontSize: 10,
                      fontFamily: Styles.fontFamily),
                ),
                interval: 2000,
                reservedSize: 28,
              ),
            ),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                getTitlesWidget: (value, _) {
                  const days = ['Mn', 'Te', 'Wd', 'Tu', 'Fr', 'St', 'Sn'];
                  return Text(
                    days[value.toInt()],
                    style: TextStyle(
                        color: colorGrey500,
                        fontSize: 12,
                        fontFamily: Styles.fontFamily),
                  );
                },
              ),
            ),
            rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
            topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
          ),
        ),
      ),
    );
  }

  Widget _buildBarChart() {
    final maxY = controller.monthlySales.reduce((a, b) => a > b ? a : b) * 1.2;

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: 1.0),
      duration: const Duration(seconds: 2),
      curve: Curves.easeOut,
      builder: (context, value, child) {
        return SizedBox(
          height: 300,
          child: BarChart(
            BarChartData(
              borderData: FlBorderData(show: false),
              alignment: BarChartAlignment.spaceAround,
              maxY: maxY,
              minY: 0,
              backgroundColor:
                  themeController.isDarkMode ? colorGrey700 : Colors.white,
              barGroups: List.generate(
                controller.monthlySales.length,
                (index) {
                  final double yVal = controller.monthlySales[index] * value;
                  return BarChartGroupData(
                    x: index,
                    barRods: [
                      BarChartRodData(
                        toY: yVal,
                        color: colorPrimary100,
                        width: 12,
                        borderRadius: BorderRadius.circular(10),
                        backDrawRodData: BackgroundBarChartRodData(
                          show: true,
                          toY: maxY,
                          color: colorPrimary100.withValues(alpha: 0.1),
                        ),
                      ),
                    ],
                  );
                },
              ),
              titlesData: FlTitlesData(
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    interval: 1,
                    getTitlesWidget: (value, _) {
                      final int index = value.toInt();
                      if (index < controller.monthLabels.length) {
                        return Text(
                          controller.monthLabels[index],
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(fontSize: 10),
                        );
                      }
                      return const SizedBox.shrink();
                    },
                  ),
                ),
                leftTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    interval: 3000,
                    reservedSize: 42,
                    getTitlesWidget: (value, _) {
                      return Text(
                        "${(value / 1000).toStringAsFixed(0)}K",
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              fontSize: 10,
                              fontWeight: FontWeight.w500,
                              color: colorGrey500,
                            ),
                      );
                    },
                  ),
                ),
                topTitles:
                    AxisTitles(sideTitles: SideTitles(showTitles: false)),
                rightTitles:
                    AxisTitles(sideTitles: SideTitles(showTitles: false)),
              ),
              gridData: FlGridData(show: true),
              barTouchData: BarTouchData(
                enabled: true,
                touchTooltipData: BarTouchTooltipData(
                  getTooltipColor: (_) => Colors.black,
                  getTooltipItem: (group, groupIndex, rod, rodIndex) {
                    return BarTooltipItem(
                      "${controller.monthLabels[group.x]}: ₹${rod.toY.toStringAsFixed(0)}",
                      const TextStyle(color: Colors.white),
                    );
                  },
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildLineChart() {
    final maxY = controller.monthlySales.reduce((a, b) => a > b ? a : b) * 1.2;

    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0, end: 1),
      duration: const Duration(seconds: 2),
      curve: Curves.easeOut,
      builder: (context, value, child) {
        return SizedBox(
          height: 300,
          child: LineChart(
            LineChartData(
              backgroundColor:
                  themeController.isDarkMode ? colorGrey700 : Colors.white,
              minX: 0,
              maxX: 11,
              minY: 0,
              maxY: maxY,
              lineBarsData: [
                LineChartBarData(
                  spots: List.generate(
                    controller.monthlySales.length,
                    (index) {
                      final y = controller.monthlySales[index];
                      return FlSpot(index.toDouble(), y * value);
                    },
                  ),
                  isCurved: true,
                  color: colorPrimary100,
                  barWidth: 4,
                  belowBarData: BarAreaData(
                    show: true,
                    color: colorPrimary100.withValues(alpha: 0.2),
                  ),
                  dotData: FlDotData(show: true),
                ),
              ],
              titlesData: FlTitlesData(
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    getTitlesWidget: (value, _) {
                      int index = value.toInt();
                      return Text(
                        controller.monthLabels[index],
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(fontSize: 10),
                      );
                    },
                    reservedSize: 28,
                    interval: 1,
                  ),
                ),
                leftTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    interval: 3000,
                    reservedSize: 42,
                    getTitlesWidget: (value, _) {
                      return Text(
                        "${(value / 1000).toStringAsFixed(0)}K",
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              fontSize: 10,
                              fontWeight: FontWeight.w500,
                              color: colorGrey500,
                            ),
                        textAlign: TextAlign.right,
                      );
                    },
                  ),
                ),
                topTitles:
                    AxisTitles(sideTitles: SideTitles(showTitles: false)),
                rightTitles:
                    AxisTitles(sideTitles: SideTitles(showTitles: false)),
              ),
              gridData: FlGridData(show: true),
              lineTouchData: LineTouchData(
                touchTooltipData: LineTouchTooltipData(
                  getTooltipColor: (_) => Colors.black,
                  getTooltipItems: (touchedSpots) {
                    return touchedSpots.map((e) {
                      return LineTooltipItem(
                        "${controller.monthLabels[e.x.toInt()]}: ₹${e.y.toStringAsFixed(0)}",
                        const TextStyle(color: Colors.white),
                      );
                    }).toList();
                  },
                ),
              ),
              /*extraLinesData: ExtraLinesData(
                verticalLines: [
                  VerticalLine(
                    x: controller.currentMonthIndex.toDouble(),
                    color: Colors.red,
                    strokeWidth: 2,
                    dashArray: [5, 4],
                    label: VerticalLineLabel(
                      show: true,
                      labelResolver: (_) => "Current",
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.copyWith(color: Colors.red, fontSize: 12),
                    ),
                  ),
                ],
              ),*/
            ),
          ),
        );
      },
    );
  }

  ResponsiveGridCol _commonCard(String title, Widget child) {
    return ResponsiveGridCol(
      xs: 12,
      sm: 12,
      md: 6,
      lg: 6,
      xl: 6,
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
