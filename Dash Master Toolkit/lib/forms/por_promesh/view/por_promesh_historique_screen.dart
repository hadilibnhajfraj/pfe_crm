// lib/forms/por_promesh/view/por_promesh_historique_screen.dart
//
// "Historique" — read-only chronological timeline of all POR PROMESH
// records, grouped by date (Aujourd'hui / Hier / Plus ancien).
// Distinct from "Liste des formulaires" (CRUD grid): this view is for
// audit / traceability, sorted by creation date.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';

import '../model/por_promesh_model.dart';
import '../service/por_promesh_service.dart';
import '../service/por_promesh_pdf_service.dart';
import '../service/por_promesh_excel_service.dart';

class PorPromeshHistoriqueScreen extends StatefulWidget {
  const PorPromeshHistoriqueScreen({super.key});

  @override
  State<PorPromeshHistoriqueScreen> createState() => _PorPromeshHistoriqueScreenState();
}

class _PorPromeshHistoriqueScreenState extends State<PorPromeshHistoriqueScreen> {
  bool _loading = true;
  String? _error;
  List<PorPromeshModel> _items = [];

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
      final items = await PorPromeshService.instance.fetchAll(limit: 1000);
      items.sort((a, b) {
        final da = DateTime.tryParse(a.createdAt ?? '') ?? DateTime(2000);
        final db = DateTime.tryParse(b.createdAt ?? '') ?? DateTime(2000);
        return db.compareTo(da);
      });
      if (!mounted) return;
      setState(() => _items = items);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _groupLabel(DateTime? d) {
    if (d == null) return 'Date inconnue';
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(d.year, d.month, d.day);
    final diff = today.difference(day).inDays;
    if (diff == 0) return "Aujourd'hui";
    if (diff == 1) return 'Hier';
    if (diff < 7) return 'Cette semaine';
    if (d.year == now.year && d.month == now.month) return 'Ce mois';
    return 'Plus ancien';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 12),
            child: Text('Historique POR PROMESH',
                style: tInter(fontSize: 20, fontWeight: FontWeight.w800, color: kCrmText)),
          ),
          Expanded(child: _buildBody()),
        ]),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(child: Text('Erreur : $_error', style: tInter(fontSize: 13, color: kCrmDanger)));
    }
    if (_items.isEmpty) {
      return Center(child: Text('Aucune saisie enregistrée', style: tInter(fontSize: 13, color: kCrmTextSub)));
    }

    final groups = <String, List<PorPromeshModel>>{};
    for (final item in _items) {
      final d = DateTime.tryParse(item.createdAt ?? '');
      final label = _groupLabel(d);
      groups.putIfAbsent(label, () => []).add(item);
    }
    const order = ["Aujourd'hui", 'Hier', 'Cette semaine', 'Ce mois', 'Plus ancien', 'Date inconnue'];
    final orderedKeys = order.where((k) => groups.containsKey(k)).toList();

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        children: [
          for (final key in orderedKeys) ...[
            Padding(
              padding: const EdgeInsets.only(top: 16, bottom: 8),
              child: Text(key, style: tInter(fontSize: 13, fontWeight: FontWeight.w700, color: kCrmPrimary)),
            ),
            ...groups[key]!.map((item) => _HistoriqueTile(item: item)),
          ],
        ],
      ),
    );
  }
}

class _HistoriqueTile extends StatefulWidget {
  final PorPromeshModel item;
  const _HistoriqueTile({required this.item});

  @override
  State<_HistoriqueTile> createState() => _HistoriqueTileState();
}

class _HistoriqueTileState extends State<_HistoriqueTile> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Erreur : $e'), backgroundColor: Colors.red.shade700));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final isDraft = item.status == 'draft';
    final isNonConforme = item.conformite == 'non_conforme';
    final created = DateTime.tryParse(item.createdAt ?? '');
    final dateLabel = item.dateProduction ?? '';
    final timeLabel = created != null ? DateFormat('dd/MM/yyyy HH:mm').format(created) : '';

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: kCrmBorder),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 16, runSpacing: 8, children: [
          _infoChip(Icons.event_outlined, dateLabel.isEmpty ? timeLabel : dateLabel),
          _infoChip(Icons.precision_manufacturing_outlined, 'Machine ${item.machine ?? ''}'),
          _infoChip(Icons.person_outline_rounded, item.operateur ?? ''),
          _infoChip(
            item.poste == 'matin' ? Icons.wb_sunny_rounded : Icons.nightlight_round,
            item.poste == 'matin' ? 'Matin' : 'Soir',
          ),
          _infoChip(Icons.speed_rounded, item.productionM2 == null ? '' : '${item.productionM2} m²'),
        ]),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          _badge(isNonConforme ? '🔴 Non Conforme' : '🟢 Conforme', isNonConforme ? kCrmDanger : kCrmSuccess),
          _badge(isDraft ? 'BROUILLON' : 'VALIDÉ', isDraft ? kCrmWarning : kCrmSuccess),
        ]),
        const SizedBox(height: 10),
        Wrap(spacing: 6, runSpacing: 6, children: [
          _actionButton('Voir', Icons.visibility_outlined, kCrmTextSub,
              () => context.go('${MyRoute.porPromeshDetailScreen}?id=${item.id}')),
          _actionButton('Télécharger PDF', Icons.picture_as_pdf_outlined, kCrmSecondary,
              () => _run(() => PorPromeshPdfService.instance.exportPdf(item))),
          _actionButton('Imprimer', Icons.print_outlined, kCrmTextSub,
              () => _run(() => PorPromeshPdfService.instance.printPdf(item))),
          _actionButton('Export Excel', Icons.grid_on_rounded, kCrmSuccess,
              () => _run(() async => PorPromeshExcelService.instance.export(item))),
        ]),
      ]),
    );
  }

  Widget _infoChip(IconData icon, String label) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 13, color: kCrmTextSub),
      const SizedBox(width: 4),
      Text(label, style: tInter(fontSize: 12, color: kCrmText)),
    ]);
  }

  Widget _badge(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
      child: Text(label, style: tInter(fontSize: 11, fontWeight: FontWeight.w700, color: color)),
    );
  }

  Widget _actionButton(String label, IconData icon, Color color, VoidCallback onTap) {
    return OutlinedButton.icon(
      onPressed: _busy ? null : onTap,
      icon: Icon(icon, size: 14, color: color),
      label: Text(label, style: tInter(fontSize: 11.5, fontWeight: FontWeight.w600, color: color)),
      style: OutlinedButton.styleFrom(
        side: BorderSide(color: color.withOpacity(0.4)),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        backgroundColor: color.withOpacity(0.06),
      ),
    );
  }
}
