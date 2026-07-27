// lib/forms/recuperables/service/recuperable_pdf_service.dart
//
// Export PDF client-side d'une fiche RÉCUPÉRABLES — même pattern que
// por_promesh_pdf_service.dart (thème Roboto Unicode, page A4, pied de
// page avec pagination), aucun document officiel de référence ici (rapport
// interne, pas de mise en page imposée). Le tableau reflète la grille
// fixe des 12 diamètres (Ø6 à Ø28).

import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import 'package:dash_master_toolkit/forms/por_promesh/utils/por_promesh_pdf_theme.dart';

import '../model/recuperable_models.dart';

const _pdfGreen = PdfColor.fromInt(0xFF16A34A);
const _pdfBorder = PdfColor.fromInt(0xFFE2E8F0);
const _pdfText = PdfColor.fromInt(0xFF0F172A);
const _pdfTextSub = PdfColor.fromInt(0xFF64748B);

class RecuperablePdfService {
  static final RecuperablePdfService instance = RecuperablePdfService._();
  RecuperablePdfService._();

  Future<void> exportPdf(RecuperableFicheModel f) async {
    final doc = await _buildDocument(f);
    await Printing.sharePdf(bytes: await doc.save(), filename: 'recuperable-${f.id ?? DateTime.now().millisecondsSinceEpoch}.pdf');
  }

  Future<void> printPdf(RecuperableFicheModel f) async {
    final doc = await _buildDocument(f);
    await Printing.layoutPdf(onLayout: (_) => doc.save());
  }

  Future<pw.Document> _buildDocument(RecuperableFicheModel f) async {
    final doc = pw.Document(theme: await robotoPdfTheme());
    final statutLabel = f.isOpen ? 'En cours' : 'Terminée';

    doc.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.fromLTRB(28, 24, 28, 32),
      footer: (ctx) => pw.Text('Page ${ctx.pageNumber} / ${ctx.pagesCount}',
          style: pw.TextStyle(fontSize: 8, color: _pdfTextSub), textAlign: pw.TextAlign.center),
      build: (ctx) => [
        pw.Text('Fiche Récupérables Traités', style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold, color: _pdfGreen)),
        pw.SizedBox(height: 4),
        pw.Text('Référence : ${f.id ?? "-"}', style: const pw.TextStyle(fontSize: 9, color: _pdfTextSub)),
        pw.SizedBox(height: 16),

        _sectionTitle('Informations générales'),
        _infoGrid([
          ('Module', f.module),
          ('Date', f.date),
          ('Machine', 'Machine ${f.machine}'),
          ('Ligne', f.ligne),
          ('Poste', f.posteLabel),
          ('Opérateur', (f.operateur ?? '').trim().isEmpty ? '-' : f.operateur!),
          ('Statut', statutLabel),
          ('Date création', f.createdAt ?? '-'),
        ]),
        pw.SizedBox(height: 16),

        _sectionTitle('Totaux'),
        _infoGrid([
          ('Total Déchet', '${f.totalDechetKg.toStringAsFixed(2)} kg'),
          ('Total Déchet + Produit fini', '${f.totalDechetProduitFiniKg.toStringAsFixed(2)} kg'),
        ]),
        pw.SizedBox(height: 16),

        _sectionTitle('RÉCUPÉRABLE TRAITÉ'),
        _diametreTable(f),

        pw.SizedBox(height: 16),
        pw.Text('Généré le ${DateFormat('dd/MM/yyyy HH:mm').format(DateTime.now())}',
            style: const pw.TextStyle(fontSize: 8, color: _pdfTextSub)),
      ],
    ));

    return doc;
  }

  pw.Widget _sectionTitle(String text) => pw.Padding(
        padding: const pw.EdgeInsets.only(bottom: 8),
        child: pw.Text(text, style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold, color: _pdfText)),
      );

  pw.Widget _infoGrid(List<(String, String)> rows) {
    return pw.Table(
      border: pw.TableBorder.all(color: _pdfBorder, width: 0.5),
      columnWidths: {0: const pw.FlexColumnWidth(2), 1: const pw.FlexColumnWidth(3)},
      children: [
        for (final r in rows)
          pw.TableRow(children: [
            pw.Padding(
              padding: const pw.EdgeInsets.all(6),
              child: pw.Text(r.$1, style: pw.TextStyle(fontSize: 9.5, fontWeight: pw.FontWeight.bold, color: _pdfTextSub)),
            ),
            pw.Padding(
              padding: const pw.EdgeInsets.all(6),
              child: pw.Text(r.$2, style: const pw.TextStyle(fontSize: 10, color: _pdfText)),
            ),
          ]),
      ],
    );
  }

  String _fmt(double v) => v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(2);

  pw.Widget _diametreTable(RecuperableFicheModel f) {
    const headers = ['Diamètre', 'Déchet (kg)', 'Déchet + Produit fini (kg)'];
    return pw.Table(
      border: pw.TableBorder.all(color: _pdfBorder, width: 0.5),
      columnWidths: const {
        0: pw.FlexColumnWidth(1),
        1: pw.FlexColumnWidth(1.5),
        2: pw.FlexColumnWidth(1.5),
      },
      children: [
        pw.TableRow(
          decoration: const pw.BoxDecoration(color: PdfColor.fromInt(0xFFF1F5F9)),
          children: [
            for (final h in headers)
              pw.Padding(
                padding: const pw.EdgeInsets.all(6),
                child: pw.Text(h, textAlign: pw.TextAlign.center, style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: _pdfText)),
              ),
          ],
        ),
        for (final d in kRecuperableDiametres)
          pw.TableRow(children: [
            _cell('Ø$d', bold: true),
            _cell(_fmt(f.itemFor(d).dechetKg)),
            _cell(_fmt(f.itemFor(d).dechetProduitFiniKg)),
          ]),
      ],
    );
  }

  pw.Widget _cell(String text, {bool bold = false}) => pw.Padding(
        padding: const pw.EdgeInsets.all(6),
        child: pw.Text(text,
            textAlign: pw.TextAlign.center,
            style: pw.TextStyle(fontSize: 9, color: _pdfText, fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal)),
      );
}
