// lib/ai/services/copilot_attachment_service.dart
//
// Sélection locale d'un fichier à joindre au Copilot (file_picker, déjà une
// dépendance du projet). Restreinte aux formats acceptés par le backend et
// lue en mémoire (`withData: true`) : sur le Web il n'existe pas de chemin
// local, seuls les octets peuvent être envoyés. L'envoi lui-même passe par
// CopilotApiService.uploadDocument() (POST /ai-copilot/documents), piloté par
// CopilotController.uploadAttachment().
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:uuid/uuid.dart';

import '../models/copilot_attachment.dart';

class PickedCopilotFile {
  final CopilotAttachment attachment;
  final Uint8List bytes;
  const PickedCopilotFile(this.attachment, this.bytes);
}

class CopilotAttachmentService {
  CopilotAttachmentService._();
  static final CopilotAttachmentService instance = CopilotAttachmentService._();

  Future<PickedCopilotFile?> pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: CopilotAttachmentRules.allowedExtensions,
      withData: true,
    );
    final file = (result == null || result.files.isEmpty) ? null : result.files.first;
    if (file == null) return null;

    final attachment = CopilotAttachment(
      id: const Uuid().v4(),
      fileName: file.name,
      sizeBytes: file.size,
      mimeType: file.extension,
    );
    return PickedCopilotFile(attachment, file.bytes ?? Uint8List(0));
  }
}
