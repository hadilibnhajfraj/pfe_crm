class ArchitectModel {
  final String id;
  final String name;

  const ArchitectModel({
    required this.id,
    required this.name,
  });

  factory ArchitectModel.fromJson(Map<String, dynamic> json) {
    return ArchitectModel(
      id: (json['id'] ?? '').toString().trim(),
      name: (json['name'] ?? '').toString().trim(),
    );
  }

  @override
  String toString() => 'ArchitectModel(id: $id, name: $name)';
}
