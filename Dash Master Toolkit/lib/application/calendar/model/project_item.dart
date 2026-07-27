class ProjectItem {
  final String id;
  final String nomProjet;

  ProjectItem({required this.id, required this.nomProjet});

  factory ProjectItem.fromJson(Map<String, dynamic> j) =>
      ProjectItem(id: j["id"].toString(), nomProjet: j["nomProjet"].toString());
}