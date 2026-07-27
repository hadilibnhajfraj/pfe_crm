import 'package:dash_master_toolkit/dashboard/finance/finance_imports.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:syncfusion_flutter_charts/charts.dart';

class CandlesticksChart extends StatelessWidget {
  final List<CandleData> candles;

  const CandlesticksChart({super.key, required this.candles});

  @override
  Widget build(BuildContext context) {
    return SfCartesianChart(
      primaryXAxis: DateTimeAxis(
        labelStyle: Theme.of(context).textTheme.bodySmall?.copyWith(
              fontFamily: GoogleFonts.roboto().fontFamily,
              fontWeight: FontWeight.w400,
              fontSize: 11,
            ),
      ),
      primaryYAxis: NumericAxis(
        labelStyle: Theme.of(context).textTheme.bodySmall?.copyWith(
              fontFamily: GoogleFonts.roboto().fontFamily,
              fontWeight: FontWeight.w400,
              fontSize: 11,
            ),

      ),
      series: <CartesianSeries>[
        // Renders CandleSeries
        CandleSeries<CandleData, DateTime>(
          bearColor: colorFinancePrimary,
          bullColor: colorFinancePrimary2,
          dataSource: candles,
          xValueMapper: (CandleData data, int index) => data.date,
          lowValueMapper: (CandleData data, int index) => data.low,
          highValueMapper: (CandleData data, int index) => data.high,
          openValueMapper: (CandleData data, int index) => data.open,
          closeValueMapper: (CandleData data, int index) => data.close,
        )
      ],
    );
  }
}
