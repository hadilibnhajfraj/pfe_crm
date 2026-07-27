class ProjectStatsRow {
  final String userId;
  final String displayName;
  final String email;
  final String periodType;
  final String periodLabel;
  final int projectsCount;
  final int totalProjects;

  ProjectStatsRow({
    required this.userId,
    required this.displayName,
    required this.email,
    required this.periodType,
    required this.periodLabel,
    required this.projectsCount,
    required this.totalProjects,
  });
}