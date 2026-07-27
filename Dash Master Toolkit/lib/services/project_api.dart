// lib/application/services/project_api.dart

import 'package:dio/dio.dart';
import 'package:dash_master_toolkit/application/services/api_client.dart';
import 'package:dash_master_toolkit/application/users/model/project_grid_data.dart';
import 'package:dash_master_toolkit/application/users/model/project_comment_model.dart';

class ProjectApi {
  ProjectApi._();
  static final instance = ProjectApi._();

  Dio get dio => ApiClient.instance.dio;

  Future<List<ProjectGridData>> getProjects({String? userId}) async {
    final queryParams = <String, dynamic>{'page': 1, 'limit': 1000};
    if (userId != null && userId.isNotEmpty) {
      queryParams['userId'] = userId;
      print('USER FILTER = $userId');
    }

    final res = await dio.get('/projects', queryParameters: queryParams);
    final data = res.data;

    print('STATUS = ${res.statusCode}');

    List raw = [];
    if (data is Map) {
      raw = (data['items'] ?? data['data'] ?? data['results'] ?? data['docs'] ?? []) as List;
      final stats = data['stats'];
      if (stats is Map) {
        print('STATS = totalProjects=${stats['totalProjects']}, active=${stats['activeProjects']}, archived=${stats['archivedProjects']}');
      }
    } else if (data is List) {
      raw = data;
    } else {
      print('UNEXPECTED RESPONSE TYPE: ${data.runtimeType}');
    }

    print('API COUNT = ${raw.length}');

    final result = raw
        .map((e) => ProjectGridData.fromJson(Map<String, dynamic>.from(e)))
        .toList();

    print('STATE COUNT = ${result.length}');

    return result;
  }
Future<ProjectGridData> getProjectById(String id) async {
  final res = await dio.get('/projects/$id');
  final data = res.data;

  if (data is Map) {
    return ProjectGridData.fromJson(Map<String, dynamic>.from(data));
  }
  throw Exception("Invalid project response");
}
  Future<void> deleteProject(String id) async {
    await dio.delete('/projects/$id');
  }

  // ✅ ajouter commentaire / réponse
  Future<void> addComment(String projectId, String body,
      {String? parentId}) async {
    await dio.post(
      '/projects/$projectId/comments',
      data: {
        "body": body,
        if (parentId != null && parentId.isNotEmpty) "parentId": parentId,
      },
    );
  }

  // ✅ modifier commentaire
  Future<void> updateComment(String projectId, String commentId, String body) async {
    await dio.put(
      '/projects/$projectId/comments/$commentId',
      data: {"body": body},
    );
  }

  // ✅ supprimer commentaire
  Future<void> deleteComment(String projectId, String commentId) async {
    await dio.delete('/projects/$projectId/comments/$commentId');
  }

  Future<List<ProjectCommentModel>> getComments(String projectId) async {
    final res = await dio.get('/projects/$projectId/comments');
    final data = res.data;

    if (data is List) {
      return data
          .map((e) => ProjectCommentModel.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    }
    return [];
  }
  // Fetch calendar projects with status color coding
  Future<List<ProjectGridData>> getCalendarProjects() async {
    try {
      final response = await dio.get('/calendar');
      final data = response.data;

      if (data is List) {
        return data
            .map((e) => ProjectGridData.fromJson(Map<String, dynamic>.from(e)))
            .toList();
      }
      return [];
    } catch (e) {
      throw Exception('Failed to load calendar projects: $e');
    }
  }
}
