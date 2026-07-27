// lib/forms/industrial/view/melange/melange_details_screen.dart
//
// Écran détail d'une fiche MÉLANGE — lecture seule, reproduit les 3 étapes
// de saisie (Informations générales / Suivi journalier / Rapport journalier)
// exactement comme lors de la saisie, sans aucun champ modifiable. Actions :
// Modifier, Supprimer, Exporter PDF. Calqué sur ProbarDetailScreen.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/model/industrial_record_model.dart';
import 'package:dash_master_toolkit/forms/industrial/service/industrial_record_service.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

import 'melange_history_card.dart' show MelangeHistoryStatus;

// ── Mêmes groupes que melange_form_screen.dart (constantes privées à ce fichier) ──
const List<(String, String)> _kRavGroups = [
  ('cooM', 'COO M'),
  ('bainResine24', 'BAIN RÉSINE 2.4'),
  ('bainResine3', 'BAIN RÉSINE 3'),
  ('bainISO', 'BAIN ISO'),
  ('promesh1', 'PROMESH #1'),
  ('promesh2', 'PROMESH #2'),
  ('promesh3', 'PROMESH #3'),
  ('promesh4', 'PROMESH #4'),
];
const List<(String, String)> _kRavSubCols = [('c', 'C'), ('n', 'N'), ('p', 'P'), ('q', 'Qté')];
const List<(String, String)> _kCsoCols = [
  ('resine', 'Résine'),
  ('iso', 'ISO'),
  ('accelerateur', 'Accél.'),
  ('colorant', 'Colorant'),
  ('pg', 'PG'),
];
const List<(String, String)> _kRapGroups = [
  ('h', 'H'),
  ('a', 'A (kg)'),
  ('b', 'B (kg)'),
  ('c', 'C (kg)'),
  ('gc', 'C Gde Cuillère'),
  ('pc', 'D Pte Cuillère'),
];
const List<String> _kLines = ['L1', 'L2', 'L3', 'L4'];
const BorderSide _bdr = BorderSide(color: Color(0xFFE2E8F0));

class MelangeDetailsScreen extends StatefulWidget {
  final String id;
  const MelangeDetailsScreen({super.key, required this.id});

  @override
  State<MelangeDetailsScreen> createState() => _MelangeDetailsScreenState();
}

class _MelangeDetailsScreenState extends State<MelangeDetailsScreen> {
  bool _loading = true;
  bool _deleting = false;
  String? _error;
  IndustrialRecordModel? _record;

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
      final r = await IndustrialRecordService.instance.fetchById(widget.id);
      if (mounted) setState(() => _record = r);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
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
        content: Text(AppLocalizations.of(context)
            .translate('Cette action est irréversible. La fiche sera définitivement supprimée.')),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(AppLocalizations.of(context).translate('Annuler'))),
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
      await IndustrialRecordService.instance.delete(widget.id);
      if (mounted) context.go(MyRoute.melangeHistoriqueScreen);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('${AppLocalizations.of(context).translate('Erreur')} : $e'),
            backgroundColor: kCrmDanger));
      }
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  void _exportPdf() => ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(AppLocalizations.of(context).translate('Export PDF — fonctionnalité à venir')),
      duration: const Duration(seconds: 2)));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: IndustrialPageBody(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                InkWell(
                  onTap: () => context.go(MyRoute.melangeHistoriqueScreen),
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    padding: const EdgeInsets.all(7),
                    decoration:
                        BoxDecoration(border: Border.all(color: kCrmBorder), borderRadius: BorderRadius.circular(8)),
                    child: const Icon(Icons.arrow_back_rounded, size: 16, color: kCrmTextSub),
                  ),
                ),
                const SizedBox(width: 12),
                Container(
                  width: 38,
                  height: 38,
                  decoration:
                      BoxDecoration(color: kMelangeColor.withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
                  child: const Icon(Icons.science_outlined, color: kMelangeColor, size: 20),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(AppLocalizations.of(context).translate('Détail Fiche MÉLANGE'),
                      style: tInter(fontSize: 17, fontWeight: FontWeight.w900, color: kCrmText)),
                ),
              ]),
              const SizedBox(height: 20),

              Wrap(spacing: 10, runSpacing: 10, children: [
                _ActionBtn(
                  label: 'Modifier',
                  icon: Icons.edit_outlined,
                  color: kMelangeColor,
                  onTap: _loading ? null : () => context.go('${MyRoute.melangeFormScreen}?id=${widget.id}'),
                ),
                _ActionBtn(
                  label: 'Exporter PDF',
                  icon: Icons.picture_as_pdf_outlined,
                  color: kCrmDanger,
                  onTap: _loading ? null : _exportPdf,
                ),
                _ActionBtn(
                  label: _deleting ? 'Suppression…' : 'Supprimer',
                  icon: Icons.delete_outline_rounded,
                  color: kCrmDanger,
                  onTap: (_loading || _deleting) ? null : _delete,
                  outlined: false,
                ),
              ]),
              const SizedBox(height: 24),

              if (_loading)
                const Center(child: CircularProgressIndicator())
              else if (_error != null)
                Text('${AppLocalizations.of(context).translate('Erreur')} : $_error', style: tInter(color: kCrmDanger))
              else if (_record != null)
                _RecordDetail(record: _record!),
            ]),
          ),
        ),
      ),
    );
  }
}

