// lib/forms/recuperables/service/recuperable_excel_service.dart
//
// Export Excel (.xlsx) client-side d'une fiche RÉCUPÉRABLES — même pattern
// dart:html que por_promesh_excel_service.dart (web uniquement).

import 'dart:html' as html;

import 'package:excel/excel.dart' as xl;

import '../model/recuperable_models.dart';

class RecuperableExcelService {
  static final RecuperableExcelService instance = RecuperableExcelService._();
  RecuperableExcelService._();

  void export(RecuperableFicheModel f) {
    final excelFile = xl.Excel.createExcel();
    final sheet = excelFile['Récupérables'];
    excelFile.delete('Sheet1');

    int row = _title(sheet, 0, 'Fiche Récupérables Traités — ${f.module} · Machine ${f.machine}');
    row++;

    row = _sectionHeader(sheet, row, 'Informations générales');
    row = _kv(sheet, row, 'Module', f.module);
    row = _kv(sheet, row, 'Date', f.date);
    row = _kv(sheet, row, 'Machine', f.machine);
    row = _kv(sheet, row, 'Ligne', f.ligne);
    row = _kv(sheet, row, 'Poste', f.posteLabel);
    row = _kv(sheet, row, 'Opérateur', f.operateur);
    row = _kv(sheet, row, 'Statut', f.isOpen ? 'En cours' : 'Terminée');
    row = _kv(sheet, row, 'Date création', f.createdAt);
    row++;

    row = _sectionHeader(sheet, row, 'Totaux');
    row = _kv(sheet, row, 'Total Déchet (kg)', f.totalDechetKg.toStringAsFixed(2));
    row = _kv(sheet, row, 'Total Déchet + Produit fini (kg)', f.totalDechetProduitFiniKg.toStringAsFixed(2));
    row++;

    sheet.cell(xl.CellIndex.indexByColumnRow(columnIndex: 0, rowIndex: row))
      ..value = 'RÉCUPÉRABLE TRAITÉ'
      ..cellStyle = xl.CellStyle(bold: true, italic: true);
    row++;

    const headers = ['Diamètre', 'Déchet (kg)', 'Déchet + Produit fini (kg)'];
    for (int c = 0; c < headers.length; c++) {
      sheet.cell(xl.CellIndex.indexByColumnRow(columnIndex: c, rowIndex: row))
        ..value = headers[c]
        ..cellStyle = xl.CellStyle(bold: true, backgroundColorHex: '#F1F5F9');
    }
    row++;

    for (final d in kRecuperableDiametres) {
      final item = f.itemFor(d);
      sheet.cell(xl.CellIndex.indexByColumnRow(columnIndex: 0, rowIndex: row)).value = 'Ø$d';
      sheet.cell(xl.CellIndex.indexByColumnRow(columnIndex: 1, rowIndex: row)).value = item.dechetKg;
      sheet.cell(xl.CellIndex.indexByColumnRow(columnIndex: 2, rowIndex: row)).value = item.dechetProduitFiniKg;
      row++;
    }

    sheet.setColWidth(0, 14);
    sheet.setColWidth(1, 18);
    sheet.setColWidth(2, 24);

    final bytes = excelFile.encode();
    if (bytes == null) throw Exception('Échec de la génération du fichier Excel');
    _downloadBytes(bytes, 'recuperable-${f.id ?? DateTime.now().millisecondsSinceEpoch}.xlsx');
  }

  int _title(xl.Sheet sheet, int row, String text) {
    sheet.merge(
      xl.CellIndex.indexByColumnRow(columnIndex: 0, rowIndex: row),
      xl.CellIndex.indexByColumnRow(columnIndex: 5, rowIndex: row),
    );
    sheet.cell(xl.CellIndex.indexByColumnRow(columnIndex: 0, rowIndex: row))
      ..value = text
      ..cellStyle = xl.CellStyle(bold: true, fontSize: 14, backgroundColorHex: '#16A34A', fontColorHex: '#FFFFFF');
    return row + 1;
  }

  int _sectionHeader(xl.Sheet sheet, int row, String text) {
    sheet.merge(
      xl.CellIndex.indexByColumnRow(columnIndex: 0, rowIndex: row),
      xl.CellIndex.indexByColumnRow(columnIndex: 5, rowIndex: row),
    );
    sheet.cell(xl.CellIndex.indexByColumnRow(columnIndex: 0, rowIndex: row))
      ..value = text
      ..cellStyle = xl.CellStyle(bold: true, backgroundColorHex: '#E2E8F0', fontColorHex: '#0F172A');
    return row + 1;
  }

  int _kv(xl.Sheet sheet, int row, String label, String? value) {
    sheet.cell(xl.CellIndex.indexByColumnRow(columnIndex: 0, rowIndex: row))
      ..value = label
      ..cellStyle = xl.CellStyle(bold: true, fontColorHex: '#64748B');
    sheet.cell(xl.CellIndex.indexByColumnRow(columnIndex: 1, rowIndex: row)).value = value ?? '-';
    return row + 1;
  }

  void _downloadBytes(List<int> bytes, String name) {
    final blob = html.Blob([bytes], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    final url = html.Url.createObjectUrlFromBlob(blob);
    html.AnchorElement(href: url)
      ..setAttribute('download', name)
      ..click();
    html.Url.revokeObjectUrl(url);
  }
}
