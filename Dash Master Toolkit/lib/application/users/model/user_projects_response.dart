import 'user_project_model.dart';

class UserProjectsResponse {
  final int total;
  final int page;
  final int limit;
  final int totalPages;
  final List<UserProjectModel> items;

  UserProjectsResponse({
    required this.total,
    required this.page,
    required this.limit,
    required this.totalPages,
    required this.items,
  });

  factory UserProjectsResponse.fromJson(Map<String, dynamic> json) {
    final itemsJson = (json['items'] as List?) ?? [];

    return UserProjectsResponse(
      total: int.tryParse('${json['total'] ?? 0}') ?? 0,
      page: int.tryParse('${json['page'] ?? 1}') ?? 1,
      limit: int.tryParse('${json['limit'] ?? 10}') ?? 10,
      totalPages: int.tryParse('${json['totalPages'] ?? 1}') ?? 1,
      items: itemsJson
          .map((e) => UserProjectModel.fromJson(
              Map<String, dynamic>.from(e as Map)))
          .toList(),
    );
  }
}