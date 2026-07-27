class KPIModel {
  final List userStats;
  final List statutStats;

  KPIModel({required this.userStats, required this.statutStats});

  factory KPIModel.fromJson(Map<String, dynamic> json) {
    return KPIModel(
      userStats: json["userStats"] ?? [],
      statutStats: json["statutStats"] ?? [],
    );
  }
}