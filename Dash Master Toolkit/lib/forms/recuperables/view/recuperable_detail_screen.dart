// lib/forms/recuperables/view/recuperable_detail_screen.dart
//
// Détail d'une fiche RÉCUPÉRABLES — informations générales, toutes les
// lignes, totaux/statistiques, Imprimer/Export PDF/Export Excel. Les
// boutons Modifier/Supprimer n'apparaissent que si la fiche est encore
// "En cours" (le backend refuse de toute façon toute écriture après 6
// jours — ceci n'est qu'un confort visuel, pas la source de vérité).

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

import '../theme/recuperable_theme.dart';
import '../model/recuperable_models.dart';
import '../service/recuperable_service.dart';
import '../service/recuperable_pdf_service.dart';
import '../service/recuperable_excel_service.dart';

class RecuperableDetailScreen extends StatefulWidget {
  final String id;
  const RecuperableDetailScreen({super.key, required this.id});

  @override
  State<RecuperableDetailScreen> createState() => _RecuperableDetailScreenState();
}

class _RecuperableDetailScreenState extends State<RecuperableDetailScreen> {
  bool _loading = true;
  bool _deleting = false;
  String? _error;
  RecuperableFicheModel? _fiche;

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
      final f = await RecuperableService.instance.fetchById(widget.id);
      if (!mounted) return;
      setState(() => _fiche = f);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _delete() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: Text(AppLocalizations.of(context).translate('Supprimer la fiche ?')),
        content: Text(AppLocalizations.of(context).translate('Cette action est irréversible : la fiche et toutes ses lignes seront supprimées.')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(AppLocalizations.of(context).translate('Annuler'))),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: kCrmDanger),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(AppLocalizations.of(context).translate('Supprimer')),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    setState(() => _deleting = true);
    try {
      await RecuperableService.instance.delete(widget.id);
      if (mounted) context.go(MyRoute.recuperableHistoriqueScreen);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${AppLocalizations.of(context).translate('Erreur')} : $e'), backgroundColor: kCrmDanger));
      }
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  Future<void> _print() async {
    try {
      await RecuperablePdfService.instance.printPdf(_fiche!);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${AppLocalizations.of(context).translate('Erreur impression')} : $e'), backgroundColor: kCrmDanger));
    }
  }

  Future<void> _exportPdf() async {
    try {
      await RecuperablePdfService.instance.exportPdf(_fiche!);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${AppLocalizations.of(context).translate('Erreur export PDF')} : $e'), backgroundColor: kCrmDanger));
    }
  }

  void _exportExcel() {
    try {
      RecuperableExcelService.instance.export(_fiche!);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${AppLocalizations.of(context).translate('Erreur export Excel')} : $e'), backgroundColor: kCrmDanger));
    }
  }

  @override
  Widget build(BuildContext context) {
    final f = _fiche;
    final statut = f == null ? null : recuperableStatutInfo(f.statut);

    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: IndustrialPageBody(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                InkWell(
                  onTap: () => context.go(MyRoute.recuperableHistoriqueScreen),
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    padding: const EdgeInsets.all(7),
                    decoration: BoxDecoration(border: Border.all(color: kCrmBorder), borderRadius: BorderRadius.circular(8)),
                    child: const Icon(Icons.arrow_back_rounded, size: 16, color: kCrmTextSub),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(AppLocalizations.of(context).translate('Détail Fiche Récupérables'), style: tInter(fontSize: 17, fontWeight: FontWeight.w900, color: kCrmText)),
                ),
                if (statut != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(color: statut.color.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Text(statut.emoji, style: const TextStyle(fontSize: 12)),
                      const SizedBox(width: 5),
                      Text(AppLocalizations.of(context).translate(statut.label), style: tInter(fontSize: 11.5, fontWeight: FontWeight.w800, color: statut.color)),
                    ]),
                  ),
              ]),
              const SizedBox(height: 20),

              if (_loading)
                const Center(child: CircularProgressIndicator())
              else if (_error != null)
                Text('${AppLocalizations.of(context).translate('Erreur')} : $_error', style: tInter(color: kCrmDanger))
              else if (f != null) ...[
                Wrap(spacing: 8, runSpacing: 8, children: [
                  if (f.isOpen)
                    _ActionBtn(
                      label: 'Modifier',
                      icon: Icons.edit_outlined,
                      color: kCrmInfo,
                      onTap: () => context.go('${MyRoute.recuperableFicheScreen}?id=${f.id}'),
                    ),
                  _ActionBtn(label: 'Imprimer', icon: Icons.print_outlined, color: kCrmTextSub, onTap: _print),
                  _ActionBtn(label: 'Exporter PDF', icon: Icons.picture_as_pdf_outlined, color: kCrmSecondary, onTap: _exportPdf),
                  _ActionBtn(label: 'Exporter Excel', icon: Icons.grid_on_rounded, color: kCrmSuccess, onTap: _exportExcel),
                  if (f.isOpen)
                    _ActionBtn(
                      label: _deleting ? 'Suppression…' : 'Supprimer',
                      icon: Icons.delete_outline_rounded,
                      color: kCrmDanger,
                      onTap: _deleting ? null : _delete,
                      outlined: false,
                    ),
                ]),
                const SizedBox(height: 20),

                _Section(title: 'Informations générales', icon: Icons.info_outline_rounded, color: kRecuperableColor),
                _InfoGrid(rows: [
                  ('Module', f.module),
                  ('Date', _fmt(f.date)),
                  ('Machine', 'Machine ${f.machine}'),
                  ('Ligne', f.ligne),
                  ('Poste', f.posteLabel),
                  ('Opérateur', (f.operateur ?? '').trim().isEmpty ? '-' : f.operateur!),
                  ('Date création', _fmtDateTime(f.createdAt)),
                  ('Clôture prévue', _fmt(f.dateCloture)),
                ]),
                const SizedBox(height: 20),

                _Section(title: 'Totaux', icon: Icons.bar_chart_rounded, color: kRecuperableColor),
                Wrap(spacing: 12, runSpacing: 12, children: [
                  _statCard('Total Déchet', '${f.totalDechetKg.toStringAsFixed(2)} kg', kRecuperableColor, Icons.recycling_rounded),
                  _statCard('Total Déchet + Produit fini', '${f.totalDechetProduitFiniKg.toStringAsFixed(2)} kg', kCrmPrimary, Icons.inventory_2_outlined),
                ]),
                const SizedBox(height: 20),

                _Section(title: 'RÉCUPÉRABLE TRAITÉ', icon: Icons.grid_on_rounded, color: kRecuperableColor),
                _DiametreTableReadOnly(fiche: f),
              ],
              const SizedBox(height: 20),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _statCard(String label, String value, Color color, IconData icon) {
    return Container(
      width: 200,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withOpacity(0.25)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 8),
          Expanded(child: Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 11.5, color: kCrmTextSub))),
        ]),
        const SizedBox(height: 8),
        Text(value, style: tInter(fontSize: 22, fontWeight: FontWeight.w900, color: color)),
      ]),
    );
  }

  String _fmt(String? raw) {
    if (raw == null || raw.isEmpty) return '-';
    final d = DateTime.tryParse(raw);
    return d == null ? raw : DateFormat('dd/MM/yyyy').format(d);
  }

  String _fmtDateTime(String? raw) {
    if (raw == null || raw.isEmpty) return '-';
    final d = DateTime.tryParse(raw);
    return d == null ? raw : DateFormat('dd/MM/yyyy HH:mm').format(d);
  }
}

