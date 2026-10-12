// lib/forms/production/view/production_fiche_screen.dart
//
// Fiche d'une production (PROMESH ou PROBAR) en lecture seule, structurée en
// quatre blocs : Identification / Données de production / Résumé /
// Traçabilité (GET /production/fiches/:line/:id).
//
// La saisie et la validation restent dans les écrans existants : « Modifier »
// ouvre le parcours par modules, « Fiche complète » l'écran de détail
// d'origine (contrôles, personnel, non-conformités, pièces jointes…).

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';

import '../model/production_models.dart';
import '../service/production_service.dart';
import 'production_line_screen.dart' show productionEditRoute;
import 'widgets/production_widgets.dart';

class ProductionFicheScreen extends StatefulWidget {
  final String line;
  final String id;

  const ProductionFicheScreen({super.key, required this.line, required this.id});

  @override
  State<ProductionFicheScreen> createState() => _ProductionFicheScreenState();
}

class _ProductionFicheScreenState extends State<ProductionFicheScreen> {
  ProductionFicheDetail? _fiche;
  bool _loading = true;
  String? _error;

  String get _lineRoot => widget.line == 'probar' ? MyRoute.productionProbarRoot : MyRoute.productionPromeshRoot;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final fiche = await ProductionService.instance.fetchFiche(widget.line, widget.id);
      if (!mounted) return;
      setState(() => _fiche = fiche);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // Écran de détail d'origine de la fiche.
  String? _fullDetailRoute(ProductionRow row) {
    if (row.line == 'promesh') return '${MyRoute.porPromeshDetailScreen}?id=${row.id}';
    if (row.machine == null || row.poste == null) return null;
    return '$_lineRoot/machine/${row.machine!.numero}/poste/${row.poste}/detail?id=${row.id}';
  }

  @override
  Widget build(BuildContext context) {
    final fiche = _fiche;
    final row = fiche?.identification;
    final color = prodLineColor(widget.line);
    final editRoute = row == null || row.isLocked ? null : productionEditRoute(row);
    final fullRoute = row == null ? null : _fullDetailRoute(row);

    return ProdPage(
      onRefresh: _load,
      children: [
        ProdPageHeader(
          title: row?.reference ?? 'Fiche de production',
          subtitle: row == null
              ? 'Chargement de la fiche…'
              : '${row.lineLabel} · ${row.machine?.code ?? 'Machine non renseignée'} · ${prodDate(row.date)}',
          icon: Icons.description_outlined,
          color: color,
          onBack: () => context.go(_lineRoot),
          actions: [
            if (fullRoute != null)
              ProdButton(label: 'Fiche complète', icon: Icons.open_in_new_rounded, onTap: () => context.go(fullRoute)),
            if (row != null && !row.isLocked)
              ProdButton(
                label: 'Modifier',
                icon: Icons.edit_outlined,
                primary: true,
                color: color,
                onTap: editRoute == null ? null : () => context.go(editRoute),
              ),
          ],
        ),
        const SizedBox(height: 18),
        if (_error != null)
          ProdErrorState(message: _error!, onRetry: _load)
        else if (_loading || fiche == null)
          const ProdCard(child: ProdSkeleton(height: 260))
        else ...[
          _section(
            'Identification',
            Icons.badge_outlined,
            accent: color,
            child: ProdGrid(desktop: 4, tablet: 2, gap: 20, children: [
              ProdField.text('Référence', row!.reference ?? '—'),
              ProdField.text('Date', prodDate(row.date)),
              ProdField(label: 'Production', value: ProdLineBadge(line: row.line, label: row.lineLabel)),
              ProdField.text('Machine', row.machine == null ? '—' : '${row.machine!.code} — ${row.machine!.nom}'),
              ProdField.text('Poste', prodPoste(row.poste)),
              ProdField.text('Utilisateur', row.user ?? '—'),
              ProdField(label: 'Statut', value: ProdStatusBadge(row.status)),
            ]),
          ),
          const SizedBox(height: 16),
          _section(
            'Données de production',
            Icons.tune_rounded,
            child: ProdGrid(desktop: 4, tablet: 2, gap: 20, children: [
              for (final d in fiche.donnees) ProdField.text(d.$1, d.$2),
            ]),
          ),
          const SizedBox(height: 16),
          const ProdSectionTitle(title: 'Résumé'),
          const SizedBox(height: 12),
          ProdGrid(children: [
            ProdKpiTile(
              icon: Icons.stacked_bar_chart_rounded,
              label: 'Production',
              value: prodNum(fiche.quantity),
              unit: fiche.unit,
              color: color,
            ),
            ProdKpiTile(
              icon: Icons.delete_outline_rounded,
              label: 'Déchets',
              value: fiche.wasteKg == null ? '—' : prodNum(fiche.wasteKg!),
              unit: fiche.wasteKg == null ? null : 'kg',
              caption: fiche.wasteKg == null
                  ? 'Aucune fiche Récupérables pour ce poste'
                  : (fiche.wasteRate == null ? 'Déchets du poste' : '${prodRate(fiche.wasteRate)} kg pour 100 m²'),
              color: kProdWasteColor,
            ),
            ProdKpiTile(
              icon: Icons.recycling_rounded,
              label: 'Récupérables',
              value: fiche.recuperableKg == null ? '—' : prodNum(fiche.recuperableKg!),
              unit: fiche.recuperableKg == null ? null : 'kg',
              caption: 'Déchet + produit fini du poste',
              color: kProdRecuperableColor,
            ),
            ProdKpiTile(
              icon: Icons.speed_rounded,
              label: 'Rendement',
              value: fiche.rendement == null ? '—' : prodNum(fiche.rendement!),
              unit: fiche.rendement == null ? null : 'm²/h',
              caption: fiche.dureeHeures == null
                  ? 'Heures de début / fin non renseignées'
                  : 'Sur ${prodNum(fiche.dureeHeures!)} h de poste',
            ),
          ]),
          const SizedBox(height: 16),
          _section('Traçabilité', Icons.history_rounded, child: _timeline(fiche.tracabilite)),
        ],
        const SizedBox(height: 12),
      ],
    );
  }

