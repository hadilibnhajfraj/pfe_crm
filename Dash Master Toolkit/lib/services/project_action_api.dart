// lib/services/project_action_api.dart
//
// Sends a project action to POST /projects/:id/actions.
//
// Content-Type is NOT set manually — ApiClient's interceptor strips any
// stale Content-Type header when the data is FormData, letting Dio generate
// the correct "multipart/form-data; boundary=<uuid>" automatically.
//
// Fields are added via fd.fields.addAll() (MapEntry<String,String>) so
// every field arrives as a proper multipart text part — no null ambiguity.

import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart' as dio;

import '../application/users/model/project_action.dart';
import '../providers/api_client.dart';

class ProjectActionApi {
  static final ProjectActionApi instance = ProjectActionApi._();
  ProjectActionApi._();

  // GET /projects/:id/actions — mirrors the envelope handling used by
  // ProjectTimelineController.loadActions (backend wraps the list as
  // { success: true, data: [...] }, but also tolerates a bare list).
  Future<List<ProjectAction>> getActions(String projectId) async {
    final response = await ApiClient.instance.dio.get(
      '/projects/$projectId/actions',
    );

    final raw = response.data;
    final List dataList;
    if (raw is Map && raw.containsKey('data')) {
      final d = raw['data'];
      dataList = d is List ? d : [];
    } else if (raw is List) {
      dataList = raw;
    } else {
      dataList = [];
    }

    return dataList
        .map((e) => ProjectAction.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<dynamic> createAction({
    required String projectId,
    required String type,
    String? commentaire,
    // ISO-8601 string; must represent a datetime strictly after now.
    String? dateRelance,
    // ISO-8601 string — end of the calendar event (CRM + Google Calendar).
    String? dateFin,
    // 'basse' | 'normale' | 'haute' | 'urgente'
    String? priorite,
    dynamic file, // PlatformFile (web) or File (native)
  }) async {
    dio.MultipartFile? multipartFile;

    if (file != null) {
      if (kIsWeb) {
        if (file.bytes == null) throw Exception('File bytes is null (Web)');
        multipartFile = dio.MultipartFile.fromBytes(
          file.bytes as List<int>,
          filename: file.name as String,
        );
      } else {
        multipartFile = await dio.MultipartFile.fromFile(
          file.path as String,
          filename: (file.path as String).split('/').last,
        );
      }
    }

    // Build FormData with explicit field entries — no FormData.fromMap() so
    // null values can never silently become missing multipart parts.
    final fd = dio.FormData();
    fd.fields.addAll([
      MapEntry('typeAction',        type),
      MapEntry('typeAction_legacy', type),
      MapEntry('firstAction',       type),
      MapEntry('commentaire',       commentaire ?? ''),
      if (dateRelance != null)
        MapEntry('dateRelance',     dateRelance),
      if (dateFin != null)
        MapEntry('dateFin',         dateFin),
      if (priorite != null)
        MapEntry('priorite',        priorite),
    ]);
    if (multipartFile != null) {
      fd.files.add(MapEntry('file', multipartFile));
    }

    // Do NOT pass Options(headers: {'Content-Type': ...}) — the global
    // ApiClient interceptor already handles this correctly for FormData.
    final response = await ApiClient.instance.dio.post(
      '/projects/$projectId/actions',
      data: fd,
    );

    return response.data;
  }

  // POST /projects/:projectId/actions/:id/retry-google-sync — point 11,
  // bouton "Réessayer la synchronisation" affiché quand l'action n'est pas
  // (ou plus) synchronisée avec Google Calendar.
  Future<dynamic> retryGoogleSync({
    required String projectId,
    required String actionId,
  }) async {
    final response = await ApiClient.instance.dio.post(
      '/projects/$projectId/actions/$actionId/retry-google-sync',
    );
    return response.data;
  }
}