class _ActionBtn extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback? onTap;
  final bool outlined;
  const _ActionBtn({required this.label, required this.icon, required this.color, required this.onTap, this.outlined = true});

  @override
  Widget build(BuildContext context) {
    final disabled = onTap == null;
    final effectiveColor = disabled ? kCrmBorder : color;
    if (outlined) {
      return OutlinedButton.icon(
        onPressed: onTap,
        icon: Icon(icon, size: 15, color: effectiveColor),
        label: Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700, color: effectiveColor)),
        style: OutlinedButton.styleFrom(
          side: BorderSide(color: effectiveColor.withOpacity(0.5)),
          backgroundColor: effectiveColor.withOpacity(0.06),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        ),
      );
    }
    return ElevatedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 15),
      label: Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700)),
      style: ElevatedButton.styleFrom(backgroundColor: color, foregroundColor: Colors.white, elevation: 0, padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8)),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;
  const _Section({required this.title, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(children: [
        Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(8)),
          child: Icon(icon, size: 15, color: color),
        ),
        const SizedBox(width: 10),
        Text(AppLocalizations.of(context).translate(title), style: tInter(fontSize: 14, fontWeight: FontWeight.w900, color: kCrmText)),
      ]),
    );
  }
}

class _InfoGrid extends StatelessWidget {
  final List<(String, String)> rows;
  const _InfoGrid({required this.rows});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(color: kCrmSurface, borderRadius: BorderRadius.circular(12), border: Border.all(color: kCrmBorder)),
      child: Column(children: [
        for (int i = 0; i < rows.length; i++)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: i.isOdd ? kCrmBg.withOpacity(0.5) : kCrmSurface,
              borderRadius: i == rows.length - 1 ? const BorderRadius.vertical(bottom: Radius.circular(12)) : BorderRadius.zero,
              border: i < rows.length - 1 ? const Border(bottom: BorderSide(color: kCrmBorder)) : null,
            ),
            child: Row(children: [
              Expanded(flex: 2, child: Text(AppLocalizations.of(context).translate(rows[i].$1), style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: kCrmTextSub))),
              Expanded(flex: 3, child: Text(rows[i].$2, style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700, color: kCrmText))),
            ]),
          ),
      ]),
    );
  }
}

