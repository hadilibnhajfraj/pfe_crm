// lib/forms/por_promesh/view/detail/detail_actions_bar.dart
//
// Barre d'actions fixe en bas de l'écran Détail — même emplacement/
// comportement que le pied de page Enregistrer/Suivant de `ModuleScaffold`
// (jamais de contenu caché dessous, toujours visible). Conserve les 5
// actions existantes (Modifier/Imprimer/Export PDF/Export Excel/Supprimer)
// et ajoute "Retour" demandé par la refonte — aucune fonctionnalité
// retirée.

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class DetailActionsBar extends StatelessWidget {
  final bool isLocked;
  final VoidCallback onBack;
  final VoidCallback? onEdit;
  final VoidCallback onPrint;
  final VoidCallback onExportPdf;
  final VoidCallback onExportExcel;
  final VoidCallback? onDelete;

  const DetailActionsBar({
    super.key,
    required this.isLocked,
    required this.onBack,
    required this.onEdit,
    required this.onPrint,
    required this.onExportPdf,
    required this.onExportExcel,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: BoxDecoration(
        color: kCrmSurface,
        border: Border(top: BorderSide(color: kCrmBorder)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 12, offset: const Offset(0, -3))],
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [
          _ActionButton(label: 'Retour', icon: Icons.arrow_back_rounded, color: kCrmTextSub, onTap: onBack),
          const SizedBox(width: 8),
          _ActionButton(label: 'Modifier', icon: Icons.edit_outlined, color: kCrmInfo, onTap: onEdit),
          const SizedBox(width: 8),
          _ActionButton(label: 'Imprimer', icon: Icons.print_outlined, color: kCrmTextSub, onTap: onPrint),
          const SizedBox(width: 8),
          _ActionButton(label: 'Export PDF', icon: Icons.picture_as_pdf_outlined, color: kCrmSecondary, onTap: onExportPdf),
          const SizedBox(width: 8),
          _ActionButton(label: 'Export Excel', icon: Icons.grid_on_rounded, color: kCrmSuccess, onTap: onExportExcel),
          const SizedBox(width: 8),
          _ActionButton(label: 'Supprimer', icon: Icons.delete_outline_rounded, color: kCrmDanger, onTap: onDelete),
        ]),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback? onTap;

  const _ActionButton({required this.label, required this.icon, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final disabled = onTap == null;
    final effectiveColor = disabled ? kCrmBorder : color;
    return OutlinedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 15, color: effectiveColor),
      label: Text(AppLocalizations.of(context).translate(label),
          style: tInter(fontSize: 12, fontWeight: FontWeight.w700, color: effectiveColor)),
      style: OutlinedButton.styleFrom(
        side: BorderSide(color: effectiveColor.withOpacity(0.4)),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        backgroundColor: effectiveColor.withOpacity(0.06),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        minimumSize: Size.zero,
      ),
    );
  }
}
