class CourseItem {
  final String image;
  final String title;
  final String subtitle;
  final List<String> tags;
  final int users;
  final String description;


  CourseItem({
    required this.image,
    required this.title,
    required this.subtitle,
    required this.tags,
    required this.users,
    required this.description,
  });
}
class ColumnItem {
  final String key;
  final String label;

  ColumnItem(this.key, this.label);
}