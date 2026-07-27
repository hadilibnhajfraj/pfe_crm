import 'dart:typed_data';
import 'package:dio/dio.dart';
import '../providers/api_client.dart';

class DevisApi {
  DevisApi._();
  static final instance = DevisApi._();

  Dio get _dio => ApiClient.instance.dio;

  // ✅ GET project
  Future<Map<String, dynamic>> getProject({required String projectId}) async {
    final res = await _dio.get("/projects/$projectId");
    return Map<String, dynamic>.from(res.data);
  }

  // ✅ GET devis list by project
  Future<List<Map<String, dynamic>>> getDevisList({required String projectId}) async {
    final res = await _dio.get("/projects/$projectId/devis");
    final data = res.data;

    if (data == null) return [];
    if (data is List) return data.map((e) => Map<String, dynamic>.from(e)).toList();
    if (data is Map) return [Map<String, dynamic>.from(data)];
    return [];
  }

  // ✅ ✅ WRAPPER (pour ton UI)
  Future<List<Map<String, dynamic>>> listDevis({required String projectId}) {
    return getDevisList(projectId: projectId);
  }

  // ✅ MULTI UPLOAD
  Future<Response> uploadDevisMany({
    required String projectId,
    required String nomDevis,
    required List<Uint8List> filesBytes,
    required List<String> filenames,
  }) async {
    final formData = FormData();
    formData.fields.add(MapEntry("nomDevis", nomDevis));

    for (int i = 0; i < filesBytes.length; i++) {
      formData.files.add(
        MapEntry(
          "files",
          MultipartFile.fromBytes(filesBytes[i], filename: filenames[i]),
        ),
      );
    }

    return _dio.post("/projects/$projectId/devis", data: formData);
  }

  // ✅ ✅ WRAPPER (pour ton UI)
  Future<Response> uploadDevis({
    required String projectId,
    required String nomDevis,
    required List<Uint8List> filesBytes,
    required List<String> filenames,
  }) {
    return uploadDevisMany(
      projectId: projectId,
      nomDevis: nomDevis,
      filesBytes: filesBytes,
      filenames: filenames,
    );
  }

  // ✅ UPDATE devis (needs devisId)
  Future<Response> updateDevis({
    required String projectId,
    required String devisId,
    required String nomDevis,
    Uint8List? bytes,
    String? filename,
  }) async {
    final formData = FormData();
    formData.fields.add(MapEntry("nomDevis", nomDevis));

    if (bytes != null && filename != null) {
      formData.files.add(
        MapEntry("file", MultipartFile.fromBytes(bytes, filename: filename)),
      );
    }

    return _dio.put("/projects/$projectId/devis/$devisId", data: formData);
  }

  // ✅ Update matricule project
  Future<Response> updateMatricule({
    required String projectId,
    required String matriculeFiscale,
  }) {
    return _dio.put("/projects/$projectId", data: {
      "matriculeFiscale": matriculeFiscale,
    });
  }
  Future<void> deleteDevis({
  required String projectId,
  required String devisId,
}) async {
  await _dio.delete("/projects/$projectId/devis/$devisId");
}
}