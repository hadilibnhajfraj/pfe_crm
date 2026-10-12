// lib/ai/models/copilot_attachment.dart
//
// Un fichier joint au Copilot (Phase 2 — assistant documentaire). Sélectionné
// localement (file_picker), puis ENVOYÉ à POST /ai-copilot/documents (voir
// Backend Master/src/modules/ai-copilot/routes/aiCopilot.routes.js) qui
// l'indexe dans le RAG et renvoie un `documentId`. Seul cet identifiant est
// ensuite transmis avec le message (`documentIds`) — jamais le contenu.
enum CopilotAttachmentStatus { uploading, ready, error }

class CopilotAttachment {
  final String id;
  final String fileName;
  final int sizeBytes;
  final String? mimeType;
  final String? localPath;
  final CopilotAttachmentStatus status;

  /// Identifiant renvoyé par le backend une fois le document indexé.
  final String? documentId;

  /// Message lisible affiché sur la puce quand `status == error`.
  final String? errorMessage;

  /// Progression RÉELLE de l'envoi (octets transmis / total, 0 → 1), fournie
  /// par Dio (`onSendProgress`) ; `null` tant qu'aucune mesure n'est connue.
  /// À 1, le fichier est transmis et le serveur l'analyse encore.
  final double? progress;

  const CopilotAttachment({
    required this.id,
    required this.fileName,
    required this.sizeBytes,
    this.mimeType,
    this.localPath,
    this.status = CopilotAttachmentStatus.uploading,
    this.documentId,
    this.errorMessage,
    this.progress,
  });

  bool get isUploading => status == CopilotAttachmentStatus.uploading;
  bool get isReady => status == CopilotAttachmentStatus.ready && documentId != null;
  bool get isError => status == CopilotAttachmentStatus.error;

  CopilotAttachment withProgress(double value) => CopilotAttachment(
        id: id,
        fileName: fileName,
        sizeBytes: sizeBytes,
        mimeType: mimeType,
        localPath: localPath,
        status: status,
        documentId: documentId,
        errorMessage: errorMessage,
        progress: value.clamp(0.0, 1.0),
      );

  CopilotAttachment asReady(String documentId) => CopilotAttachment(
        id: id,
        fileName: fileName,
        sizeBytes: sizeBytes,
        mimeType: mimeType,
        localPath: localPath,
        status: CopilotAttachmentStatus.ready,
        documentId: documentId,
      );

  CopilotAttachment asError(String message) => CopilotAttachment(
        id: id,
        fileName: fileName,
        sizeBytes: sizeBytes,
        mimeType: mimeType,
        localPath: localPath,
        status: CopilotAttachmentStatus.error,
        errorMessage: message,
      );

  String get sizeLabel {
    if (sizeBytes < 1024) return '$sizeBytes o';
    if (sizeBytes < 1024 * 1024) return '${(sizeBytes / 1024).toStringAsFixed(1)} Ko';
    return '${(sizeBytes / (1024 * 1024)).toStringAsFixed(1)} Mo';
  }
}

/// Contrôle côté client, AVANT tout envoi — même liste et même plafond que le
/// backend (copilotDocumentValidation.js), qui reste l'autorité : il revérifie
/// extension, type réel (signature) et taille.
class CopilotAttachmentRules {
  CopilotAttachmentRules._();

  // Images : leur texte est lu par OCR côté serveur (comme les PDF scannés).
  static const List<String> allowedExtensions = ['pdf', 'docx', 'xlsx', 'csv', 'txt', 'png', 'jpg', 'jpeg'];
  static const int maxBytes = 10 * 1024 * 1024;
  static const int maxAttachmentsPerMessage = 5;

  static String extensionOf(String fileName) {
    final dot = fileName.lastIndexOf('.');
    if (dot < 0 || dot == fileName.length - 1) return '';
    return fileName.substring(dot + 1).toLowerCase();
  }

  /// `null` si le fichier est acceptable, sinon le message à afficher.
  static String? validate({required String fileName, required int sizeBytes}) {
    if (!allowedExtensions.contains(extensionOf(fileName))) {
      return 'Format non pris en charge. Formats acceptés : PDF, DOCX, XLSX, CSV, TXT, PNG, JPG.';
    }
    if (sizeBytes <= 0) return 'Le fichier est vide.';
    if (sizeBytes > maxBytes) return 'Fichier trop volumineux (10 Mo maximum).';
    return null;
  }
}
