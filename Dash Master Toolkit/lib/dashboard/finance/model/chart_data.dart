class ChartData {
  final String interval; // "1H", "3H", etc.
  final List<CandleData> candles;

  ChartData({required this.interval, required this.candles});
}

class CandleData {
  final DateTime date;
  final double open;
  final double high;
  final double low;
  final double close;

  CandleData({
    required this.date,
    required this.open,
    required this.high,
    required this.low,
    required this.close,
  });
}
