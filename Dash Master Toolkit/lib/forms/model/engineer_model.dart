class EngineerModel {
  final String id;
  final String name;

  const EngineerModel({
    required this.id,
    required this.name,
  });

  factory EngineerModel.fromJson(Map<String, dynamic> json) {
    return EngineerModel(
      id: (json['id'] ?? '').toString().trim(),
      name: (json['name'] ?? '').toString().trim(),
    );
  }

  @override
  String toString() => 'EngineerModel(id: $id, name: $name)';
}
