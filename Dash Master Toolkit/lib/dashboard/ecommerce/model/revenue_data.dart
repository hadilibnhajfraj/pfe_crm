class RevenueData {
  final String month;    // Jan..Dec
  final double earning;  // % validés
  final double expense;  // % réussite moyenne

  RevenueData({
    required this.month,
    required this.earning,
    required this.expense,
  });
}