class _ActionBtn extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback? onTap;
  final bool outlined;

  const _ActionBtn({
    required this.label,
    required this.icon,
    required this.color,
    required this.onTap,
    this.outlined = true,
  });

  @override
  Widget build(BuildContext context) {
    if (outlined) {
      return OutlinedButton.icon(
        onPressed: onTap,
        icon: Icon(icon, size: 15),
        label: Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700)),
        style: OutlinedButton.styleFrom(
          foregroundColor: color,
          side: BorderSide(color: color.withOpacity(0.6)),
          backgroundColor: color.withOpacity(0.06),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        ),
      );
    }
    return ElevatedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 15),
      label: Text(label, style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700)),
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        foregroundColor: Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      ),
    );
  }
}

class _RecordDetail extends StatelessWidget {
  final IndustrialRecordModel record;
  const _RecordDetail({required this.record});

  static bool _rowHasValue(Map row) => row.values.any((v) => (v ?? '').toString().trim().isNotEmpty);

  static double _toDouble(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString().replaceAll(',', '.')) ?? 0;
  }

  String _fmtDateTime(String? raw) {
    if (raw == null || raw.isEmpty) return '-';
    final d = DateTime.tryParse(raw);
    return d == null ? raw : DateFormat('dd/MM/yyyy HH:mm').format(d);
  }

  @override
  Widget build(BuildContext context) {
    final data = record.melangeData ?? const <String, dynamic>{};
    final rav = (data['ravitaillement'] as Map?)?.cast<String, dynamic>();
    final ravLignesRaw = (rav?['lignes'] as List?) ?? const [];
    final cso = (data['consommation'] as List?) ?? const [];
    final rapport = (data['rapport'] as Map?)?.cast<String, dynamic>();
    final rapLignesRaw = (rapport?['lignes'] as List?) ?? const [];
    final chute = (data['chuteFibre'] as Map?)?.cast<String, dynamic>() ?? const {};

    final status = MelangeHistoryStatus.of(record);

    // Totaux du rapport journalier (identiques au calcul de l'étape 3 du formulaire).
    double groupTotal(String g) {
      double s = 0;
      for (final raw in rapLignesRaw) {
        if (raw is! Map) continue;
        for (final l in _kLines) s += _toDouble(raw['${g}_$l']);
      }
      return s;
    }

    final totH = groupTotal('h');
    final totA = groupTotal('a');
    final totB = groupTotal('b');
    final totC = groupTotal('c');
    final totGC = groupTotal('gc');
    final totPC = groupTotal('pc');
    final totGl = totA + totB + totC + totGC + totPC;
    String fmt(double v) => v == 0 ? '—' : v.toStringAsFixed(2);

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Wrap(spacing: 8, runSpacing: 8, children: [
        _Badge(status.label, status.color),
      ]),
      const SizedBox(height: 20),

      // ── Informations générales ──────────────────────────────────────────
      _Section(title: 'Informations générales', icon: Icons.info_outline_rounded, color: kMelangeColor),
      _InfoGrid(rows: [
        ('Date', record.dateFiche ?? '-'),
        ('Heure début', data['heureDebut']?.toString() ?? '-'),
        ('Heure fin', data['heureFin']?.toString() ?? '-'),
        ('Opérateur', record.operateur ?? '-'),
        ('Zone', rapport?['zone']?.toString() ?? '-'),
        if ((data['remarqueGen']?.toString() ?? '').isNotEmpty) ('Remarque générale', data['remarqueGen'].toString()),
        ('Date création', _fmtDateTime(record.createdAt)),
        ('Dernière modification', _fmtDateTime(record.updatedAt)),
      ]),
      const SizedBox(height: 20),

      // ── Suivi journalier — Ravitaillement ───────────────────────────────
      _Section(title: 'Suivi Journalier — Ravitaillement', icon: Icons.local_shipping_outlined, color: kMelangeColor),
      _RavitaillementTable(lignes: ravLignesRaw),
      const SizedBox(height: 20),

      // ── Consommation chimique ───────────────────────────────────────────
      _Section(title: 'Consommation Produit Chimique', icon: Icons.science_outlined, color: kMelangeColor),
      _ConsommationTable(lignes: cso),
      const SizedBox(height: 20),

      // ── Remarques & Signature ───────────────────────────────────────────
      if ((data['remarques']?.toString() ?? '').isNotEmpty || (data['signature']?.toString() ?? '').isNotEmpty) ...[
        _Section(title: 'Remarques & Signature', icon: Icons.draw_outlined, color: kMelangeColor),
        _InfoGrid(rows: [
          if ((data['remarques']?.toString() ?? '').isNotEmpty) ('Remarques', data['remarques'].toString()),
          if ((data['signature']?.toString() ?? '').isNotEmpty) ('Signature', data['signature'].toString()),
        ]),
        const SizedBox(height: 20),
      ],

      // ── Rapport journalier de mélange ───────────────────────────────────
      _Section(title: 'Rapport Journalier de Mélange', icon: Icons.receipt_long_outlined, color: kMelangeColor),
      _InfoGrid(rows: [
        ('Date', rapport?['date']?.toString() ?? '-'),
        ('Zone', rapport?['zone']?.toString() ?? '-'),
        ('Opérateur', rapport?['operateur']?.toString() ?? '-'),
        ('Heure début', rapport?['heureDebut']?.toString() ?? '-'),
        ('Heure fin', rapport?['heureFin']?.toString() ?? '-'),
      ]),
      const SizedBox(height: 12),
      _RapportTable(lignes: rapLignesRaw),
      const SizedBox(height: 16),

      // ── Totaux + chute fibre ─────────────────────────────────────────────
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: _Card(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(AppLocalizations.of(context).translate('Totaux'), style: tInter(fontSize: 13, fontWeight: FontWeight.w800, color: kCrmText)),
              const SizedBox(height: 10),
              _TotRow('TOTAL H', fmt(totH), const Color(0xFF6366F1)),
              _TotRow('TOTAL A', fmt(totA), const Color(0xFF3B82F6)),
              _TotRow('TOTAL B', fmt(totB), const Color(0xFF8B5CF6)),
              _TotRow('TOTAL C', fmt(totC), const Color(0xFFF59E0B)),
              _TotRow('TOTAL C Grande Cuillère', fmt(totGC), const Color(0xFF06B6D4)),
              _TotRow('TOTAL D Petite Cuillère', fmt(totPC), const Color(0xFF84CC16)),
              const Divider(height: 16, color: Color(0xFFE2E8F0)),
              _TotRow('T.GLOBAL DE MÉLANGE', fmt(totGl), kMelangeColor, bold: true),
            ]),
          ),
        ),
        const SizedBox(width: 12),
        SizedBox(
          width: 180,
          child: _Card(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(AppLocalizations.of(context).translate('N° chute fibre'), style: tInter(fontSize: 13, fontWeight: FontWeight.w800, color: kCrmText)),
              const SizedBox(height: 10),
              for (final l in _kLines) ...[
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  Text(l, style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: kCrmTextSub)),
                  Text(chute[l]?.toString().isNotEmpty == true ? chute[l].toString() : '—',
                      style: tInter(fontSize: 13, fontWeight: FontWeight.w700, color: kCrmText)),
                ]),
                if (l != _kLines.last) const SizedBox(height: 8),
              ],
            ]),
          ),
        ),
      ]),
      const SizedBox(height: 20),
    ]);
  }
}