/// Tableau fixe des 12 diamètres, strictement identique à celui de l'écran
/// de saisie mais en lecture seule (Text au lieu de TextField).
class _DiametreTableReadOnly extends StatelessWidget {
  final RecuperableFicheModel fiche;
  const _DiametreTableReadOnly({required this.fiche});

  String _fmt(double v) => v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(2);

  @override
  Widget build(BuildContext context) {
    Widget headCell(String text) => Expanded(
          child: Center(
            child: Text(AppLocalizations.of(context).translate(text),
                textAlign: TextAlign.center, style: tInter(fontSize: 11.5, fontWeight: FontWeight.w800, color: kCrmTextSub)),
          ),
        );

    return Container(
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: kCrmBorder),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10, offset: const Offset(0, 4))],
      ),
      child: Column(children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: const BoxDecoration(
            color: kCrmBg,
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
            border: Border(bottom: BorderSide(color: kCrmBorder)),
          ),
          child: Row(children: [
            const SizedBox(width: 70, child: Text('')),
            headCell('Déchet (kg)'),
            headCell('Déchet + Produit fini (kg)'),
          ]),
        ),
        for (int i = 0; i < kRecuperableDiametres.length; i++) ...[
          _row(kRecuperableDiametres[i], i.isOdd),
        ],
      ]),
    );
  }

  Widget _row(String diametre, bool odd) {
    final item = fiche.itemFor(diametre);
    return Container(
      color: odd ? kCrmBg.withOpacity(0.4) : Colors.transparent,
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(children: [
        SizedBox(
          width: 70,
          child: Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(color: kRecuperableColor.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
              child: Text('Ø$diametre', style: tInter(fontSize: 13, fontWeight: FontWeight.w900, color: kRecuperableColor)),
            ),
          ),
        ),
        Expanded(child: Center(child: Text(_fmt(item.dechetKg), style: tInter(fontSize: 14, fontWeight: FontWeight.w700, color: kCrmText)))),
        Expanded(
            child: Center(
                child: Text(_fmt(item.dechetProduitFiniKg), style: tInter(fontSize: 14, fontWeight: FontWeight.w700, color: kCrmText)))),
      ]),
    );
  }
}
