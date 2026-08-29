// lib/ai/models/copilot_attachment.dart
//
// ARCHITECTURE UNIQUEMENT — voir services/copilot_attachment_service.dart.
// Représente un fichier sélectionné localement via file_picker (déjà une
// dépendance du projet) pour être joint à un message. Il n'existe AUCUN
// endpoint backend pour recevoir une pièce jointe aujourd'hui (aucune route
// `/ai-copilot/*` n'accepte de fichier) — ce modèle et le bouton associé
// existent pour que l'UI/le contrat soient prêts le jour où cet endpoint
// sera construit, sans qu'aucun widget n'ait à changer.
class CopilotAttachment {
  final String id;
  final String fileName;
  final int sizeBytes;
  final String? mimeType;
  final String? localPath;

  const CopilotAttachment({
    required this.id,
    required this.fileName,
    required this.sizeBytes,
    this.mimeType,
    this.localPath,
  });

  String get sizeLabel {
    if (sizeBytes < 1024) return '$sizeBytes o';
    if (sizeBytes < 1024 * 1024) return '${(sizeBytes / 1024).toStringAsFixed(1)} Ko';
    return '${(sizeBytes / (1024 * 1024)).toStringAsFixed(1)} Mo';
  }
}
