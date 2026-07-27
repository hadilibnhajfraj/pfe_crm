import 'dart:typed_data';
import 'package:dio/dio.dart';
import '../providers/api_client.dart';

class BonDeCommandeApi {
  BonDeCommandeApi._();
  static final instance = BonDeCommandeApi._();

  Dio get _dio => ApiClient.instance.dio;

  // ✅ GET project (si tu en as besoin)
  Future<Map<String, dynamic>> getProject({required String projectId}) async {
    final res = await _dio.get("/projects/$projectId");
    return Map<String, dynamic>.from(res.data);
  }

  // ✅ GET bon de commande list by project
  Future<List<Map<String, dynamic>>> getBonDeCommandeList({required String projectId}) async {
    final res = await _dio.get("/projects/$projectId/bondecommande");
    final data = res.data;

    if (data == null) return [];
    if (data is List) return data.map((e) => Map<String, dynamic>.from(e)).toList();
    if (data is Map) return [Map<String, dynamic>.from(data)];
    return [];
  }

  // ✅ wrapper UI
  Future<List<Map<String, dynamic>>> listBonDeCommande({required String projectId}) {
    return getBonDeCommandeList(projectId: projectId);
  }

  // ✅ MULTI UPLOAD
  // backend expects: nomBonDeCommande + files[]
  Future<Response> uploadBonDeCommandeMany({
    required String projectId,
    required String nomBonDeCommande,
    required List<Uint8List> filesBytes,
    required List<String> filenames,
  }) async {
    final formData = FormData();
    formData.fields.add(MapEntry("nomBonDeCommande", nomBonDeCommande));

    for (int i = 0; i < filesBytes.length; i++) {
      formData.files.add(
        MapEntry(
          "files",
          MultipartFile.fromBytes(filesBytes[i], filename: filenames[i]),
        ),
      );
    }

    return _dio.post("/projects/$projectId/bondecommande", data: formData);
  }

  // ✅ wrapper UI
  Future<Response> uploadBonDeCommande({
    required String projectId,
    required String nomBonDeCommande,
    required List<Uint8List> filesBytes,
    required List<String> filenames,
  }) {
    return uploadBonDeCommandeMany(
      projectId: projectId,
      nomBonDeCommande: nomBonDeCommande,
      filesBytes: filesBytes,
      filenames: filenames,
    );
  }

  // ✅ UPDATE (needs bdcId)
  Future<Response> updateBonDeCommande({
    required String projectId,
    required String bdcId,
    required String nomBonDeCommande,
    Uint8List? bytes,
    String? filename,
  }) async {
    final formData = FormData();
    formData.fields.add(MapEntry("nomBonDeCommande", nomBonDeCommande));

    if (bytes != null && filename != null) {
      formData.files.add(
        MapEntry("file", MultipartFile.fromBytes(bytes, filename: filename)),
      );
    }

    return _dio.put("/projects/$projectId/bondecommande/$bdcId", data: formData);
  }

  // ✅ DELETE
  Future<void> deleteBonDeCommande({
    required String projectId,
    required String bdcId,
  }) async {
    await _dio.delete("/projects/$projectId/bondecommande/$bdcId");
  }
}