// ── Tableau Ravitaillement — lecture seule (lignes vides masquées) ──────────
class _RavitaillementTable extends StatelessWidget {
  final List lignes;
  const _RavitaillementTable({required this.lignes});

  @override
  Widget build(BuildContext context) {
    final rows = <Map<String, dynamic>>[];
    for (final raw in lignes) {
      if (raw is! Map) continue;
      final m = Map<String, dynamic>.from(raw);
      if (_RecordDetail._rowHasValue(m)) rows.add(m);
    }
    if (rows.isEmpty) {
      return _Card(child: Text(AppLocalizations.of(context).translate('Aucune donnée de ravitaillement saisie'), style: tInter(fontSize: 12, color: kCrmTextSub)));
    }

    const cW = 46.0;
    const leadW = 56.0;
    const rowH = 34.0;
    const hdr1H = 30.0;
    const hdr2H = 24.0;
    final groupW = _kRavSubCols.length * cW;

    Widget headCell(String text, double w, double h, {Color? bg}) => Container(
          width: w,
          height: h,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: bg ?? const Color(0xFFF1F5F9), border: const Border(right: _bdr, bottom: _bdr)),
          child: Text(AppLocalizations.of(context).translate(text),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: tInter(fontSize: 9, fontWeight: FontWeight.w800, color: kCrmText)),
        );

