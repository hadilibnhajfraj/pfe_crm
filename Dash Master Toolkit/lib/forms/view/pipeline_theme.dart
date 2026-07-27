import 'package:flutter/material.dart';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SAFE FONT HELPER — uses bundled InterTight, avoids
// google_fonts AssetManifest lookup crash on web/desktop.
// Drop-in replacement for GoogleFonts.inter(...).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TextStyle tInter({
  double? fontSize,
  FontWeight? fontWeight,
  Color? color,
  double? height,
  double? letterSpacing,
  TextDecoration? decoration,
  FontStyle? fontStyle,
}) =>
    TextStyle(
      fontFamily: 'InterTight',
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      height: height,
      letterSpacing: letterSpacing,
      decoration: decoration,
      fontStyle: fontStyle,
    );

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DESIGN TOKENS — CRM Pipeline
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const Color kCrmPrimary   = Color(0xFF6366F1);
const Color kCrmSecondary = Color(0xFF8B5CF6);
const Color kCrmSuccess   = Color(0xFF10B981);
const Color kCrmInfo      = Color(0xFF06B6D4);
const Color kCrmWarning   = Color(0xFFF59E0B);
const Color kCrmDanger    = Color(0xFFEF4444);
const Color kCrmBg        = Color(0xFFF8FAFC);
const Color kCrmSurface   = Color(0xFFFFFFFF);
const Color kCrmBorder    = Color(0xFFE2E8F0);
const Color kCrmText      = Color(0xFF0F172A);
const Color kCrmTextSub   = Color(0xFF64748B);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PIPELINE STAGE MODEL — supports dynamic stages
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class PipelineStage {
  final String id;
  final String label;
  final Color color;
  final IconData icon;
  final int order;
  final bool isSystem;

  const PipelineStage({
    required this.id,
    required this.label,
    required this.color,
    required this.icon,
    required this.order,
    this.isSystem = true,
  });

  PipelineStage copyWith({
    String? label,
    Color? color,
    IconData? icon,
    int? order,
  }) =>
      PipelineStage(
        id: id,
        label: label ?? this.label,
        color: color ?? this.color,
        icon: icon ?? this.icon,
        order: order ?? this.order,
        isSystem: isSystem,
      );
}

