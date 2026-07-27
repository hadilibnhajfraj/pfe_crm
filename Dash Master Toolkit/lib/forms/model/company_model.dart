class CompanyModel {
  final String id;
  final String name;

  const CompanyModel({
    required this.id,
    required this.name,
  });

  factory CompanyModel.fromJson(Map<String, dynamic> json) {
    return CompanyModel(
      id: (json['id'] ?? '').toString().trim(),
      name: (json['name'] ?? '').toString().trim(),
    );
  }

  @override
  String toString() => 'CompanyModel(id: $id, name: $name)';
}
