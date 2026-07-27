import 'dart:math';

import 'package:dash_master_toolkit/dashboard/finance/finance_imports.dart';

class FinanceDashboardController extends GetxController {
  ThemeController themeController = Get.put(ThemeController());
  TextEditingController searchController = TextEditingController();
  FocusNode f1 = FocusNode();

  RxDouble totalBalance = 259010.41.obs;
  RxDouble todayProfitOrLoss = 1521.41.obs;
  RxInt profitOrLossPercentage = 810.obs;
  RxBool isProfit = true.obs;

  var cryptoList = <CryptoModel>[
    CryptoModel(
      name: "Ethereum",
      symbol: "ETHUSDT",
      price: "\$23,738",
      dailyPNL: "+\$189.91",
      percentage: "+24.68%",
      chartColor: Colors.purple,
      chartPoints: [3, 4, 3.5, 5, 4.2, 6],
      icon:
          'https://media.imperiathemes.com/images/finanace/heMFWZ0wLUrg680b54ad2f731.png',
    ),
    CryptoModel(
      name: "Solana",
      symbol: "SOLUSDT",
      price: "\$23,738",
      dailyPNL: "+\$556.14",
      percentage: "+64.11%",
      chartColor: Colors.pink,
      chartPoints: [4, 4.1, 3.9, 4.4, 4.2],
      icon:
          'https://media.imperiathemes.com/images/finanace/hLuAvYgn8U9e680b54ad2fcd7.png',
    ),
    CryptoModel(
      name: "Bitcoin",
      symbol: "BTCUSDT",
      price: "\$23,738",
      dailyPNL: "-\$16.78",
      percentage: "+14.67%",
      chartColor: Colors.orange,
      chartPoints: [5, 5.2, 5.1, 5.4, 5.6],
      icon:
          'https://media.imperiathemes.com/images/finanace/KKSRknUYfx2Z680b54ad2e8c6.png',
    ),
    CryptoModel(
      name: "Bitcoin",
      symbol: "BTCUSDT",
      price: "\$721.6",
      dailyPNL: "+\$25.78",
      percentage: "+14.67%",
      chartColor: Colors.blue,
      chartPoints: [2, 2.2, 2.5, 2.3, 2.7],
      icon:
          'https://media.imperiathemes.com/images/finanace/LyAwuUXuQLDR680b54ad2efb7.png',
    ),
  ].obs;


  final marketDataCategory = ["All", "Meta", "Gaming"];
  var selectedDataCategory = "All".obs;

  void changeMarketData(String category) {
    selectedDataCategory.value = category;
  }


  final markets = <CryptoModel>[
    CryptoModel(symbol: "BTCUSDT", name: "Bitcoin", price: "23495", change: 23.4, category: "Meta"),
    CryptoModel(symbol: "AUSUDT", name: "Axie Infini", price: "15.95", change: -8.9, category: "Gaming"),
    CryptoModel(symbol: "ETHUSDT", name: "Ethereum", price: "12.95", change: 1.5, category: "Meta"),
    CryptoModel(symbol: "SOLUSDT", name: "Solana", price: "15.95", change: -4.5, category: "Gaming"),
    CryptoModel(symbol: "BNBUSD", name: "Binance", price: "15.95", change: 8.9, category: "Meta"),
    CryptoModel(symbol: "ADAUSFT", name: "Cardano", price: "15.95", change: -12.2, category: "Gaming"),
    CryptoModel(symbol: "AUSUDT", name: "Axie Infini", price: "15.95", change: -9.8, category: "Gaming"),
    CryptoModel(symbol: "ETHUSDT", name: "Ethereum", price: "12.95", change: 1.5, category: "Meta"),
  ].obs;

  List<CryptoModel> get filteredMarkets {
    if (selectedDataCategory.value == 'All') {
      return markets;
    } else {
      return markets.where((e) => e.category == selectedDataCategory.value).toList();
    }
  }


  final intervals = ["1H", "3H", "5H", "1D", "1W", "1M"];
  var selectedInterval = "1H".obs;
  RxList<CandleData> candleData = <CandleData>[].obs;
  RxBool isLoading = false.obs;  // Loading state variable

  @override
  void onInit() {
    super.onInit();
    changeInterval(selectedInterval.value);
  }

  void changeInterval(String interval) {
    isLoading.value = true;  // Set loading state to true
    selectedInterval.value = interval;
    fetchCandleData(interval);
  }

  void fetchCandleData(String interval) async {

    await Future.delayed(Duration(milliseconds: 300));
    final data = generateDummyData(interval);
    candleData.value = data;
    isLoading.value = false;  // Set loading state to false
  }

  List<CandleData> generateDummyData(String interval) {
    final now = DateTime.now();
    final List<CandleData> list = [];

    for (int i = 0; i < 20; i++) {
      final time = now.subtract(Duration(hours: i * 3));
      final open = 20000 + Random().nextInt(3000);
      final close = open + Random().nextInt(1000) - 500;
      final high = max(open, close) + Random().nextInt(500);
      final low = min(open, close) - Random().nextInt(500);

      // Check for valid data (no NaN or Infinity values)
      if (open.isFinite && close.isFinite && high.isFinite && low.isFinite) {
        list.add(CandleData(
          date: time,
          open: open.toDouble(),
          high: high.toDouble(),
          low: low.toDouble(),
          close: close.toDouble(),
        ));
      } else {
        // Handle invalid data (fallback values or skip)
        print(
            "Invalid data detected, skipping candle: open=$open, close=$close, high=$high, low=$low");
      }
    }

    return list.reversed.toList();
  }
}