    Widget dataCell(String text, double w) => Container(
          width: w,
          height: rowH,
          alignment: Alignment.center,
          decoration: const BoxDecoration(color: Colors.white, border: Border(right: _bdr, bottom: _bdr)),
          child: Text(text.isEmpty ? '—' : text,
              style: tInter(fontSize: 11, color: text.isEmpty ? const Color(0xFFCBD5E1) : kCrmText)),
        );

    return _Card(
      noPad: true,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Column(children: [
          Row(children: [
            headCell('Qté', leadW, hdr1H + hdr2H, bg: const Color(0xFFE2E8F0)),
            Column(children: [
              Row(children: [for (final g in _kRavGroups) headCell(g.$2, groupW, hdr1H)]),
              Row(children: [for (final _ in _kRavGroups) for (final s in _kRavSubCols) headCell(s.$2, cW, hdr2H)]),
            ]),
          ]),
          for (final row in rows)
            Row(children: [
              dataCell(row['qte']?.toString() ?? '', leadW),
              for (final g in _kRavGroups)
                for (final s in _kRavSubCols) dataCell(row['${g.$1}_${s.$1}']?.toString() ?? '', cW),
            ]),
        ]),
      ),
    );
  }
}

// ── Tableau Consommation — lecture seule ────────────────────────────────────
class _ConsommationTable extends StatelessWidget {
  final List lignes;
  const _ConsommationTable({required this.lignes});

  @override
  Widget build(BuildContext context) {
    final rows = <Map<String, dynamic>>[];
    for (final raw in lignes) {
      if (raw is! Map) continue;
      final m = Map<String, dynamic>.from(raw);
      if (_RecordDetail._rowHasValue(m)) rows.add(m);
    }
    if (rows.isEmpty) {
      return _Card(child: Text(AppLocalizations.of(context).translate('Aucune consommation chimique saisie'), style: tInter(fontSize: 12, color: kCrmTextSub)));
    }

    const cW = 90.0;
    const rowH = 36.0;

    Widget headCell(String text) => Container(
          width: cW,
          height: 34,
          alignment: Alignment.center,
          decoration: const BoxDecoration(color: Color(0xFFF1F5F9), border: Border(right: _bdr, bottom: _bdr)),
          child: Text(AppLocalizations.of(context).translate(text), style: tInter(fontSize: 11, fontWeight: FontWeight.w800, color: kCrmText)),
        );

    Widget dataCell(String text) => Container(
          width: cW,
          height: rowH,
          alignment: Alignment.center,
          decoration: const BoxDecoration(color: Colors.white, border: Border(right: _bdr, bottom: _bdr)),
          child: Text(text.isEmpty ? '—' : text,
              style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: text.isEmpty ? const Color(0xFFCBD5E1) : kCrmText)),
        );

