class ProjectModel {
  final String title;
  final String iconPath;
  final String deliveryDate;
  final int progress;
  final List<String> teamMembers;

  ProjectModel({
    required this.title,
    required this.iconPath,
    required this.deliveryDate,
    required this.progress,
    required this.teamMembers,
  });
}