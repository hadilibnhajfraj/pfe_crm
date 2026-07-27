import 'dart:ui';

class CryptoModel {
  final String name;
  final String symbol;
  final String price;
  String? dailyPNL;
  String? percentage;
  Color? chartColor;
  List<double>? chartPoints;
  String? icon;
  double? change; // percentage change
  String? category; // like Meta, Gaming etc.

  CryptoModel({
    required this.name,
    required this.symbol,
    required this.price,
    this.dailyPNL,
    this.percentage,
    this.chartColor,
    this.chartPoints,
    this.icon,
    this.change,
    this.category,
  });
}
