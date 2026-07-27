// lib/forms/por_promesh/service/por_promesh_pdf_service.dart
//
// Client-side PDF export/print for a POR PROMESH record — fiche
// professionnelle A4 en 4 pages (Informations générales / Contrôle Qualité
// / Contrôle Process / Paramètres du Poste), logo + QR code + pagination +
// utilisateur générateur, entièrement générée depuis les données déjà en
// mémoire (`PorPromeshModel`) — aucun appel backend.

import 'package:flutter/services.dart' show rootBundle;
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import 'package:dash_master_toolkit/providers/auth_service.dart';

import '../controller/por_promesh_controller.dart'
    show processParamConfigs, ProcessParamConfig, ProcessParamKind, processParamIsNegative;
import '../model/por_promesh_model.dart';
import '../utils/por_promesh_pdf_theme.dart';
import '../utils/por_promesh_safe_value.dart';

const _pdfPrimary = PdfColor.fromInt(0xFF6366F1);
const _pdfSuccess = PdfColor.fromInt(0xFF10B981);
const _pdfInfo = PdfColor.fromInt(0xFF06B6D4);
const _pdfDanger = PdfColor.fromInt(0xFFEF4444);
const _pdfBg = PdfColor.fromInt(0xFFF8FAFC);
const _pdfBorder = PdfColor.fromInt(0xFFE2E8F0);
const _pdfText = PdfColor.fromInt(0xFF0F172A);
const _pdfTextSub = PdfColor.fromInt(0xFF64748B);

// Mêmes paramètres / blocs fixes que la grille "Contrôle Process PROMESH"
// du formulaire (lib/forms/por_promesh/controller/por_promesh_controller.dart).
const _kProcessParams = [
  'Niveau bain de résine',
  'Diamètre de bar',
  'Température de machine',
  "Température d'eau",
  "Pression d'air comprimé",
  'Validation impression',
  'Nombre de barre en longueur',
  'Dimensions de maille',
  'Dimensions côté 1 long',
  'Dimensions côté 2 long',
  "Fuite d'eau",
  "Fuite d'air comprimé",
  'Etat disque de coupe',
  'Nombre de barre en largeur',
];

const _kProcessBlocs = [
  ('controle_08h20', '08H20'),
  ('controle_10h20', '10H20'),
  ('controle_14h20', '14H20'),
];

class PorPromeshPdfService {
  static final PorPromeshPdfService instance = PorPromeshPdfService._();
  PorPromeshPdfService._();

  Future<void> exportPdf(PorPromeshModel m) async {
    final doc = await _buildDocument(m);
    await Printing.sharePdf(
      bytes: await doc.save(),
      filename: 'por-promesh-${m.numero ?? m.id ?? DateTime.now().millisecondsSinceEpoch}.pdf',
    );
  }

  Future<void> printPdf(PorPromeshModel m) async {
    final doc = await _buildDocument(m);
    await Printing.layoutPdf(onLayout: (_) => doc.save());
  }

