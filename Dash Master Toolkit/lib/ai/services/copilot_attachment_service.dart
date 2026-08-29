// lib/ai/services/copilot_attachment_service.dart
//
// La sélection locale d'un fichier EST réelle (file_picker est déjà une
// dépendance du projet, réutilisée telle quelle — voir pubspec.yaml).
// L'ENVOI au backend ne l'est pas : aucune route `/ai-copilot/*` n'accepte
// de pièce jointe aujourd'hui (voir AI_COPILOT_HTTP.md) — `upload()` lève
// délibérément `UnimplementedError` avec un message explicite plutôt que de
// simuler un succès, pour qu'aucune démonstration ne prétende à tort qu'un
// fichier a été transmis au Copilot.
import 'package:file_picker/file_picker.dart';
import 'package:uuid/uuid.dart';

import '../models/copilot_attachment.dart';

class CopilotAttachmentService {
  CopilotAttachmentService._();
  static final CopilotAttachmentService instance = CopilotAttachmentService._();

  Future<CopilotAttachment?> pickFile() async {
    final result = await FilePicker.platform.pickFiles(withData: false);
    final file = result?.files.firstOrNull;
    if (file == null) return null;

    return CopilotAttachment(
      id: const Uuid().v4(),
      fileName: file.name,
      sizeBytes: file.size,
      mimeType: file.extension,
      localPath: file.path,
    );
  }

  /// Voir le commentaire d'en-tête : aucun endpoint réel n'existe encore.
  Future<void> upload(CopilotAttachment attachment) {
    throw UnimplementedError(
      "L'envoi de pièces jointes au Copilot n'est pas encore pris en charge côté serveur — voir AI_COPILOT_HTTP.md.",
    );
  }
}

extension _FirstOrNull<T> on List<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
