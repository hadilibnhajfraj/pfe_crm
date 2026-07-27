import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

class MiniBarChart extends StatelessWidget {
  final List<double> values;
  final Color barColor;

  const MiniBarChart({super.key, required this.values, required this.barColor});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      width: 100,
      child: BarChart(
        BarChartData(
          alignment: BarChartAlignment.spaceAround,
          barTouchData: BarTouchData(enabled: false),
          titlesData: FlTitlesData(show: false),
          borderData: FlBorderData(show: false),
          gridData: FlGridData(show: false),
          barGroups: values
              .asMap()
              .entries
              .map(
                (e) => BarChartGroupData(
              x: e.key,
              barRods: [
                BarChartRodData(
                  toY: e.value,
                  color: barColor,
                  width: 6,
                  borderRadius: BorderRadius.circular(2),
                )
              ],
            ),
          )
              .toList(),
        ),
      ),
    );
  }
}
