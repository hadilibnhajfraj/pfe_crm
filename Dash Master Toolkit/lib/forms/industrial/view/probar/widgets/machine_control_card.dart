// lib/forms/industrial/view/probar/widgets/machine_control_card.dart
//
// Card "Contrôle Machine" de l'écran Détail PROBAR — chips colorés
// (Bon/vert, Moyen/orange, Mauvais/rouge) pour chaque paramètre d'état
// machine, + les mesures Heure/Longueur/Grammage/Diamètre de la ligne de
// production correspondant à la machine de cette fiche (une seule ligne,
// voir `_lineIndexForMachine` dans `probar_controle_machine_screen.dart` —
// même mapping Machine 1→L1 / 2→L2 / 3→L3 / 4→L4).
//
// Le module PROBAR n'a plus de section "Contrôle Process" (supprimée de
// l'interface — plus aucun affichage ici).
import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/modules/controle_qualite/cq_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

import 'probar_value_chip.dart';

const _kLines = ['L1', 'L2', 'L3', 'L4'];

class MachineControlCard extends StatelessWidget {
  final Map<String, String?> machineControl;
  final Map<String, String?> qualiteMesures;
  final String machine;

  const MachineControlCard({
    super.key,
    required this.machineControl,
    required this.qualiteMesures,
    required this.machine,
  });

  // Même mapping que l'écran de saisie (probar_controle_machine_screen.dart,
  // _lineIndexForMachine) : Machine 1→L1, 2→L2, 3→L3, 4→L4.
  int get _lineIndex => ((int.tryParse(machine) ?? 1) - 1).clamp(0, 3);

  static const _fields = [
    ('air', 'Air'),
    ('niveauBainEau', 'Niveau Bain Eau'),
    ('temperatureEau', 'Température Eau'),
    ('etatPistons', 'État Pistons'),
    ('fuiteVisuelle', 'Fuite Visuelle'),
    ('etatDisqueCoupe', 'État Disque de Coupe'),
    ('bobine', 'Bobine'),
    ('nombreBobines', 'Nombre des bobines'),
    ('resistance', 'Résistance'),
    ('fourZone1', 'Four — Zone 1'),
    ('fourZone2', 'Four — Zone 2'),
    ('fourZone3', 'Four — Zone 3'),
    ('bainEauFiltre', "Bain d'eau et Filtre"),
    ('machineCeinture', 'Machine Ceinture'),
    ('machineBobinage', 'Machine Bobinage'),
  ];

  bool get _hasAnyValue => machineControl.values.any((v) => (v ?? '').trim().isNotEmpty) ||
      qualiteMesures.values.any((v) => (v ?? '').trim().isNotEmpty);

  // Ne considère que la ligne mappée à cette machine (voir _lineIndex) pour
  // décider d'afficher la section mesures — les 3 autres jeux de champs
  // restent dans les données mais ne doivent plus apparaître ici.
  bool get _currentLineHasValue {
    final n = _lineIndex + 1;
    return [
      qualiteMesures['l${n}h'],
      qualiteMesures['l${n}l'],
      qualiteMesures['l${n}m'],
      qualiteMesures['l${n}d'],
      qualiteMesures['tp'],
    ]
        .any((v) => (v ?? '').trim().isNotEmpty);
  }

  @override
  Widget build(BuildContext context) {
    if (!_hasAnyValue) {
      return CqCardSurface(
        child: Text(AppLocalizations.of(context).translate('Aucune donnée de contrôle machine enregistrée.'),
            style: tInter(fontSize: 12, color: kCrmTextSub)),
      );
    }

    final justification = (machineControl['justification'] ?? '').trim();

    return CqCardSurface(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 10, runSpacing: 10, children: [
          for (final f in _fields) ProbarValueChip(label: f.$2, value: machineControl[f.$1]),
        ]),
        if (justification.isNotEmpty) ...[
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
                color: kCrmWarning.withOpacity(0.06),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: kCrmWarning.withOpacity(0.3))),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.note_alt_outlined, size: 14, color: kCrmWarning),
              const SizedBox(width: 8),
              Expanded(child: Text(justification, style: tInter(fontSize: 12, color: kCrmText))),
            ]),
          ),
        ],
        if (_currentLineHasValue) ...[
          const SizedBox(height: 16),
          CqCardHeader(
            icon: Icons.straighten_rounded,
            title: '${AppLocalizations.of(context).translate('Mesures Qualité — Ligne')} ${_lineIndex + 1} '
                '(${AppLocalizations.of(context).translate('Heure')} / ${AppLocalizations.of(context).translate('Longueur')} / '
                '${AppLocalizations.of(context).translate('Grammage')} / ${AppLocalizations.of(context).translate('Diamètre')})',
            color: const Color(0xFF3B82F6),
          ),
          const SizedBox(height: 10),
          _mesuresTable(context),
          if ((qualiteMesures['tp'] ?? '').trim().isNotEmpty) ...[
            const SizedBox(height: 10),
            Text('${AppLocalizations.of(context).translate('Température produit')} : ${qualiteMesures['tp']} °C',
                style: tInter(fontSize: 12, fontWeight: FontWeight.w700, color: kCrmText)),
          ],
        ],
      ]),
    );
  }

  Widget _mesuresTable(BuildContext context) {
    Widget headCell(String text) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: Text(AppLocalizations.of(context).translate(text),
              style: tInter(fontSize: 11, fontWeight: FontWeight.w800, color: kCrmTextSub)),
        );
    Widget cell(String? text, {String suffix = ''}) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: Text((text ?? '').trim().isEmpty ? '—' : '${text!.trim()}$suffix',
              style: tInter(fontSize: 12, fontWeight: FontWeight.w700, color: kCrmText)),
        );

    final n = _lineIndex + 1;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Table(
        border: TableBorder.all(color: kCrmBorder, borderRadius: BorderRadius.circular(6)),
        columnWidths: const {
          0: FixedColumnWidth(60),
          1: FixedColumnWidth(80),
          2: FixedColumnWidth(100),
          3: FixedColumnWidth(110),
          4: FixedColumnWidth(100),
        },
        children: [
          TableRow(decoration: BoxDecoration(color: kCrmBg), children: [
            headCell('Ligne'),
            headCell('Heure'),
            headCell('Longueur'),
            headCell('Grammage'),
            headCell('Diamètre'),
          ]),
          TableRow(children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              child: Text(_kLines[_lineIndex], style: tInter(fontSize: 12, fontWeight: FontWeight.w900, color: kCrmText)),
            ),
            cell(qualiteMesures['l${n}h']),
            cell(qualiteMesures['l${n}l'], suffix: ' mm'),
            cell(qualiteMesures['l${n}m'], suffix: ' g/m²'),
            cell(qualiteMesures['l${n}d'], suffix: ' mm'),
          ]),
        ],
      ),
    );
  }
}
