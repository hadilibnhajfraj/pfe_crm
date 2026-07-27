
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../constant/app_color.dart';
import '../../../theme/styles.dart';

class WeeklyLineChart extends StatefulWidget {
  const WeeklyLineChart({super.key});

  @override
  State<WeeklyLineChart> createState() => WeeklyLineChartState();
}

class WeeklyLineChartState extends State<WeeklyLineChart> {
  bool showAvg = false;
  ThemeData? theme;

  List<Color> gradientColors = [
    Colors.white.withValues(alpha: 0.100),
    colorPrimary100,
  ];

  @override
  Widget build(BuildContext context) {
    theme = Theme.of(context);

    return Flexible(
      // height: 155,
      child: LineChart(
        showAvg ? avgData() : mainData(),
      ),
    );
  }

  Widget bottomTitleWidgets(double value, TitleMeta meta) {
    String text = "";
    FontWeight fontWeight = FontWeight.w500;
    Color color = Get.isDarkMode ? colorGrey500 : colorGrey400;
    switch (value) {
      case 0:
        text = "Sun";
        break;
      case 5:
        text = "Wed";
        fontWeight = FontWeight.w700; // Bold for Wednesday
        color = Get.isDarkMode ? colorWhite : colorGrey900;
        break;
      case 11:
        text = "Sat";
        break;
      default:
        return Container(); // Hide other titles
    }

    return Text(text,
        textAlign: TextAlign.center,
        style: TextStyle(
            fontWeight: fontWeight,
            color: color,
            fontFamily: Styles.fontFamily,
            fontSize: 14));
    /*return SideTitleWidget(
      meta: meta,
      child: text,
    );*/
  }

  LineChartData mainData() {
    return LineChartData(
      lineTouchData: LineTouchData(
        touchTooltipData: LineTouchTooltipData(
          getTooltipColor: (touchedSpot) =>
              Get.isDarkMode ? colorGrey900 : Colors.white,
          tooltipBorder:
              BorderSide(color: Get.isDarkMode ? colorGrey700 : colorGrey100),
          getTooltipItems: (List<LineBarSpot> touchedSpots) {
            return touchedSpots.map((spot) {
              return LineTooltipItem(
                ' ${spot.y.toInt()} hrs', // Custom text format
                TextStyle(
                  color: Get.isDarkMode ? Colors.white : colorGrey900,
                  // Tooltip text color
                  fontWeight: FontWeight.w500,
                  fontFamily: Styles.fontFamily,
                  fontSize: 12,
                ),
              );
            }).toList();
          },
        ),
        touchSpotThreshold: 10,
        getTouchedSpotIndicator: (barData, spotIndexes) {
          return spotIndexes.map(
            (index) {
              return TouchedSpotIndicatorData(
                FlLine(
                  color: colorPrimary200, // Change vertical line color here
                  strokeWidth: 1,
                  dashArray: [5, 5],
                ),
                FlDotData(show: true),
              );
            },
          ).toList();
        },
      ),
      gridData: FlGridData(
        show: false,
        drawVerticalLine: true,
        horizontalInterval: 1,
        verticalInterval: 1,
        getDrawingHorizontalLine: (value) {
          return FlLine(
            color: Colors.white,
            strokeWidth: 1,
          );
        },
        getDrawingVerticalLine: (value) {
          return FlLine(
            color: Colors.white,
            strokeWidth: 1,
          );
        },
      ),
      titlesData: FlTitlesData(
        show: true,
        rightTitles: const AxisTitles(
          sideTitles: SideTitles(showTitles: false),
        ),
        topTitles: const AxisTitles(
          sideTitles: SideTitles(showTitles: false),
        ),
        bottomTitles: AxisTitles(
          sideTitles: SideTitles(
            showTitles: true,
            reservedSize: 30,
            interval: 1,
            getTitlesWidget: bottomTitleWidgets,
          ),
        ),
        leftTitles: AxisTitles(
          sideTitles: SideTitles(
            showTitles: false,
          ),
        ),
      ),
      borderData: FlBorderData(
        show: false,
        // border: Border.all(color: const Color(0xff37434d)),
      ),
      minX: 0,
      maxX: 11,
      minY: 0,
      maxY: 6,
      lineBarsData: [
        LineChartBarData(
          isStrokeJoinRound: true,
          spots: const [
            FlSpot(0, 3),
            FlSpot(2.6, 2),
            FlSpot(4.9, 5),
            FlSpot(6.8, 3.1),
            FlSpot(8, 4),
            FlSpot(9.5, 3),
            FlSpot(11, 4),
          ],
          isCurved: false,
          color: colorPrimary100,
          barWidth: 2,
          isStrokeCapRound: true,
          dotData: const FlDotData(
            show: false,
          ),
          belowBarData: BarAreaData(
            show: true,
            gradient: LinearGradient(
              colors: gradientColors
                  .map((color) => color.withValues(alpha: 0.15))
                  .toList(),
              stops: [0, 100],
              end: Alignment.topLeft,
              begin: Alignment.bottomLeft,
            ),
          ),
        ),
      ],
    );
  }

  LineChartData avgData() {
    return LineChartData(
      lineTouchData: const LineTouchData(enabled: false),
      gridData: FlGridData(
        show: true,
        drawHorizontalLine: true,
        verticalInterval: 1,
        horizontalInterval: 1,
        getDrawingVerticalLine: (value) {
          return const FlLine(
            color: Color(0xff37434d),
            strokeWidth: 1,
          );
        },
        getDrawingHorizontalLine: (value) {
          return const FlLine(
            color: Color(0xff37434d),
            strokeWidth: 1,
          );
        },
      ),
      titlesData: FlTitlesData(
        show: true,
        bottomTitles: AxisTitles(
          sideTitles: SideTitles(
            showTitles: true,
            reservedSize: 30,
            getTitlesWidget: bottomTitleWidgets,
            interval: 1,
          ),
        ),
        leftTitles: AxisTitles(
          sideTitles: SideTitles(
            showTitles: false,
          ),
        ),
        topTitles: const AxisTitles(
          sideTitles: SideTitles(showTitles: false),
        ),
        rightTitles: const AxisTitles(
          sideTitles: SideTitles(showTitles: false),
        ),
      ),
      borderData: FlBorderData(
        show: true,
        border: Border.all(color: const Color(0xff37434d)),
      ),
      minX: 0,
      maxX: 11,
      minY: 0,
      maxY: 6,
      lineBarsData: [
        LineChartBarData(
          spots: const [
            FlSpot(0, 3.44),
            FlSpot(2.6, 3.44),
            FlSpot(4.9, 3.44),
            FlSpot(6.8, 3.44),
            FlSpot(8, 3.44),
            FlSpot(9.5, 3.44),
            FlSpot(11, 3.44),
          ],
          isCurved: true,
          color: colorPrimary100,
          barWidth: 5,
          isStrokeCapRound: true,
          dotData: const FlDotData(
            show: false,
          ),
          belowBarData: BarAreaData(
            show: true,
            gradient: LinearGradient(
              colors: gradientColors
                  .map((color) => color.withValues(alpha: 0.15))
                  .toList(),
            ),
          ),
        ),
      ],
    );
  }
}
