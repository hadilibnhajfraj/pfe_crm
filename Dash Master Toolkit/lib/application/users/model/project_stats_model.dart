class DailyStat {
  final String day;
  final int projectsCount;

  DailyStat({
    required this.day,
    required this.projectsCount,
  });

  factory DailyStat.fromJson(Map<String, dynamic> json) {
    return DailyStat(
      day: (json['day'] ?? '').toString(),
      projectsCount: int.tryParse(json['projectsCount'].toString()) ?? 0,
    );
  }
}

class WeeklyStat {
  final String weekStart;
  final int projectsCount;

  WeeklyStat({
    required this.weekStart,
    required this.projectsCount,
  });

  factory WeeklyStat.fromJson(Map<String, dynamic> json) {
    return WeeklyStat(
      weekStart: (json['weekStart'] ?? '').toString(),
      projectsCount: int.tryParse(json['projectsCount'].toString()) ?? 0,
    );
  }
}

class MonthlyStat {
  final String month;
  final int projectsCount;

  MonthlyStat({
    required this.month,
    required this.projectsCount,
  });

  factory MonthlyStat.fromJson(Map<String, dynamic> json) {
    return MonthlyStat(
      month: (json['month'] ?? '').toString(),
      projectsCount: int.tryParse(json['projectsCount'].toString()) ?? 0,
    );
  }
}

class UserProjectSummary {
  final String userId;
  final String email;
  final String displayName;
  final int totalProjects;
  final List<DailyStat> daily;
  final List<WeeklyStat> weekly;
  final List<MonthlyStat> monthly;

  UserProjectSummary({
    required this.userId,
    required this.email,
    required this.displayName,
    required this.totalProjects,
    required this.daily,
    required this.weekly,
    required this.monthly,
  });

  factory UserProjectSummary.fromJson(Map<String, dynamic> json) {
    return UserProjectSummary(
      userId: (json['userId'] ?? '').toString(),
      email: (json['email'] ?? '').toString(),
      displayName: (json['displayName'] ?? '').toString(),
      totalProjects: int.tryParse(json['totalProjects'].toString()) ?? 0,
      daily: (json['daily'] as List? ?? [])
          .map((e) => DailyStat.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      weekly: (json['weekly'] as List? ?? [])
          .map((e) => WeeklyStat.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      monthly: (json['monthly'] as List? ?? [])
          .map((e) => MonthlyStat.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
    );
  }
}