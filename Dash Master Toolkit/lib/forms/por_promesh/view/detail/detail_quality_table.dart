// lib/forms/por_promesh/view/detail/detail_quality_table.dart
//
// Tableau professionnel des mesures Contrôle Qualité Produit — colonnes
// Heure/N° Plaque/Maille/Longueur/Largeur/Statut, lignes alternées, badge
// Conforme (vert) / Non Conforme (rouge). Remplace l'ancien `_measureRow`
// (Wrap de texte brut) par un vrai tableau, scrollable horizontalement sur
// écran étroit — mêmes données (`m.controlesQualite`), même clés de champ.

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import '../modules/controle_qualite/cq_theme.dart';
import '../../utils/por_promesh_safe_value.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class QualityMeasuresTable extends StatelessWidget {
  final List<Map<String, dynamic>> rows;

  const QualityMeasuresTable({super.key, required this.rows});

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Text(AppLocalizations.of(context).translate('Aucune mesure enregistrée.'),
            style: tInter(fontSize: 12, color: kCrmTextSub)),
      );
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Table(
        border: TableBorder.all(color: kCrmBorder, borderRadius: BorderRadius.circular(kCqInnerRadius)),
        columnWidths: const {
          0: FixedColumnWidth(80),
          1: FixedColumnWidth(110),
          2: FixedColumnWidth(90),
          3: FixedColumnWidth(90),
          4: FixedColumnWidth(90),
          5: FixedColumnWidth(120),
        },
        children: [
          TableRow(decoration: BoxDecoration(color: kMaintenanceColor.withOpacity(0.08)), children: [
            _headCell(context, 'Heure'),
            _headCell(context, 'N° Plaque'),
            _headCell(context, 'Maille'),
            _headCell(context, 'Longueur'),
            _headCell(context, 'Largeur'),
            _headCell(context, 'Statut'),
          ]),
          for (int i = 0; i < rows.length; i++) _dataRow(context, i, rows[i]),
        ],
      ),
    );
  }

  TableRow _dataRow(BuildContext context, int index, Map<String, dynamic> row) {
    final statut = (row['statutCOQ'] ?? row['statut'])?.toString();
    final odd = index.isOdd;
    return TableRow(
      decoration: BoxDecoration(color: odd ? kCrmBg.withOpacity(0.5) : kCrmSurface),
      children: [
        _valueCell(safeValue(row['heure'])),
        _valueCell(safeValue(row['numeroPlaque'])),
        _valueCell(safeValue(row['maille'])),
        _valueCell(safeValue(row['longueur'])),
        _valueCell(safeValue(row['largeur'])),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: statut == 'C'
              ? _badge(context, 'Conforme', kCrmSuccess, Icons.check_circle_rounded)
              : statut == 'NC'
                  ? _badge(context, 'Non Conforme', kCrmDanger, Icons.cancel_rounded)
                  : Text('—', style: tInter(fontSize: 11.5, color: kCrmTextSub)),
        ),
      ],
    );
  }

  Widget _headCell(BuildContext context, String text) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        child: Text(AppLocalizations.of(context).translate(text),
            style: tInter(fontSize: 10.5, fontWeight: FontWeight.w800, color: kMaintenanceColor)),
      );

  Widget _valueCell(String text) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Text(text.isEmpty ? '—' : text,
            style: tInter(fontSize: 11.5, fontWeight: FontWeight.w700, color: kCrmText)),
      );

  Widget _badge(BuildContext context, String label, Color color, IconData icon) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 12, color: color),
        const SizedBox(width: 4),
        Text(AppLocalizations.of(context).translate(label),
            style: tInter(fontSize: 10.5, fontWeight: FontWeight.w700, color: color)),
      ]),
    );
  }
}