  Future<pw.Document> _buildDocument(PorPromeshModel m) async {
    final doc = pw.Document(theme: await robotoPdfTheme());
    final generatedAt = DateFormat('dd/MM/yyyy HH:mm').format(DateTime.now());
    final generatedBy = AuthService().displayName;
    final logo = await _logoWidget();
    // QR contenant l'identifiant de la fiche (UUID) — secours sur le
    // numéro lisible si jamais l'id n'est pas encore disponible.
    final qrData = (m.id ?? m.numero ?? '').trim();

    final margin = const pw.EdgeInsets.fromLTRB(28, 24, 28, 32);
    pw.Widget footer(pw.Context ctx) => _footer(ctx, generatedAt, generatedBy);

    // ── PAGE 1 — En-tête PROMESH + Informations générales ────────────────
    doc.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: margin,
      header: (ctx) => ctx.pageNumber == 1 ? _fullHeader(m, logo, qrData) : _slimHeader(m, logo),
      footer: footer,
      build: (ctx) => _page1Content(m),
    ));

    // ── PAGE 2 — Contrôle Qualité ──────────────────────────────────────────
    doc.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: margin,
      header: (ctx) => _slimHeader(m, logo),
      footer: footer,
      build: (ctx) => _page2Content(m),
    ));

    // ── PAGE 3 — Contrôle Process (tableau complet 08h20/10h20/14h20) ─────
    doc.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: margin,
      header: (ctx) => _slimHeader(m, logo),
      footer: footer,
      build: (ctx) => _page3Content(m),
    ));

    // ── PAGE 4 — Paramètres du Poste (Tableau P1 + Tableau P2) ────────────
    doc.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: margin,
      header: (ctx) => _slimHeader(m, logo),
      footer: footer,
      build: (ctx) => _page4Content(m),
    ));

    return doc;
  }

  // ── PAGE 1 — Informations générales ───────────────────────────────────

  List<pw.Widget> _page1Content(PorPromeshModel m) {
    final info = _statusInfo(m.status);
    final isNonConforme = m.conformite == 'non_conforme';
    return [
      _sectionTitle('Informations Générales'),
      _sectionCard('Informations Générales', [
        _kv('Numéro Fiche', m.numero),
        _kv('Statut', info.label),
        _kv('Machine', m.machine == null ? null : 'Machine ${m.machine}'),
        _kv('Poste', m.poste == 'matin' ? 'Matin' : (m.poste == 'nuit' ? 'Nuit' : m.poste)),
        _kv('Date', m.dateProduction),
        _kv('Heure Début', m.heureDebut),
        _kv('Heure Fin', m.heureFin),
        _kv('Opérateur', m.operateur),
        _kv('Responsable', m.personnelActif['responsable1']),
        _kv('Date de Création', _formatDateTime(m.createdAt)),
        _kv('Date de Validation', m.dateValidationProcess),
      ]),
      // Seuls deux champs existent réellement dans le modèle pour ce
      // module (`productionM2`, `diametreMaille1/2/3`) — aucune valeur
      // inventée pour les libellés sans équivalent backend.
      _sectionCard('Rendement', [
        _kpiRow([
          ('Production', m.productionM2 == null ? '' : '${_fmt(m.productionM2)} m²'),
          ('Diamètre Maille', _joinNonEmpty([m.diametreMaille1, m.diametreMaille2, m.diametreMaille3])),
        ]),
      ]),
      _sectionCard('Personnel', [
        pw.Wrap(spacing: 14, runSpacing: 4, children: [
          for (final e in _personnelEntries(m)) _personChip(e.$1, e.$2),
        ]),
        if ((m.observationPersonnel ?? '').trim().isNotEmpty) ...[
          pw.SizedBox(height: 6),
          pw.Text(m.observationPersonnel!, style: pw.TextStyle(fontSize: 8, color: _pdfTextSub)),
        ],
      ]),
      _sectionCard('Observation', [
        pw.Text(
          (m.observationsGenerales ?? '').trim().isEmpty ? 'Aucune observation.' : m.observationsGenerales!,
          style: pw.TextStyle(fontSize: 9, color: _pdfText),
        ),
        if (m.attachments.isNotEmpty) ...[
          pw.SizedBox(height: 6),
          pw.Text(
            '${m.attachments.length} pièce(s) jointe(s) : ${m.attachments.map((a) => safeValue(a['fileName'])).join(', ')}',
            style: pw.TextStyle(fontSize: 8, color: _pdfTextSub),
          ),
        ],
      ]),
      _sectionCard('Non-Conformité', [
        m.conformite == null
            ? pw.Text('Statut non renseigné', style: pw.TextStyle(fontSize: 9, color: _pdfTextSub))
            : _badgeText(isNonConforme ? 'Non Conforme' : 'Conforme', isNonConforme ? _pdfDanger : _pdfSuccess),
        if (isNonConforme) ...[
          pw.SizedBox(height: 6),
          _kv('Description', m.descriptionNonConformite),
          _kv('Actions correctives', m.actionsCorrectives),
        ],
      ]),
    ];
  }

  pw.Widget _badgeText(String label, PdfColor color) => pw.Container(
        padding: const pw.EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: pw.BoxDecoration(color: color, borderRadius: pw.BorderRadius.circular(10)),
        child: pw.Text(label, style: pw.TextStyle(color: PdfColors.white, fontSize: 9, fontWeight: pw.FontWeight.bold)),
      );

  // ── PAGE 2 — Contrôle Qualité ──────────────────────────────────────────

  List<pw.Widget> _page2Content(PorPromeshModel m) {
    return [
      _sectionTitle('Contrôle Qualité'),
      _sectionCard('Mesures (toutes les 3 heures)', [
        _table(
          headers: const ['Heure', 'N° Plaque', 'Maille', 'Longueur', 'Largeur', 'Statut COQ'],
          keys: const ['heure', 'numeroPlaque', 'maille', 'longueur', 'largeur', '__statut'],
          rows: m.controlesQualite,
          cellColor: (key, value) {
            if (key != '__statut') return null;
            final s = value?.toString().toUpperCase();
            if (s == 'C') return _pdfSuccess;
            if (s == 'NC') return _pdfDanger;
            return null;
          },
        ),
      ]),
      _sectionCard('Observation Responsable Production', [
        pw.Text(
          (m.observationsGenerales ?? '').trim().isEmpty ? 'Aucune observation.' : m.observationsGenerales!,
          style: pw.TextStyle(fontSize: 9, color: _pdfText),
        ),
      ]),
    ];
  }

  // ── PAGE 3 — Contrôle Process ──────────────────────────────────────────
  //
  // Tableau simple Paramètre × 08h20/10h20/14h20 — chaque cellule combine
  // valeur + ✓/✗ (même mise en page que l'écran Détail).

  List<pw.Widget> _page3Content(PorPromeshModel m) {
    return [
      _sectionTitle('Contrôle Process'),
      _sectionCard('14 paramètres × 08h20 / 10h20 / 14h20', [
        _processCombinedTable(m.processControl),
      ]),
    ];
  }

  pw.Widget _processCombinedTable(List<Map<String, dynamic>> processControl) {
    final byBlocParam = <String, Map<String, dynamic>>{};
    for (final r in processControl) {
      final bloc = r['bloc']?.toString() ?? '';
      final param = r['parametre']?.toString() ?? '';
      byBlocParam['$bloc|$param'] = r;
    }
    pw.Widget headCell(String text, {bool alignStart = false}) => pw.Padding(
          padding: const pw.EdgeInsets.symmetric(horizontal: 5, vertical: 5),
          child: pw.Text(text,
              textAlign: alignStart ? pw.TextAlign.left : pw.TextAlign.center,
              style: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold, color: _pdfPrimary)),
        );
    return pw.Table(
      border: pw.TableBorder.all(color: _pdfBorder, width: 0.5),
      columnWidths: const {0: pw.FlexColumnWidth(3), 1: pw.FlexColumnWidth(1.4), 2: pw.FlexColumnWidth(1.4), 3: pw.FlexColumnWidth(1.4)},
      children: [
        pw.TableRow(decoration: const pw.BoxDecoration(color: _pdfBg), children: [
          headCell('Paramètre', alignStart: true),
          headCell('08H20'),
          headCell('10H20'),
          headCell('14H20'),
        ]),
        for (final cfg in processParamConfigs)
          pw.TableRow(children: [
            pw.Padding(
              padding: const pw.EdgeInsets.symmetric(horizontal: 5, vertical: 4),
              child: pw.Text(cfg.title, style: pw.TextStyle(fontSize: 7.5, color: _pdfText)),
            ),
            for (final bloc in _kProcessBlocs) _processCombinedCell(byBlocParam['${bloc.$1}|${cfg.parametre}'], cfg),
          ]),
      ],
    );
  }

  /// Valeur + ✓/✗ recalculé depuis la valeur via `processParamIsNegative`
  /// (même règle métier que l'écran Détail) plutôt que de se fier à une
  /// éventuelle case "COR" jamais cochée sur d'anciennes fiches.
  pw.Widget _processCombinedCell(Map<String, dynamic>? row, ProcessParamConfig cfg) {
    final raw = (row?['valeurP1'] ?? '').toString().trim();
    if (raw.isEmpty) {
      return pw.Padding(
        padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        child: pw.Text('—', textAlign: pw.TextAlign.center, style: pw.TextStyle(fontSize: 8, color: _pdfTextSub)),
      );
    }
    final isNumeric = cfg.kind == ProcessParamKind.numeric;
    final negative = !isNumeric && processParamIsNegative(cfg.kind, raw);
    final text = cfg.suffix == null ? raw : '$raw ${cfg.suffix}';
    if (isNumeric) {
      return pw.Padding(
        padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        child: pw.Text(text, textAlign: pw.TextAlign.center, style: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold, color: _pdfText)),
      );
    }
    final color = negative ? _pdfDanger : _pdfSuccess;
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      child: pw.Text('${negative ? '✗' : '✓'} $text',
          textAlign: pw.TextAlign.center, style: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold, color: color)),
    );
  }

  // ── PAGE 4 — Paramètres du Poste ───────────────────────────────────────

  List<pw.Widget> _page4Content(PorPromeshModel m) {
    return [
      _sectionTitle('Paramètres du Poste'),
      _sectionCard('Tableau P1', [
        _unifiedProcessTable(m.processControl, valueKey: 'valeurP1', corKey: 'corP1', withIcon: true),
      ]),
      pw.SizedBox(height: 6),
      _sectionCard('Tableau P2', [
        _unifiedProcessTable(m.processControl, valueKey: 'valeurP2', corKey: 'corP2', withIcon: true),
      ]),
      pw.SizedBox(height: 6),
      _sectionTitle('Historique'),
      _sectionCard('Traçabilité', [
        _kv('Créé par', (m.creator?['email']?.trim().isNotEmpty ?? false) ? m.creator!['email']! : safeValue(m.createdBy)),
        _kv('Créé le', _formatDateTime(m.createdAt)),
        _kv('Modifié le', _formatDateTime(m.updatedAt)),
        _kv('Validé le', m.dateValidationProcess),
      ]),
    ];
  }

  String _formatDateTime(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    final d = DateTime.tryParse(iso);
    if (d == null) return safeValue(iso);
    return DateFormat('dd/MM/yyyy HH:mm').format(d);
  }

  /// Tableau "Paramètre × 08h20/COR/10h20/COR/14h20/COR" — même mise en
  /// page que le formulaire papier, réutilisé par les pages 3 et 4 (P1 ou
  /// P2 selon `valueKey`/`corKey`).
  pw.Widget _unifiedProcessTable(
    List<Map<String, dynamic>> processControl, {
    required String valueKey,
    required String corKey,
    bool withIcon = false,
  }) {
    final byBlocParam = <String, Map<String, dynamic>>{};
    for (final r in processControl) {
      final bloc = r['bloc']?.toString() ?? '';
      final param = r['parametre']?.toString() ?? '';
      byBlocParam['$bloc|$param'] = r;
    }

    pw.Widget headCell(String text) => pw.Padding(
          padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 5),
          child: pw.Text(text, style: pw.TextStyle(fontSize: 7.5, fontWeight: pw.FontWeight.bold, color: _pdfTextSub), textAlign: pw.TextAlign.center),
        );
    pw.Widget valueCell(String text) => pw.Padding(
          padding: const pw.EdgeInsets.symmetric(horizontal: 3, vertical: 4),
          child: pw.Text(text, style: pw.TextStyle(fontSize: 7.5, color: _pdfText), textAlign: pw.TextAlign.center),
        );
    pw.Widget corCell(bool ok) => pw.Padding(
          padding: const pw.EdgeInsets.symmetric(horizontal: 3, vertical: 4),
          child: pw.Text(ok ? 'OK' : '—', style: pw.TextStyle(fontSize: 7.5, fontWeight: pw.FontWeight.bold, color: ok ? _pdfSuccess : _pdfTextSub), textAlign: pw.TextAlign.center),
        );

    return pw.Table(
      border: pw.TableBorder.all(color: _pdfBorder, width: 0.5),
      columnWidths: const {
        0: pw.FlexColumnWidth(3.2),
        1: pw.FlexColumnWidth(1.3),
        2: pw.FlexColumnWidth(0.8),
        3: pw.FlexColumnWidth(1.3),
        4: pw.FlexColumnWidth(0.8),
        5: pw.FlexColumnWidth(1.3),
        6: pw.FlexColumnWidth(0.8),
      },
      children: [
        pw.TableRow(decoration: const pw.BoxDecoration(color: _pdfBg), children: [
          headCell('Paramètre'),
          for (final bloc in _kProcessBlocs) ...[headCell(bloc.$2), headCell('COR')],
        ]),
        for (final p in _kProcessParams)
          pw.TableRow(children: [
            pw.Padding(
              padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 4),
              child: pw.Row(children: [
                if (withIcon)
                  pw.Container(
                    width: 5,
                    height: 5,
                    margin: const pw.EdgeInsets.only(right: 4),
                    decoration: const pw.BoxDecoration(shape: pw.BoxShape.circle, color: _pdfPrimary),
                  ),
                pw.Expanded(child: pw.Text(p, style: pw.TextStyle(fontSize: 7.5, color: _pdfText))),
              ]),
            ),
            for (final bloc in _kProcessBlocs) ...[
              valueCell(safeValue(byBlocParam['${bloc.$1}|$p']?[valueKey])),
              corCell(byBlocParam['${bloc.$1}|$p']?[corKey] == true),
            ],
          ]),
      ],
    );
  }

  // ── LOGO / EN-TÊTE / PIED DE PAGE ──────────────────────────────────────

  /// Tente de charger le logo SVG officiel de l'application ; en cas
  /// d'échec (asset manquant ou SVG non supporté par le moteur de rendu du
  /// PDF), retombe sur un monogramme coloré — l'export ne doit jamais
  /// échouer pour une question de logo.
  Future<pw.Widget> _logoWidget() async {
    try {
      final svgString = await rootBundle.loadString('assets/icons/app_logo.svg');
      return pw.SvgImage(svg: svgString);
    } catch (_) {
      return _monogram();
    }
  }

  pw.Widget _monogram() {
    return pw.Container(
      decoration: pw.BoxDecoration(color: _pdfPrimary, borderRadius: pw.BorderRadius.circular(10)),
      alignment: pw.Alignment.center,
      child: pw.Text('CBI', style: pw.TextStyle(color: PdfColors.white, fontWeight: pw.FontWeight.bold, fontSize: 12)),
    );
  }

  pw.Widget _fullHeader(PorPromeshModel m, pw.Widget logo, String qrData) {
    final info = _statusInfo(m.status);
    return pw.Container(
      margin: const pw.EdgeInsets.only(bottom: 14),
      padding: const pw.EdgeInsets.only(bottom: 10),
      decoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(color: _pdfBorder, width: 1))),
      child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
        pw.SizedBox(width: 40, height: 40, child: logo),
        pw.SizedBox(width: 12),
        pw.Expanded(
          child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Text('FICHE POR PROMESH', style: pw.TextStyle(fontSize: 17, fontWeight: pw.FontWeight.bold, color: _pdfText)),
            pw.SizedBox(height: 2),
            pw.Text(m.numero ?? '', style: pw.TextStyle(fontSize: 9, color: _pdfTextSub)),
          ]),
        ),
        pw.SizedBox(width: 10),
        _statusBadge(info),
        if (qrData.isNotEmpty) ...[
          pw.SizedBox(width: 12),
          pw.BarcodeWidget(data: qrData, barcode: pw.Barcode.qrCode(), width: 44, height: 44, drawText: false),
        ],
      ]),
    );
  }

  pw.Widget _slimHeader(PorPromeshModel m, pw.Widget logo) {
    return pw.Container(
      margin: const pw.EdgeInsets.only(bottom: 10),
      padding: const pw.EdgeInsets.only(bottom: 6),
      decoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(color: _pdfBorder, width: 0.5))),
      child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.center, children: [
        pw.SizedBox(width: 16, height: 16, child: logo),
        pw.SizedBox(width: 8),
        pw.Text(m.numero ?? 'POR PROMESH', style: pw.TextStyle(fontSize: 9, color: _pdfTextSub)),
      ]),
    );
  }

  pw.Widget _footer(pw.Context context, String generatedAt, String generatedBy) {
    return pw.Container(
      margin: const pw.EdgeInsets.only(top: 8),
      padding: const pw.EdgeInsets.only(top: 6),
      decoration: const pw.BoxDecoration(border: pw.Border(top: pw.BorderSide(color: _pdfBorder, width: 0.5))),
      child: pw.Row(children: [
        pw.Expanded(
          child: pw.Text('Généré le $generatedAt par $generatedBy',
              style: pw.TextStyle(fontSize: 7.5, color: _pdfTextSub)),
        ),
        pw.Text('Page ${context.pageNumber} / ${context.pagesCount}',
            style: pw.TextStyle(fontSize: 7.5, color: _pdfTextSub)),
      ]),
    );
  }

  ({PdfColor color, String label}) _statusInfo(String status) {
    final s = status.toLowerCase();
    if (s.contains('valid')) return (color: _pdfSuccess, label: 'VALIDÉ');
    if (s.contains('reject') || s.contains('rejet')) return (color: _pdfDanger, label: 'REJETÉ');
    if (s.contains('submit') || s.contains('soumis')) return (color: _pdfInfo, label: 'SOUMIS');
    return (color: _pdfTextSub, label: 'BROUILLON');
  }

  pw.Widget _statusBadge(({PdfColor color, String label}) info) {
    return pw.Container(
      padding: const pw.EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: pw.BoxDecoration(color: info.color, borderRadius: pw.BorderRadius.circular(10)),
      child: pw.Text(info.label, style: pw.TextStyle(color: PdfColors.white, fontSize: 9, fontWeight: pw.FontWeight.bold)),
    );
  }

  pw.Widget _sectionTitle(String text) => pw.Padding(
        padding: const pw.EdgeInsets.only(bottom: 8),
        child: pw.Text(text.toUpperCase(), style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold, color: _pdfPrimary)),
      );

  // ── SHARED BUILDERS ──────────────────────────────────────────────────────

  pw.Widget _sectionCard(String title, List<pw.Widget> children) {
    return pw.Container(
      margin: const pw.EdgeInsets.only(bottom: 10),
      padding: const pw.EdgeInsets.all(10),
      decoration: pw.BoxDecoration(
        color: PdfColors.white,
        border: pw.Border.all(color: _pdfBorder, width: 0.7),
        borderRadius: pw.BorderRadius.circular(6),
      ),
      child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
        pw.Container(
          padding: const pw.EdgeInsets.only(bottom: 4),
          margin: const pw.EdgeInsets.only(bottom: 6),
          decoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(color: _pdfBorder, width: 0.5))),
          child: pw.Text(title.toUpperCase(),
              style: pw.TextStyle(fontSize: 10.5, fontWeight: pw.FontWeight.bold, color: _pdfPrimary)),
        ),
        ...children,
      ]),
    );
  }

  pw.Widget _kv(String label, String? value) => pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 1.5),
        child: pw.Row(children: [
          pw.SizedBox(width: 150, child: pw.Text(label, style: pw.TextStyle(fontSize: 9, color: _pdfTextSub))),
          pw.Expanded(
            child: pw.Text(safeValue(value),
                style: pw.TextStyle(fontSize: 9, color: _pdfText, fontWeight: pw.FontWeight.bold)),
          ),
        ]),
      );

  pw.Widget _kpiRow(List<(String, String)> items) {
    return pw.Row(
      children: items
          .map((e) => pw.Expanded(
                child: pw.Container(
                  margin: const pw.EdgeInsets.only(right: 6),
                  padding: const pw.EdgeInsets.all(8),
                  decoration: pw.BoxDecoration(
                    color: _pdfBg,
                    borderRadius: pw.BorderRadius.circular(6),
                    border: pw.Border.all(color: _pdfBorder, width: 0.5),
                  ),
                  child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
                    pw.Text(e.$2, style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: _pdfPrimary)),
                    pw.SizedBox(height: 2),
                    pw.Text(e.$1, style: pw.TextStyle(fontSize: 6.5, color: _pdfTextSub)),
                  ]),
                ),
              ))
          .toList(),
    );
  }

  pw.Widget _personChip(String label, String name) {
    return pw.Container(
      padding: const pw.EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: pw.BoxDecoration(
        color: _pdfBg,
        borderRadius: pw.BorderRadius.circular(10),
        border: pw.Border.all(color: _pdfBorder, width: 0.5),
      ),
      child: pw.Text('$name · $label', style: pw.TextStyle(fontSize: 8, color: _pdfText)),
    );
  }

  pw.Widget _table({
    required List<String> headers,
    required List<String> keys,
    required List<Map<String, dynamic>> rows,
    PdfColor? Function(String key, dynamic value)? cellColor,
  }) {
    if (rows.isEmpty) {
      return pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 4),
        child: pw.Text('Aucune donnée', style: pw.TextStyle(fontSize: 8, color: _pdfTextSub)),
      );
    }
    return pw.Table(
      border: pw.TableBorder.all(color: _pdfBorder, width: 0.5),
      children: [
        pw.TableRow(
          decoration: const pw.BoxDecoration(color: _pdfBg),
          children: headers
              .map((h) => pw.Padding(
                    padding: const pw.EdgeInsets.all(5),
                    child: pw.Text(h, style: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold, color: _pdfTextSub)),
                  ))
              .toList(),
        ),
        for (final row in rows)
          pw.TableRow(
            children: keys.map((k) {
              final raw = k == '__statut' ? (row['statutCOQ'] ?? row['statut']) : row[k];
              final text = safeValue(raw);
              final color = cellColor?.call(k, raw) ?? _pdfText;
              return pw.Padding(
                padding: const pw.EdgeInsets.all(5),
                child: pw.Text(text, style: pw.TextStyle(fontSize: 8, color: color, fontWeight: pw.FontWeight.bold)),
              );
            }).toList(),
          ),
      ],
    );
  }

  List<(String, String)> _personnelEntries(PorPromeshModel m) {
    const labels = {
      'responsable1': 'Responsable 1',
      'responsable2': 'Responsable 2',
      'operateur1': 'Opérateur 1',
      'operateur2': 'Opérateur 2',
      'aideOperateur': 'Aide Opérateur',
      'manoeuvre': 'Manœuvre',
      'stagiaire1': 'Stagiaire 1',
      'stagiaire2': 'Stagiaire 2',
    };
    final entries = <(String, String)>[];
    labels.forEach((key, label) {
      final v = (m.personnelActif[key] ?? '').trim();
      if (v.isNotEmpty) entries.add((label, v));
    });
    return entries;
  }

  String _joinNonEmpty(List<String?> values) {
    final parts = values.where((v) => (v ?? '').trim().isNotEmpty).toList();
    return parts.join(' / ');
  }

  String _fmt(num? v) {
    if (v == null || v.isNaN) return '';
    if (v == v.roundToDouble()) return v.toInt().toString();
    return v.toStringAsFixed(2);
  }
}
