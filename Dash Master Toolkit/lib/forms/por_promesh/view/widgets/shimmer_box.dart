// lib/forms/por_promesh/view/widgets/shimmer_box.dart
//
// Skeleton loader réutilisable — pulsation de couleur (sans dépendance
// pubspec supplémentaire) utilisée par tous les écrans du module PROMESH
// pendant le chargement des données, à la place des écrans blancs/spinners
// plein écran. Le layout (header, boutons) reste toujours visible ; seul le
// contenu encore en chargement est remplacé par ces placeholders.

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';

/// Bloc rectangulaire qui pulse entre deux gris — brique de base de tous les
/// skeletons ci-dessous.
class ShimmerBox extends StatefulWidget {
  final double? width;
  final double height;
  final BorderRadius borderRadius;

  const ShimmerBox({
    super.key,
    this.width,
    this.height = 16,
    this.borderRadius = const BorderRadius.all(Radius.circular(8)),
  });

  @override
  State<ShimmerBox> createState() => _ShimmerBoxState();
}

class _ShimmerBoxState extends State<ShimmerBox> with SingleTickerProviderStateMixin {
  late final AnimationController _controller =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..repeat(reverse: true);
  late final Animation<Color?> _color = ColorTween(
    begin: kCrmBorder.withOpacity(0.5),
    end: kCrmBorder.withOpacity(0.15),
  ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _color,
      builder: (context, _) => Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(color: _color.value, borderRadius: widget.borderRadius),
      ),
    );
  }
}

/// Skeleton d'une grille de cartes KPI (Dashboard du poste).
class KpiSkeletonGrid extends StatelessWidget {
  final int count;
  final int crossAxisCount;

  const KpiSkeletonGrid({super.key, this.count = 6, this.crossAxisCount = 3});

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: crossAxisCount,
      mainAxisSpacing: 14,
      crossAxisSpacing: 14,
      childAspectRatio: 1.6,
      children: List.generate(
        count,
        (_) => Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: kCrmSurface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: kCrmBorder),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const ShimmerBox(width: 44, height: 44, borderRadius: BorderRadius.all(Radius.circular(12))),
            const Spacer(),
            const ShimmerBox(width: 70, height: 22),
            const SizedBox(height: 6),
            const ShimmerBox(width: 100, height: 12),
          ]),
        ),
      ),
    );
  }
}

/// Skeleton d'un graphique (bar/pie/line) — un simple bloc occupant la zone
/// du graphique réel.
class ChartSkeleton extends StatelessWidget {
  const ChartSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(child: ShimmerBox(width: double.infinity, height: 160, borderRadius: BorderRadius.all(Radius.circular(12))));
  }
}

/// Skeleton d'une liste de cartes-fiche (Dashboard du poste / Historique).
class FicheCardSkeletonList extends StatelessWidget {
  final int count;
  const FicheCardSkeletonList({super.key, this.count = 3});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(
        count,
        (_) => Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: kCrmSurface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: kCrmBorder),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const ShimmerBox(width: 90, height: 12),
              const SizedBox(width: 16),
              const ShimmerBox(width: 70, height: 12),
              const SizedBox(width: 16),
              const ShimmerBox(width: 60, height: 12),
            ]),
            const SizedBox(height: 12),
            const ShimmerBox(width: 140, height: 18, borderRadius: BorderRadius.all(Radius.circular(20))),
          ]),
        ),
      ),
    );
  }
}

/// Skeleton d'un formulaire (Informations générales) — quelques champs
/// simulés (label + champ).
class FormFieldSkeleton extends StatelessWidget {
  const FormFieldSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      for (int i = 0; i < 3; i++)
        Padding(
          padding: const EdgeInsets.only(bottom: 18),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const ShimmerBox(width: 100, height: 12),
            const SizedBox(height: 8),
            const ShimmerBox(width: double.infinity, height: 48, borderRadius: BorderRadius.all(Radius.circular(10))),
          ]),
        ),
    ]);
  }
}

/// Skeleton générique pour le contenu d'un écran-module (ModuleScaffold) —
/// une grande carte + quelques lignes, sans présumer de la forme exacte du
/// contenu réel (chaque module a une mise en page différente).
class ModuleContentSkeleton extends StatelessWidget {
  const ModuleContentSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      ShimmerBox(width: double.infinity, height: 140, borderRadius: BorderRadius.circular(20)),
      const SizedBox(height: 16),
      const ShimmerBox(width: double.infinity, height: 16),
      const SizedBox(height: 10),
      const ShimmerBox(width: 220, height: 16),
    ]);
  }
}
