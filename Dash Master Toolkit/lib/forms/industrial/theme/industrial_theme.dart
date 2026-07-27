// lib/forms/industrial/theme/industrial_theme.dart
//
// Design tokens partagés par le module industriel (PROMESH / PROBAR /
// MÉLANGE / MAINTENANCE) — couleurs par module + widgets "carte" à gros
// boutons, pensés pour un public non-informaticien (style SAP Fiori /
// Siemens MES : pas de tableau dense, des cartes visuelles tactiles).

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';

// ── Couleurs par module ──────────────────────────────────────────────────
const Color kPromeshColor = Color(0xFF2563EB);
const Color kProbarColor = Color(0xFFF97316);
const Color kMelangeColor = Color(0xFF10B981);
const Color kMaintenanceColor = Color(0xFFEF4444);
// Couleur dédiée au module Personnel (badges) du parcours PROMESH par cartes.
const Color kPersonnelColor = Color(0xFF8B5CF6);

// ── Tailles "gros boutons" ────────────────────────────────────────────────
const double kIndustrialMinTapHeight = 56.0;
const double kIndustrialMaxContentWidth = 1100.0;

/// Carte d'action large (icône + titre + sous-titre), brique de base de
/// toute la navigation industrielle (machines, postes, fiches). Hover animé
/// (élévation + bordure colorée, 200ms) — coins 24px (style "carte premium").
class BigActionCard extends StatefulWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Color color;
  final VoidCallback onTap;
  final Widget? trailing;

  const BigActionCard({
    super.key,
    required this.icon,
    required this.title,
    required this.color,
    required this.onTap,
    this.subtitle,
    this.trailing,
  });

  @override
  State<BigActionCard> createState() => _BigActionCardState();
}

class _BigActionCardState extends State<BigActionCard> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: AnimatedScale(
        scale: _hover ? 1.02 : 1.0,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
        child: Material(
          color: kCrmSurface,
          borderRadius: BorderRadius.circular(24),
          child: InkWell(
            onTap: widget.onTap,
            borderRadius: BorderRadius.circular(24),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              constraints: const BoxConstraints(minHeight: kIndustrialMinTapHeight + 24),
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: _hover ? widget.color : kCrmBorder, width: _hover ? 1.6 : 1),
                boxShadow: [
                  BoxShadow(
                    color: widget.color.withOpacity(_hover ? 0.20 : 0.08),
                    blurRadius: _hover ? 22 : 14,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: Row(children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: widget.color.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(widget.icon, size: 28, color: widget.color),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                    Text(widget.title,
                        style: tInter(fontSize: 16, fontWeight: FontWeight.w800, color: kCrmText)),
                    if (widget.subtitle != null) ...[
                      const SizedBox(height: 4),
                      Text(widget.subtitle!, style: tInter(fontSize: 12.5, color: kCrmTextSub)),
                    ],
                  ]),
                ),
                if (widget.trailing != null)
                  widget.trailing!
                else
                  Icon(Icons.chevron_right_rounded, size: 26, color: widget.color),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

/// Carte KPI (Dashboard industriel) — gros chiffre + libellé + icône colorée.
class KpiStatCard extends StatelessWidget {
  final IconData icon;
  final String value;
  final String label;
  final Color color;

  const KpiStatCard({
    super.key,
    required this.icon,
    required this.value,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 120),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: kCrmBorder),
        boxShadow: [
          BoxShadow(color: color.withOpacity(0.08), blurRadius: 14, offset: const Offset(0, 6)),
        ],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
          child: Icon(icon, size: 24, color: color),
        ),
        const Spacer(),
        Text(value, style: tInter(fontSize: 26, fontWeight: FontWeight.w900, color: kCrmText)),
        const SizedBox(height: 2),
        Text(label, style: tInter(fontSize: 12.5, fontWeight: FontWeight.w600, color: kCrmTextSub)),
      ]),
    );
  }
}

/// Carte KPI éditable (icône + label + champ numérique) — utilisée par le
/// module Rendement pour saisir des chiffres sans ressembler à un formulaire
/// dense.
class KpiInputCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final TextEditingController controller;
  final Color color;
  final String? suffix;

  const KpiInputCard({
    super.key,
    required this.icon,
    required this.label,
    required this.controller,
    required this.color,
    this.suffix,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: kCrmBorder),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, size: 18, color: color),
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(label, style: tInter(fontSize: 13, fontWeight: FontWeight.w700, color: kCrmTextSub))),
        ]),
        const SizedBox(height: 12),
        TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          style: tInter(fontSize: 22, fontWeight: FontWeight.w900, color: kCrmText),
          decoration: InputDecoration(
            isDense: true,
            border: InputBorder.none,
            hintText: '0',
            suffixText: suffix,
          ),
        ),
      ]),
    );
  }
}

/// Bouton plein-largeur, hauteur minimale 56px — utilisé pour toutes les
/// actions principales (Enregistrer, Nouvelle fiche, etc.).
class IndustrialBigButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback? onTap;
  final bool outlined;

  const IndustrialBigButton({
    super.key,
    required this.label,
    required this.icon,
    required this.color,
    required this.onTap,
    this.outlined = false,
  });

  @override
  Widget build(BuildContext context) {
    if (outlined) {
      return SizedBox(
        height: kIndustrialMinTapHeight,
        child: OutlinedButton.icon(
          onPressed: onTap,
          icon: Icon(icon, size: 20),
          label: Text(label, style: tInter(fontSize: 15, fontWeight: FontWeight.w700)),
          style: OutlinedButton.styleFrom(
            foregroundColor: color,
            side: BorderSide(color: color, width: 1.4),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
      );
    }
    return SizedBox(
      height: kIndustrialMinTapHeight,
      child: ElevatedButton.icon(
        onPressed: onTap,
        icon: Icon(icon, size: 20),
        label: Text(label, style: tInter(fontSize: 15, fontWeight: FontWeight.w700)),
        style: ElevatedButton.styleFrom(
          backgroundColor: color,
          foregroundColor: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
    );
  }
}

/// Chip coloré en lecture seule — affiche par ex. "Machine 2" / "Poste Matin".
class IndustrialInfoChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const IndustrialInfoChip({super.key, required this.icon, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(width: 6),
        Text(label, style: tInter(fontSize: 12, fontWeight: FontWeight.w700, color: color)),
      ]),
    );
  }
}

/// Centre le contenu et le borne à [kIndustrialMaxContentWidth] — garde les
/// écrans lisibles en desktop large tout en restant fluide en tablette.
class IndustrialPageBody extends StatelessWidget {
  final Widget child;
  const IndustrialPageBody({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: kIndustrialMaxContentWidth),
        child: child,
      ),
    );
  }
}
