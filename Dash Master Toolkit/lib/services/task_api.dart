import 'package:dio/dio.dart';
import 'package:dash_master_toolkit/providers/api_client.dart';
import 'package:dash_master_toolkit/application/calendar/model/task_model.dart';
import 'package:dash_master_toolkit/application/calendar/model/project_item.dart';
class TaskApi {
  TaskApi._();
  static final instance = TaskApi._();

  Dio get _dio => ApiClient.instance.dio;

  Future<List<TaskModel>> listTasks({DateTime? from, DateTime? to}) async {
    final res = await _dio.get("/tasks", queryParameters: {
      if (from != null) "from": from.toUtc().toIso8601String(),
      if (to != null) "to": to.toUtc().toIso8601String(),
    });

    final data = res.data;
    if (data is List) {
      return data.map((e) => TaskModel.fromJson(Map<String, dynamic>.from(e))).toList();
    }
    return [];
  }

  Future<TaskModel> createTask({
    required String title,
    required DateTime startAt,
    String? description,
    required String projectId,     // ✅ NEW
  }) async {
    final res = await _dio.post("/tasks", data: {
      "title": title.trim(),
      "description": (description ?? "").trim(),
      "startAt": startAt.toUtc().toIso8601String(),
      "projectId": projectId,     // ✅ NEW
    });

    return TaskModel.fromJson(Map<String, dynamic>.from(res.data));
  }

  Future<TaskModel> updateTask({
    required String id,
    String? title,
    String? description,
    DateTime? startAt,
    String? status,
  }) async {
    final payload = <String, dynamic>{};
    if (title != null) payload["title"] = title.trim();
    if (description != null) payload["description"] = description.trim();
    if (startAt != null) payload["startAt"] = startAt.toUtc().toIso8601String();
    if (status != null) payload["status"] = status;

    final res = await _dio.put("/tasks/$id", data: payload);
    return TaskModel.fromJson(Map<String, dynamic>.from(res.data));
  }

  Future<void> deleteTask({required String id}) async {
    await _dio.delete("/tasks/$id");
  }
  Future<List<ProjectItem>> listMyProjects() async {
  final res = await ApiClient.instance.dio.get("/tasks/my-projects");
  final data = (res.data as List);
  return data.map((e) => ProjectItem.fromJson(e)).toList();
}
}