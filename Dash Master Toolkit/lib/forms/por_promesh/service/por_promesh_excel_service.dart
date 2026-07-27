// lib/forms/por_promesh/service/por_promesh_excel_service.dart
//
// Client-side Excel (.xlsx) export for a POR PROMESH record. Mirrors the
// dart:html download pattern already used for the Excel export in
// lib/forms/view/projects_explorer_screen.dart.

import 'dart:html' as html;

import 'package:excel/excel.dart' as xl;

import '../model/por_promesh_model.dart';
import '../utils/por_promesh_safe_value.dart';

class PorPromeshExcelService {
  static final PorPromeshExcelService instance = PorPromeshExcelService._();
  PorPromeshExcelService._();

  // Mêmes paramètres / blocs fixes que la grille "Contrôle Process PROMESH"
  // du formulaire (lib/forms/por_promesh/controller/por_promesh_controller.dart).
  static const _kProcessParams = [
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

  static const _kProcessBlocs = [
    ('controle_08h20', '08H20'),
    ('controle_10h20', '10H20'),
    ('controle_14h20', '14H20'),
  ];

  void export(PorPromeshModel m) {
    final excelFile = xl.Excel.createExcel();
    final sheet = excelFile['POR PROMESH'];
    excelFile.delete('Sheet1');

    int row = _title(sheet, 0, '${m.numero ?? "Fiche POR PROMESH"}  ·  Statut : ${m.status}');
    row++;

    row = _sectionHeader(sheet, row, '1. Contrôle Production');
    row = _kv(sheet, row, 'Date Production', m.dateProduction);
    row = _kv(sheet, row, 'Heure Début', m.heureDebut);
    row = _kv(sheet, row, 'Heure Fin', m.heureFin);
    row = _kv(sheet, row, 'Diamètre Maille 1', m.diametreMaille1);
    row = _kv(sheet, row, 'Diamètre Maille 2', m.diametreMaille2);
    row = _kv(sheet, row, 'Diamètre Maille 3', m.diametreMaille3);
    row = _kv(sheet, row, 'Production (m²)', m.productionM2?.toString());
    row = _kv(sheet, row, 'Démarrage Production Heure 1', m.demarrageProductionHeure1);
    row = _kv(sheet, row, 'Démarrage Production Quantité 1', m.demarrageProductionQuantite1?.toString());
    row = _kv(sheet, row, 'Démarrage Production Heure 2', m.demarrageProductionHeure2);
    row = _kv(sheet, row, 'Démarrage Production Quantité 2', m.demarrageProductionQuantite2?.toString());
    row++;

    row = _kv(sheet, row, 'Responsable 1', m.personnelActif['responsable1']);
    row = _kv(sheet, row, 'Responsable 2', m.personnelActif['responsable2']);
    row = _kv(sheet, row, 'Opérateur 1', m.personnelActif['operateur1']);
    row = _kv(sheet, row, 'Opérateur 2', m.personnelActif['operateur2']);
    row = _kv(sheet, row, 'Aide Opérateur', m.personnelActif['aideOperateur']);
    row = _kv(sheet, row, 'Manœuvre', m.personnelActif['manoeuvre']);
    row = _kv(sheet, row, 'Stagiaire 1', m.personnelActif['stagiaire1']);
    row = _kv(sheet, row, 'Stagiaire 2', m.personnelActif['stagiaire2']);
    row++;

    row = _table(sheet, row, 'Arrêts Machine', const ['T.Arrêt', 'Observation'],
        const ['tArret', 'observationMachine'], m.arretsMachine);
    row = _table(
        sheet,
        row,
        'Consommation Production',
        const ['Désignation', 'Métrage', 'Observation'],
        const ['designationArticle', 'metrage', 'observation'],
        m.consommations);

    row = _kv(sheet, row, 'Heure Fin Travail', m.heureFinTravail);
    row = _kv(sheet, row, "Total Main d'Œuvre", m.totalMainOeuvre?.toString());
    row = _kv(sheet, row, 'Total Chute Barres', m.totalChuteBarres?.toString());
    row = _kv(sheet, row, 'Total Déchet Graine', m.totalDechetGraine?.toString());
    row++;

    row = _kv(sheet, row, 'Visa Production', m.visaProduction);
    row = _kv(sheet, row, 'Visa Contrôleur Qualité', m.visaControleQualite);
    row = _kv(sheet, row, 'Visa Direction', m.visaDirection);
    row++;

    row = _sectionHeader(sheet, row, '2. Plan de Process PROMESH');
    row = _kv(sheet, row, 'Air', m.air);
    row = _kv(sheet, row, "Niveau Bain d'Eau", m.niveauBainEau);
    row = _kv(sheet, row, 'Température Eau', m.temperatureEau?.toString());
    row = _kv(sheet, row, 'Température des Pistons', m.temperaturePistons?.toString());
    row = _kv(sheet, row, 'État Pistons', m.etatPistons);
    row = _kv(sheet, row, 'Fluide Visuel', m.fluideVisuel);
    row = _kv(sheet, row, 'État Disque Coupe', m.etatDisqueCoupe);
    row++;

    row = _sectionHeader(sheet, row, '3. Contrôle Qualité');
    row = _table(
      sheet,
      row,
      'Relevés de Contrôle (toutes les 3 heures)',
      const ['Heure', 'N° Plaque', 'Maille', 'Longueur', 'Largeur', 'C/NC'],
      const ['heure', 'numeroPlaque', 'maille', 'longueur', 'largeur', '__statut'],
      m.controlesQualite,
    );

    row = _sectionHeader(sheet, row, '4. Contrôle Process PROMESH');
    for (final bloc in _kProcessBlocs) {
      final rowsForBloc = m.processControl.where((r) => r['bloc']?.toString() == bloc.$1).toList();
      final byParam = {
        for (final r in rowsForBloc) (r['parametre']?.toString() ?? ''): r,
      };
      final tableRows = _kProcessParams
          .map((p) => {
                'parametre': p,
                'valeurP1': byParam[p]?['valeurP1'],
                'corP1': byParam[p]?['corP1'] == true ? 'OK' : '',
                'valeurP2': byParam[p]?['valeurP2'],
                'corP2': byParam[p]?['corP2'] == true ? 'OK' : '',
              })
          .toList();
      row = _table(
        sheet,
        row,
        'Contrôle ${bloc.$2}',
        const ['Paramètre', 'P1', 'COR', 'P2', 'COR'],
        const ['parametre', 'valeurP1', 'corP1', 'valeurP2', 'corP2'],
        tableRows,
      );
    }

    sheet.setColWidth(0, 32);
    sheet.setColWidth(1, 24);
    for (int c = 2; c < 6; c++) {
      sheet.setColWidth(c, 18);
    }

    final bytes = excelFile.encode();
    if (bytes == null) throw Exception('Échec de la génération du fichier Excel');
    _downloadBytes(bytes, 'por-promesh-${m.id ?? DateTime.now().millisecondsSinceEpoch}.xlsx');
  }

  int _title(xl.Sheet sheet, int row, String text) {
    sheet.merge(
      xl.CellIndex.indexByColumnRow(columnIndex: 0, rowIndex: row),
      xl.CellIndex.indexByColumnRow(columnIndex: 5, rowIndex: row),
    );
    sheet.cell(xl.CellIndex.indexByColumnRow(columnIndex: 0, rowIndex: row))
      ..value = text
      ..cellStyle = xl.CellStyle(bold: true, fontSize: 14, backgroundColorHex: '#6366F1', fontColorHex: '#FFFFFF');
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
    sheet.cell(xl.CellIndex.indexByColumnRow(columnIndex: 1, rowIndex: row)).value = safeValue(value);
    return row + 1;
  }

  int _table(
    xl.Sheet sheet,
    int row,
    String title,
    List<String> headers,
    List<String> keys,
    List<Map<String, dynamic>> rows,
  ) {
    sheet.cell(xl.CellIndex.indexByColumnRow(columnIndex: 0, rowIndex: row))
      ..value = title
      ..cellStyle = xl.CellStyle(bold: true, italic: true);
    row++;

    for (int c = 0; c < headers.length; c++) {
      sheet.cell(xl.CellIndex.indexByColumnRow(columnIndex: c, rowIndex: row))
        ..value = headers[c]
        ..cellStyle = xl.CellStyle(bold: true, backgroundColorHex: '#F8FAFC');
    }
    row++;

    if (rows.isEmpty) {
      sheet.cell(xl.CellIndex.indexByColumnRow(columnIndex: 0, rowIndex: row)).value = 'Aucune donnée';
      return row + 1;
    }

    for (final r in rows) {
      for (int c = 0; c < keys.length; c++) {
        final key = keys[c];
        final raw = key == '__statut' ? (r['statutCOQ'] ?? r['statut']) : r[key];
        sheet.cell(xl.CellIndex.indexByColumnRow(columnIndex: c, rowIndex: row)).value = safeValue(raw);
      }
      row++;
    }
    return row + 1;
  }

  void _downloadBytes(List<int> bytes, String name) {
    final blob = html.Blob(
      [bytes],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    final url = html.Url.createObjectUrlFromBlob(blob);
    html.AnchorElement(href: url)
      ..setAttribute('download', name)
      ..click();
    html.Url.revokeObjectUrl(url);
  }
}
