// lib/ai/widgets/copilot_attachment_preview.dart
//
// Aperçu d'un fichier joint au Copilot, au-dessus de la barre de saisie :
// badge du type (PDF, DOCX, XLSX, CSV, TXT), nom, taille, et état réel :
//
// - envoi     : barre de progression RÉELLE (octets transmis, Dio) puis
//               « Analyse du document… » une fois le fichier transmis ;
// - prêt      : coche verte, le document partira avec le prochain message ;
// - erreur    : message exact (validation locale ou refus du serveur).
//
// Le bouton ✕ retire le fichier (et le supprime côté serveur s'il était déjà
// indexé — voir CopilotController.removeAttachment).
import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/theme/styles.dart';

import '../models/copilot_attachment.dart';
import '../theme/copilot_colors.dart';

class CopilotFileVisual {
  const CopilotFileVisual(this.label, this.icon, this.color);
  final String label;
  final IconData icon;
  final Color color;
}

CopilotFileVisual copilotFileVisualFor(String fileName) {
  switch (CopilotAttachmentRules.extensionOf(fileName)) {
    case 'pdf':
      return const CopilotFileVisual('PDF', Icons.picture_as_pdf_rounded, Color(0xFFDF1C41));
    case 'docx':
      return const CopilotFileVisual('DOCX', Icons.article_rounded, Color(0xFF1573FE));
    case 'xlsx':
      return const CopilotFileVisual('XLSX', Icons.grid_on_rounded, Color(0xFF388E3C));
    case 'csv':
      return const CopilotFileVisual('CSV', Icons.table_rows_rounded, Color(0xFF116B97));
    case 'txt':
      return const CopilotFileVisual('TXT', Icons.notes_rounded, Color(0xFF6B7280));
    default:
      return const CopilotFileVisual('FICHIER', Icons.insert_drive_file_rounded, Color(0xFF6B7280));
  }
}

class CopilotAttachmentPreview extends StatelessWidget {
  const CopilotAttachmentPreview({super.key, required this.attachment, required this.isDark, required this.onRemove});

  final CopilotAttachment attachment;
  final bool isDark;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final a = attachment;
    final visual = copilotFileVisualFor(a.fileName);
    final muted = CopilotColors.mutedText(isDark);

    final String statusText;
    final Color statusColor;
    if (a.isError) {
      statusText = a.errorMessage ?? "L'envoi du document a échoué.";
      statusColor = CopilotColors.errorText(isDark);
    } else if (a.isReady) {
      statusText = '${a.sizeLabel} · prêt à être analysé';
      statusColor = CopilotColors.success(isDark);
    } else if (a.progress != null && a.progress! < 1) {
      statusText = '${a.sizeLabel} · envoi ${(a.progress! * 100).round()} %';
      statusColor = muted;
    } else {
      statusText = a.progress == null ? '${a.sizeLabel} · envoi…' : 'Analyse du document…';
      statusColor = muted;
    }

    return Semantics(
      label: 'Fichier joint ${a.fileName}, $statusText',
      child: Container(
        key: ValueKey('copilot-attachment-${a.id}'),
        width: 250,
        padding: const EdgeInsets.fromLTRB(10, 8, 4, 8),
        decoration: BoxDecoration(
          color: a.isError ? CopilotColors.errorBackground(isDark) : CopilotColors.surface(isDark),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: a.isError ? CopilotColors.errorBorder(isDark) : CopilotColors.border(isDark)),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(color: visual.color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
              // FittedBox : le badge ne déborde jamais, quelle que soit la
              // police ou le facteur d'échelle du texte de l'utilisateur.
              child: FittedBox(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(visual.icon, size: 16, color: visual.color),
                    Text(visual.label, style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 7.5, fontWeight: FontWeight.w800, color: visual.color)),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    a.fileName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 12.5, fontWeight: FontWeight.w600, color: isDark ? Colors.white : const Color(0xFF15161E)),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      if (a.isReady) ...[Icon(Icons.check_circle_rounded, size: 12, color: statusColor), const SizedBox(width: 4)],
                      if (a.isError) ...[Icon(Icons.error_outline_rounded, size: 12, color: statusColor), const SizedBox(width: 4)],
                      Expanded(
                        child: Tooltip(
                          message: statusText,
                          child: Text(statusText, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 11, color: statusColor)),
                        ),
                      ),
                    ],
                  ),
                  if (a.isUploading) ...[
                    const SizedBox(height: 5),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        minHeight: 4,
                        // Indéterminée tant qu'aucune mesure réelle n'existe, ou
                        // pendant l'analyse serveur (fichier entièrement transmis).
                        value: (a.progress == null || a.progress! >= 1) ? null : a.progress,
                        backgroundColor: CopilotColors.border(isDark),
                        color: CopilotColors.orbGradient.first,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            IconButton(
              tooltip: 'Retirer le fichier',
              visualDensity: VisualDensity.compact,
              icon: Icon(Icons.close_rounded, size: 16, color: muted),
              onPressed: onRemove,
            ),
          ],
        ),
      ),
    );
  }
}