    return _Card(
      noPad: true,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Column(children: [
          Row(children: [for (final c in _kCsoCols) headCell(c.$2)]),
          for (final row in rows) Row(children: [for (final c in _kCsoCols) dataCell(row[c.$1]?.toString() ?? '')]),
        ]),
      ),
    );
  }
}

// ── Tableau Rapport Journalier — lecture seule (lignes vides masquées) ──────
class _RapportTable extends StatelessWidget {
  final List lignes;
  const _RapportTable({required this.lignes});

  @override
  Widget build(BuildContext context) {
    final rows = <Map<String, dynamic>>[];
    for (final raw in lignes) {
      if (raw is! Map) continue;
      final m = Map<String, dynamic>.from(raw);
      if (_RecordDetail._rowHasValue(m)) rows.add(m);
    }
    if (rows.isEmpty) {
      return _Card(child: Text(AppLocalizations.of(context).translate('Aucune ligne de rapport journalier saisie'), style: tInter(fontSize: 12, color: kCrmTextSub)));
    }

    const cW = 52.0;
    const nW = 36.0;
    const rowH = 32.0;
    const hdr1H = 28.0;
    const hdr2H = 22.0;
    final groupW = _kLines.length * cW;

    Widget headCell(String text, double w, double h, {Color? bg}) => Container(
          width: w,
          height: h,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: bg ?? const Color(0xFFF1F5F9), border: const Border(right: _bdr, bottom: _bdr)),
          child: Text(AppLocalizations.of(context).translate(text),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: tInter(fontSize: 9, fontWeight: FontWeight.w800, color: kCrmText)),
        );

    Widget dataCell(String text, double w, {bool bold = false}) => Container(
          width: w,
          height: rowH,
          alignment: Alignment.center,
          decoration: const BoxDecoration(color: Colors.white, border: Border(right: _bdr, bottom: _bdr)),
          child: Text(text.isEmpty ? '—' : text,
              style: tInter(
                  fontSize: 11,
                  fontWeight: bold ? FontWeight.w800 : FontWeight.w500,
                  color: text.isEmpty ? const Color(0xFFCBD5E1) : kCrmText)),
        );

    return _Card(
      noPad: true,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Column(children: [
          Row(children: [
            headCell('N', nW, hdr1H + hdr2H, bg: const Color(0xFF334155)),
            Column(children: [
              Row(children: [for (final g in _kRapGroups) headCell(g.$2, groupW, hdr1H)]),
              Row(children: [for (final _ in _kRapGroups) for (final l in _kLines) headCell(l, cW, hdr2H)]),
            ]),
          ]),
          for (int i = 0; i < rows.length; i++)
            Row(children: [
              dataCell('${i + 1}', nW, bold: true),
              for (final g in _kRapGroups)
                for (final l in _kLines) dataCell(rows[i]['${g.$1}_$l']?.toString() ?? '', cW),
            ]),
        ]),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Petits composants d'affichage (mêmes que ProbarDetailScreen)
// ─────────────────────────────────────────────────────────────────────────
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
        Text(AppLocalizations.of(context).translate(title),
            style: tInter(fontSize: 14, fontWeight: FontWeight.w900, color: kCrmText)),
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
              borderRadius:
                  i == rows.length - 1 ? const BorderRadius.vertical(bottom: Radius.circular(12)) : BorderRadius.zero,
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

class _Badge extends StatelessWidget {
  final String label;
  final Color color;
  const _Badge(this.label, this.color);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
      child: Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 12, fontWeight: FontWeight.w800, color: color)),
    );
  }
}

class _TotRow extends StatelessWidget {
  final String label, value;
  final Color color;
  final bool bold;
  const _TotRow(this.label, this.value, this.color, {this.bold = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        Container(width: 5, height: 5, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 8),
        Expanded(
            child: Text(AppLocalizations.of(context).translate(label),
                style: tInter(fontSize: 12, fontWeight: bold ? FontWeight.w800 : FontWeight.w500, color: kCrmText))),
        Text(value, style: tInter(fontSize: 13, fontWeight: bold ? FontWeight.w900 : FontWeight.w700, color: color)),
      ]),
    );
  }
}

class _Card extends StatelessWidget {
  final Widget child;
  final bool noPad;
  const _Card({required this.child, this.noPad = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: noPad ? EdgeInsets.zero : const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: kCrmBorder),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 3))],
      ),
      child: child,
    );
  }
}