final List<PipelineStage> kDefaultPipelineStages = [
  const PipelineStage(
      id: 'Visite',
      label: 'Site Visit',
      color: Color(0xFF6366F1),
      icon: Icons.location_on_rounded,
      order: 0),
  const PipelineStage(
      id: 'Plan technique',
      label: 'Technical Plan',
      color: Color(0xFFF59E0B),
      icon: Icons.architecture_rounded,
      order: 1),
  const PipelineStage(
      id: 'Echantillonnage',
      label: 'Sampling',
      color: Color(0xFFEC4899),
      icon: Icons.science_rounded,
      order: 2),
  const PipelineStage(
      id: 'Devis envoyé',
      label: 'Quote Sent',
      color: Color(0xFF8B5CF6),
      icon: Icons.description_rounded,
      order: 3),
  const PipelineStage(
      id: 'Negociation',
      label: 'Negotiation',
      color: Color(0xFFF97316),
      icon: Icons.handshake_rounded,
      order: 4),
  const PipelineStage(
      id: 'Commande gagnée',
      label: 'Won',
      color: Color(0xFF10B981),
      icon: Icons.emoji_events_rounded,
      order: 5),
  const PipelineStage(
      id: 'Commande perdue',
      label: 'Lost',
      color: Color(0xFFEF4444),
      icon: Icons.cancel_rounded,
      order: 6),
  const PipelineStage(
      id: 'archive-stage',
      label: 'Archivés',
      color: Color(0xFF6B7280),
      icon: Icons.archive_rounded,
      order: 7,
      isSystem: true),
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LEGACY CONSTANTS — kept for backward compatibility
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const List<String> kCrmStages = [
  'Visite',
  'Plan technique',
  'Echantillonnage',
  'Devis envoyé',
  'Negociation',
  'Commande gagnée',
  'Commande perdue',
];

const Map<String, Color> kCrmStageColors = {
  'Visite'          : Color(0xFF6366F1),
  'Plan technique'  : Color(0xFFF59E0B),
  'Echantillonnage' : Color(0xFFEC4899),
  'Devis envoyé'    : Color(0xFF8B5CF6),
  'Negociation'     : Color(0xFFF97316),
  'Commande gagnée' : Color(0xFF10B981),
  'Commande perdue' : Color(0xFFEF4444),
  'archive-stage'   : Color(0xFF6B7280),
};

const Map<String, String> kCrmStageLabels = {
  'Visite'          : 'Site Visit',
  'Plan technique'  : 'Technical Plan',
  'Echantillonnage' : 'Sampling',
  'Devis envoyé'    : 'Quote Sent',
  'Negociation'     : 'Negotiation',
  'Commande gagnée' : 'Won',
  'Commande perdue' : 'Lost',
  'archive-stage'   : 'Archivés',
};

const Map<String, IconData> kCrmStageIcons = {
  'Visite'          : Icons.location_on_rounded,
  'Plan technique'  : Icons.architecture_rounded,
  'Echantillonnage' : Icons.science_rounded,
  'Devis envoyé'    : Icons.description_rounded,
  'Negociation'     : Icons.handshake_rounded,
  'Commande gagnée' : Icons.emoji_events_rounded,
  'Commande perdue' : Icons.cancel_rounded,
  'archive-stage'   : Icons.archive_rounded,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STAGE NORMALIZER — maps action types AND statut values
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
String normalizeStage(String? stage) {
  if (stage == null || stage.trim().isEmpty) return 'Visite';
  final s = stage
      .toLowerCase()
      .trim()
      .replaceAll('é', 'e')
      .replaceAll('è', 'e')
      .replaceAll('â', 'a')
      .replaceAll('ê', 'e')
      .replaceAll('î', 'i')
      .replaceAll('ô', 'o')
      .replaceAll('û', 'u')
      .replaceAll('ç', 'c');

  // ── Exact stage ID matches (fast path) ──────────────────
  if (s == 'visite')            return 'Visite';
  if (s == 'plan technique')    return 'Plan technique';
  if (s == 'echantillonnage')   return 'Echantillonnage';
  if (s == 'devis envoye')      return 'Devis envoyé';
  if (s == 'negociation')       return 'Negociation';
  if (s == 'commande gagnee')   return 'Commande gagnée';
  if (s == 'commande perdue')   return 'Commande perdue';

  // ── Keyword matches (action types + statut values) ───────
  if (s.contains('visite') || s.contains('identif'))               return 'Visite';
  if (s.contains('plan') || s.contains('technique') ||
      s.contains('proposition tech'))                               return 'Plan technique';
  if (s.contains('echant') || s.contains('sampling'))              return 'Echantillonnage';
  if (s.contains('devis') || s.contains('commercial') ||
      s.contains('proposition com'))                                return 'Devis envoyé';
  if (s.contains('nego') || s.contains('negotiat'))                return 'Negociation';
  if (s.contains('gagn') || s.contains('won') ||
      s.contains('livraison') || s.contains('fidelisation') ||
      s.contains('loyal'))                                          return 'Commande gagnée';
  if (s.contains('perd') || s.contains('lost') ||
      s.contains('annul') || s.contains('perdu'))                  return 'Commande perdue';

  return 'Visite';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ACTION HELPERS — icon + color by action type
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IconData kActionIcon(String type) {
  final t = type.toLowerCase();
  if (t.contains('visite'))                      return Icons.location_on_rounded;
  if (t.contains('plan'))                        return Icons.architecture_rounded;
  if (t.contains('echant'))                      return Icons.science_rounded;
  if (t.contains('devis'))                       return Icons.description_rounded;
  if (t.contains('nego'))                        return Icons.handshake_rounded;
  if (t.contains('gagn'))                        return Icons.emoji_events_rounded;
  if (t.contains('perd'))                        return Icons.cancel_rounded;
  if (t.contains('relance') || t.contains('rappel')) return Icons.alarm_rounded;
  if (t.contains('appel'))                       return Icons.call_rounded;
  if (t.contains('réunion') || t.contains('reunion')) return Icons.groups_rounded;
  if (t.contains('maintenance'))                  return Icons.build_rounded;
  if (t.contains('suivi'))                        return Icons.timeline_rounded;
  if (t.contains('démo') || t.contains('demo'))   return Icons.slideshow_rounded;
  if (t.contains('installation'))                 return Icons.settings_suggest_rounded;
  return Icons.bolt_rounded;
}

Color kActionColor(String type) {
  final t = type.toLowerCase();
  if (t.contains('visite'))  return kCrmPrimary;
  if (t.contains('plan'))    return kCrmWarning;
  if (t.contains('echant'))  return const Color(0xFFEC4899);
  if (t.contains('devis'))   return kCrmSecondary;
  if (t.contains('nego'))    return const Color(0xFFF97316);
  if (t.contains('gagn'))    return kCrmSuccess;
  if (t.contains('perd'))    return kCrmDanger;
  if (t.contains('appel'))   return const Color(0xFF06B6D4);
  if (t.contains('réunion') || t.contains('reunion')) return const Color(0xFF8B5CF6);
  if (t.contains('maintenance')) return const Color(0xFF64748B);
  return kCrmInfo;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PALETTE — swatches used in stage color picker
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const List<Color> kStagePalette = [
  Color(0xFF6366F1),
  Color(0xFF8B5CF6),
  Color(0xFF10B981),
  Color(0xFF06B6D4),
  Color(0xFFF59E0B),
  Color(0xFFF97316),
  Color(0xFFEC4899),
  Color(0xFFEF4444),
  Color(0xFF14B8A6),
  Color(0xFF3B82F6),
  Color(0xFF84CC16),
  Color(0xFF6B7280),
];