  Widget _section(String title, IconData icon, {required Widget child, Color? accent}) {
    return ProdCard(
      accent: accent,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(icon, size: 16, color: kCrmTextSub),
          const SizedBox(width: 8),
          Text(title.toUpperCase(),
              style: tInter(fontSize: 11.5, fontWeight: FontWeight.w800, color: kCrmTextSub, letterSpacing: 0.8)),
        ]),
        const SizedBox(height: 16),
        child,
      ]),
    );
  }

  Widget _timeline(List<ProductionTraceEvent> events) {
    if (events.isEmpty) {
      return Text('Aucun événement enregistré.', style: tInter(fontSize: 13, color: kCrmTextSub));
    }
    IconData iconOf(String event) {
      switch (event) {
        case 'VALIDATION':
          return Icons.verified_outlined;
        case 'MODIFICATION':
          return Icons.edit_outlined;
        default:
          return Icons.add_circle_outline_rounded;
      }
    }

    return Column(children: [
      for (int i = 0; i < events.length; i++)
        IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Column(children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: kProdHeaderBg,
                  shape: BoxShape.circle,
                  border: Border.all(color: kCrmBorder),
                ),
                child: Icon(iconOf(events[i].event), size: 14, color: kProdNeutral),
              ),
              if (i < events.length - 1) Expanded(child: Container(width: 1, color: kCrmBorder)),
            ]),
            const SizedBox(width: 12),
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(top: 4, bottom: i < events.length - 1 ? 16 : 0),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(events[i].label, style: tInter(fontSize: 13.5, fontWeight: FontWeight.w700, color: kCrmText)),
                  const SizedBox(height: 2),
                  Text(
                    [prodDateTime(events[i].at), if (events[i].by != null) events[i].by!].join(' · '),
                    style: tInter(fontSize: 12, color: kCrmTextSub),
                  ),
                ]),
              ),
            ),
          ]),
        ),
    ]);
  }
}
